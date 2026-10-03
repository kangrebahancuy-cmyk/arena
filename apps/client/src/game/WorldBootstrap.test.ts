// @vitest-environment happy-dom
import { createLogger } from '@project-realm/shared';
import type { Logger, LogRecord } from '@project-realm/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readClientConfig } from '../config/clientConfig';
import type { RenderCommand, Viewport } from '../render/scene';
import type { RenderStats, RendererInitOptions, WorldRenderer } from '../render/WorldRenderer';
import { startWorld } from './WorldBootstrap';

const CONFIG = readClientConfig({ DEV: true }, '9.9.9-test');

/** A renderer that records what the bootstrap asked of it. */
class FakeRenderer implements WorldRenderer {
  readonly backend = 'fake';
  readonly initOptions: RendererInitOptions[] = [];
  destroyed = false;
  private readonly failInit: boolean;

  constructor(failInit = false) {
    this.failInit = failInit;
  }

  init(options: RendererInitOptions): Promise<void> {
    this.initOptions.push(options);
    return this.failInit ? Promise.reject(new Error('device lost')) : Promise.resolve();
  }

  apply(_commands: readonly RenderCommand[]): void {
    void _commands;
  }

  render(_deltaSeconds: number): RenderStats {
    return { visibleTiles: 410, visibleObjects: 12, visibleActors: 3, visibleEffects: 0 };
  }

  resize(_viewport: Viewport, _resolution: number): void {
    void _viewport;
    void _resolution;
  }

  setPixelated(_pixelated: boolean): void {
    void _pixelated;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

/** A logger that discards everything: these tests assert on behaviour, not on log output. */
function silentLogger(): Logger {
  return createLogger({ name: 'test', threshold: 'silent', sink: () => undefined });
}

function root(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.stubGlobal('innerWidth', 800);
  vi.stubGlobal('innerHeight', 600);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('startWorld', () => {
  it('wires screen, renderer and input, then reports the world as ready', async () => {
    const container = root();
    const renderer = new FakeRenderer();
    const handle = await startWorld({
      root: container,
      config: CONFIG,
      logger: silentLogger(),
      createRenderer: () => renderer,
      devicePixelRatio: 3,
    });

    // The screen owns the canvas, and the renderer was given exactly it.
    expect(container.querySelector('canvas')).toBe(handle.screen.canvas);
    expect(renderer.initOptions[0]?.canvas).toBe(handle.screen.canvas);
    // Presentation settings come from the client config, and the pixel ratio is capped.
    expect(renderer.initOptions[0]?.background).toBe(CONFIG.renderer.background);
    expect(renderer.initOptions[0]?.pixelated).toBe(CONFIG.renderer.pixelated);
    expect(renderer.initOptions[0]?.resolution).toBe(CONFIG.renderer.maxPixelRatio);

    // The overlay is gone: the world is on screen.
    expect(
      container.querySelector('.world__overlay')?.classList.contains('world__overlay--hidden'),
    ).toBe(true);
    expect(handle.stage.isRunning).toBe(true);

    handle.stop();
    expect(renderer.destroyed).toBe(true);
    expect(container.childElementCount).toBe(0);
  });

  it('refreshes the HUD on its own timer, from real measurements', async () => {
    const container = root();
    const handle = await startWorld({
      root: container,
      config: CONFIG,
      logger: silentLogger(),
      createRenderer: () => new FakeRenderer(),
    });

    // A frame's worth of simulation, so the numbers are not all zero when the HUD reads them.
    handle.stage.tick(1 / CONFIG.game.simulation.hz);
    vi.advanceTimersByTime(200);

    const text = container.querySelector('.hud')?.textContent ?? '';
    expect(text).toContain('Greenfield');
    expect(text).toContain('fake');

    handle.stop();
  });

  it('drives the world from the keyboard through the input controller', async () => {
    const container = root();
    const handle = await startWorld({
      root: container,
      config: CONFIG,
      logger: silentLogger(),
      createRenderer: () => new FakeRenderer(),
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(handle.stage.currentIntent).toEqual({ moving: true, direction: 'east' });

    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    expect(handle.stage.currentIntent).toEqual({ moving: false, direction: 'east' });

    handle.stop();
  });

  it('shows the reason and cleans up when the renderer cannot start', async () => {
    const container = root();
    const renderer = new FakeRenderer(true);
    const logger = silentLogger();

    await expect(
      startWorld({ root: container, config: CONFIG, logger, createRenderer: () => renderer }),
    ).rejects.toThrow(/device lost/);

    const overlay = container.querySelector('.world__overlay');
    expect(overlay?.textContent).toContain('The world could not start');
    expect(overlay?.textContent).toContain('device lost');
    // The half-built renderer is destroyed rather than left running behind the error.
    expect(renderer.destroyed).toBe(true);
    // And nothing keeps ticking afterwards.
    vi.advanceTimersByTime(1_000);
    expect(container.querySelector('.hud')).not.toBeNull();
  });

  it('logs the failure through the client logger', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger({
      name: 'test',
      threshold: 'debug',
      sink: (record) => records.push(record),
    });

    await expect(
      startWorld({
        root: root(),
        config: CONFIG,
        logger,
        createRenderer: () => new FakeRenderer(true),
      }),
    ).rejects.toThrow();

    expect(records.some((record) => record.message.includes('world failed to start'))).toBe(true);
  });
});
