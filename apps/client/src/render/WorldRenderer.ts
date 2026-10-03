import type { Logger } from '@project-realm/shared';
import type { AssetProgress } from './Assets';
import type { RenderCommand, Viewport } from './scene';

/**
 * The renderer port: what game code is allowed to ask of a renderer.
 *
 * `WorldSession` produces render commands, `GameClient` owns the lifecycle, and this interface is the
 * only thing either of them knows about drawing. Two consequences that matter:
 *
 *   - the renderer can be swapped (a WebGL renderer, a canvas fallback, or a null renderer in tests)
 *     without touching game code;
 *   - everything above this line is testable in Node, because nothing there imports PixiJS.
 */
export interface RendererInitOptions {
  /** The canvas PixiJS should take over. Created by the client, not by the renderer. */
  readonly canvas: HTMLCanvasElement;
  readonly viewport: Viewport;
  /** `window.devicePixelRatio`, clamped by the caller-owned quality setting. */
  readonly resolution: number;
  /** Background colour, as a PixiJS-compatible CSS string. */
  readonly background: string;
  /** Nearest-neighbour scaling and integer snapping (see `TextureLibrary.setPixelated`). */
  readonly pixelated: boolean;
  readonly logger?: Logger;
  /**
   * Real asset-loading progress: how many sheets are finished out of how many exist, and which file is
   * being read right now. The renderer owns its own assets (each backend has different formats and
   * uploading is backend-specific), so this is how a loading screen gets numbers that are true.
   */
  readonly onAssetProgress?: (progress: AssetProgress) => void;
}

/** What the renderer actually did this frame. Real counts, used by the debug HUD. */
export interface RenderStats {
  readonly visibleTiles: number;
  readonly visibleObjects: number;
  readonly visibleActors: number;
  readonly visibleEffects: number;
}

export interface WorldRenderer {
  /** Which backend PixiJS picked: `webgl`, `webgpu` or `canvas`. Reported to the player in the HUD. */
  readonly backend: string;

  init(options: RendererInitOptions): Promise<void>;

  /** Applies the commands produced by `diffScene`. Must be safe to call with an empty array. */
  apply(commands: readonly RenderCommand[]): void;

  /** Draws one frame and advances sprite animations by the elapsed time. */
  render(deltaSeconds: number): RenderStats;

  /** New size in CSS pixels, plus the current device pixel ratio. Must not lose the scene. */
  resize(viewport: Viewport, resolution: number): void;

  setPixelated(pixelated: boolean): void;

  destroy(): void;
}
