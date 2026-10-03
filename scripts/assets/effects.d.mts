// Type declarations for effects.mjs (see tiles.d.mts for why these exist).
import type { GeneratedSheet } from './tiles.mjs';

export declare const EFFECT_FRAME_SIZE: number;
export declare const EFFECT_ORDER: readonly string[];
export declare const EFFECT_FRAME_COUNT: number;
export declare function createEffectsSheet(): GeneratedSheet;
