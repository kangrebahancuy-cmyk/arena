import type { Logger } from '@project-realm/shared';
import type { ClientConfig } from '../config/clientConfig';
import type { WorldRenderer } from '../render/WorldRenderer';
import { InputController } from '../ui/InputController';
import { WorldScreen } from '../ui/WorldScreen';
import { PROTOTYPE_PLAYER_ID, PROTOTYPE_PLAYER_NAME } from './PrototypeWorld';
import { WorldStage } from './WorldStage';
import type { WorldStageOptions } from './WorldStage';

/** How often the debug HUD is refreshed. Fast enough to watch, slow enough to read. */
const HUD_INTERVAL_MS = 200;

export interface WorldBootstrapOptions {
  readonly root: HTMLElement;
  readonly config: ClientConfig;
  readonly logger: Logger;
  /** Overrides for tests: the renderer factory and the device pixel ratio. */
  readonly devicePixelRatio?: number;
  readonly createRenderer?: (logger?: Logger) => WorldRenderer;
}

export interface WorldBootstrapHandle {
  readonly stage: WorldStage;
  readonly screen: WorldScreen;
  readonly input: InputController;
  stop(): void;
}

/**
 * Starts the world and connects it to the page.
 *
 * This is the composition root of the rendering phase: the only module that knows the screen (DOM), the
 * stage (renderer + session + loop) and the input controller at the same time. Everything below it
 * stays ignorant of the others - the screen never imports game code, the stage never touches the DOM,
 * and the input controller never hears about the world.
 *
 * Order matters and is deliberate: the canvas exists before the renderer, the renderer and its sprite
 * sheets exist before the session draws anything, and the input is bound before the first frame so a
 * key held during loading is not lost.
 */
export async function startWorld(options: WorldBootstrapOptions): Promise<WorldBootstrapHandle> {
  const { root, config, logger } = options;
  const worldLogger = logger.child('world');

  // The screen must exist before the stage (the stage takes over the screen's canvas), while the
  // screen's callbacks need the stage. The holder closes that circle; the buttons cannot be clicked
  // before the world is ready, and `?.` makes that impossible state harmless.
  const holder: { stage?: WorldStage } = {};
  const screen = new WorldScreen(root, {
    onZoomIn: () => holder.stage?.zoomBy(1),
    onZoomOut: () => holder.stage?.zoomBy(-1),
    onResetZoom: () => holder.stage?.resetZoom(),
    onTogglePixelated: () => {
      holder.stage?.togglePixelated();
    },
  });

  const stage = new WorldStage({
    canvas: screen.canvas,
    game: config.game,
    // Prototype identity: local, and labelled as such in the HUD/screen (no login exists yet).
    playerId: PROTOTYPE_PLAYER_ID,
    playerName: PROTOTYPE_PLAYER_NAME,
    logger: worldLogger,
    background: config.renderer.background,
    pixelated: config.renderer.pixelated,
    pixelRatioCap: config.renderer.maxPixelRatio,
    ...(options.devicePixelRatio !== undefined
      ? { devicePixelRatio: options.devicePixelRatio }
      : {}),
    ...(options.createRenderer !== undefined ? { createRenderer: options.createRenderer } : {}),
    onAssetProgress: (progress) => {
      screen.setLoading(progress);
    },
  } satisfies WorldStageOptions);

  const input = new InputController({
    onIntent: (intent) => {
      stage.setIntent(intent);
    },
    onZoom: (steps) => {
      stage.zoomBy(steps);
    },
    onResetZoom: () => {
      stage.resetZoom();
    },
    onTogglePixelated: () => {
      stage.togglePixelated();
    },
  });
  holder.stage = stage;
  input.attach();
  input.bindDirectionButtons(screen.element);

  // HUD refresh on its own timer: the render loop must not do DOM work every frame.
  const hudTimer = setInterval(() => {
    screen.update(stage.hud);
  }, HUD_INTERVAL_MS);

  try {
    const { backend } = await stage.start();
    screen.update(stage.hud);
    screen.setReady({ backend, zone: stage.hud.zone, simulationHz: config.game.simulation.hz });
    logger.info('world screen ready', { backend });
  } catch (error) {
    // A failed start must be visible, and it must clean up after itself: leaving a half-built renderer
    // running behind an error overlay is how a "black canvas" bug becomes unexplainable.
    clearInterval(hudTimer);
    input.detach();
    stage.stop();
    const message = error instanceof Error ? error.message : 'Unknown error';
    screen.setFailed(message);
    logger.error('world failed to start', { message });
    throw error;
  }

  return {
    stage,
    screen,
    input,
    stop: () => {
      clearInterval(hudTimer);
      input.detach();
      stage.stop();
      screen.destroy();
    },
  };
}
