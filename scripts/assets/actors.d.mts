// Type declarations for actors.mjs (see tiles.d.mts for why these exist).
import type { GeneratedSheet } from './tiles.mjs';

export declare const ACTOR_FRAME_WIDTH: number;
export declare const ACTOR_FRAME_HEIGHT: number;
export declare const ACTOR_FRAMES: number;
/** Facing rows, top to bottom, as they are painted. */
export declare const ACTOR_FACINGS: readonly string[];
/** Appearance blocks, left to right, as they are painted. */
export declare const ACTOR_ORDER: readonly string[];
export declare function paintActorFrame(
  actorName: string,
  facing: string,
  frame: number,
): GeneratedSheet;
export declare function createActorsSheet(): GeneratedSheet;
