// @vitest-environment happy-dom
import { createGameConfig } from '@project-realm/shared';
import type { Logger } from '@project-realm/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetProgress } from '../render/Assets';
import type { RenderCommand, Viewport } from '../render/scene';
import type { RenderStats, RendererInitOptions, WorldRenderer } from '../render/WorldRenderer';
import { WorldStage } from './WorldStage';

/** A renderer that records instead of drawing: the stage's whole contract, with no GPU involved. */
class FakeRenderer implements WorldRenderer {
  readonly backend = 'fake';
  readonly initOptions: RendererInitOptions[] = [];
  readonly resizes: { viewport: Viewport; resolution: number }[] = [];
  readonly applied: RenderCommand[] = [];
  readonly renderCalls: number[] = [];
  pixelated = true;
  destroyed = false;
  visibleTiles = 0;

  init(options: RendererInitOptions): Promise<void> {
    this.initOptions.push(options);
    this.pixelated = options.pixelated;
    return Promise.resolve();
  }

  apply(commands: readonly RenderCommand[]): void {
    this.applied.push(...commands);
  }

  render(deltaSeconds: number): RenderStats {
    this.renderCalls.push(deltaSeconds);
    return {
      visibleTiles: this.visibleTiles,
      visibleObjects: 3,
      visibleActors: 3,
      visibleEffects: 0,
    };
  }

  resize(viewport: Viewport, resolution: number): void {
    this.resizes.push({ viewport, resolution });
  }

  setPixelated(pixelated: boolean): void {
    this.pixelated = pixelated;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

function canvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

const GAME = createGameConfig();

let renderer: FakeRenderer;

beforeEach(() => {
  renderer = new FakeRenderer();
  // happy-dom has no animation frames in every version; the stage's own loop must not depend on them
  // for these tests, which drive it frame by frame through `tick`.
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.stubGlobal('innerWidth', 800);
  vi.stubGlobal('innerHeight', 600);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type StageOptions = ConstructorParameters<typeof WorldStage>[0];

async function startedStage(overrides: Partial<StageOptions> = {}) {
  const stage = new WorldStage({
    canvas: canvas(),
    game: GAME,
    playerId: 'local:test',
    playerName: 'Tester',
    background: '#000000',
    createRenderer: () => renderer,
    ...overrides,
  });
  const info = await stage.start();
  return { stage, info };
}

describe('WorldStage', () => {
  it('initialises the renderer with the measured viewport and the capped pixel ratio', async () => {
    const { info } = await startedStage({ devicePixelRatio: 3, pixelRatioCap: 2 });

    expect(info.backend).toBe('fake');
    expect(renderer.initOptions[0]?.viewport).toEqual({ width: 800, height: 600 });
    // A 3x screen would draw 9x the pixels; the cap is what keeps that affordable.
    expect(renderer.initOptions[0]?.resolution).toBe(2);
    expect(renderer.initOptions[0]?.canvas).toBeInstanceOf(HTMLCanvasElement);
  });

  it('never asks for a resolution below 1x, even if the browser reports a fractional ratio', async () => {
    await startedStage({ devicePixelRatio: 0.5 });
    expect(renderer.initOptions[0]?.resolution).toBe(1);
  });

  it('forwards real asset progress to whoever is interested', async () => {
    const progress: AssetProgress[] = [];
    await startedStage({ onAssetProgress: (entry: AssetProgress) => progress.push(entry) });

    const report = renderer.initOptions[0]?.onAssetProgress;
    expect(report).toBeTypeOf('function');
    report?.({ loaded: 1, total: 4, ratio: 0.25, current: 'assets/objects.png' });
    expect(progress).toEqual([{ loaded: 1, total: 4, ratio: 0.25, current: 'assets/objects.png' }]);
  });

  it('draws a frame per tick: simulation commands in, real stats out', async () => {
    const { stage } = await startedStage();

    renderer.visibleTiles = 420;
    stage.tick(1 / 60);

    expect(renderer.applied.some((command) => command.type === 'layer-added')).toBe(true);
    expect(renderer.applied.some((command) => command.type === 'actor-added')).toBe(true);
    // The loop paints one frame the moment it starts (delta 0, so the world cannot move on its own),
    // then one frame per tick.
    expect(renderer.renderCalls).toEqual([0, 1 / 60]);
    expect(stage.stats.visibleTiles).toBe(420);
    expect(stage.stats.visibleActors).toBe(3);
  });

  it('reports the zone, the player tile and the camera in its HUD snapshot', async () => {
    const { stage } = await startedStage();
    // One simulation step's worth of time (the fixed step is 1/hz), so a step really happened.
    stage.tick(1 / GAME.simulation.hz);

    const hud = stage.hud;
    expect(hud.zone).toBe('Greenhaven');
    expect(hud.area).toBe('Greenhaven Village');
    expect(hud.backend).toBe('fake');
    expect(hud.simulationHz).toBe(GAME.simulation.hz);
    expect(hud.steps).toBeGreaterThan(0);
    expect(hud.player.row).toBe(33);
    expect(hud.playerHealth).toBe('100/100 HP');
    expect(hud.monsters).toBe('3/3 active');
    expect(stage.attackNearestMonster()).toEqual({ status: 'out-of-range' });
    expect(hud.visible.tiles).toBe(0);
    expect(hud.viewport).toEqual({ width: 800, height: 600, resolution: 1 });
  });

  it('exposes nearby NPC and dialogue state through the game stage', async () => {
    const { stage } = await startedStage();

    expect(stage.nearbyNpc?.name).toBe('Village Elder');
    expect(stage.hud.nearbyNpc).toBe('Village Elder');
    expect(stage.interact()).toBe(true);
    expect(stage.dialogue?.npcName).toBe('Village Elder');
    expect(stage.chooseDialogueChoice('elder-leave')).toBe(true);
    expect(stage.dialogue).toBeNull();
    expect(stage.closeDialogue()).toBe(false);
  });

  it('resizes the renderer and the camera together when the window changes', async () => {
    const { stage } = await startedStage();
    stage.tick(1 / 60);

    vi.stubGlobal('innerWidth', 1280);
    vi.stubGlobal('innerHeight', 720);
    stage.handleResize();

    expect(renderer.resizes.at(-1)?.viewport).toEqual({ width: 1280, height: 720 });
    expect(stage.hud.viewport.width).toBe(1280);

    // The scene survives a resize: the same player and objects are still there, and the next frame
    // draws without re-sending the whole world.
    stage.tick(1 / 60);
    expect(stage.hud.zone).toBe('Greenhaven');
  });

  it('zooms in whole steps within the limits, and resets to the screen-appropriate zoom', async () => {
    const { stage } = await startedStage();
    const initial = stage.zoom;

    stage.zoomBy(1);
    expect(stage.zoom).toBe(initial + 1);

    for (let step = 0; step < 10; step += 1) {
      stage.zoomBy(1);
    }
    expect(stage.zoom).toBeLessThanOrEqual(6);

    stage.resetZoom();
    expect(stage.zoom).toBe(initial);
  });

  it('toggles pixel scaling on the renderer, not only in its own state', async () => {
    const { stage } = await startedStage();
    expect(stage.togglePixelated()).toBe(false);
    expect(renderer.pixelated).toBe(false);
    expect(stage.togglePixelated()).toBe(true);
    expect(renderer.pixelated).toBe(true);
  });

  it('keeps the intent it was given while the world was still starting', async () => {
    const stage = new WorldStage({
      canvas: canvas(),
      game: GAME,
      playerId: 'local:test',
      playerName: 'Tester',
      background: '#000000',
      createRenderer: () => renderer,
    });

    stage.setIntent({ moving: true, direction: 'east' });
    await stage.start();

    // Half a second of simulated time, delivered as real frames would deliver it: at the configured
    // rate, never as one giant delta (a single 0.5 s frame is beyond the catch-up bound on purpose).
    const steps = Math.round(0.5 * GAME.simulation.hz);
    for (let frame = 0; frame < steps; frame += 1) {
      stage.tick(1 / GAME.simulation.hz);
    }

    expect(stage.currentIntent).toEqual({ moving: true, direction: 'east' });
    expect(stage.hud.steps).toBe(steps);
    expect(stage.hud.player.direction).toBe('east');
    expect(stage.hud.player.movementState).toBe('moving');
    expect(stage.hud.player.animationState).toBe('walk');
    expect(stage.hud.player.speed).toBe(GAME.movement.playerSpeedTilesPerSecond);
  });

  it('pauses and resumes the loop', async () => {
    const { stage } = await startedStage();
    expect(stage.isRunning).toBe(true);

    stage.pause();
    expect(stage.isRunning).toBe(false);
    stage.resume();
    expect(stage.isRunning).toBe(true);
  });

  it('destroys the renderer and stops the loop when it is stopped', async () => {
    const { stage } = await startedStage();
    stage.stop();

    expect(renderer.destroyed).toBe(true);
    expect(stage.isRunning).toBe(false);
  });

  it('does not tick after being stopped, so nothing touches a destroyed renderer', async () => {
    const { stage } = await startedStage();
    stage.stop();
    const before = renderer.renderCalls.length;
    stage.tick(1 / 60);
    expect(renderer.renderCalls).toHaveLength(before);
  });

  it('logs the world becoming ready with the real backend', async () => {
    const events: string[] = [];
    const logger = {
      child: () => logger,
      info: (message: string) => events.push(message),
      debug: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      fatal: () => undefined,
      trace: () => undefined,
    } as unknown as Logger;

    await startedStage({ logger });
    expect(events).toContain('world ready');
  });
});
