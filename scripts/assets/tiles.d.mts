// Type declarations for tiles.mjs, so TypeScript code (the client's manifest test) can import the
// generator's layout constants and check them against `apps/client/src/render/manifests.ts`.
// This is a view of the generator's public API, not a second implementation: the constants below are
// declared in tiles.mjs and never defined here.
export interface GeneratedSheet {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export declare const TILE_SIZE: number;
/** Tile ids in sheet order. The TypeScript manifest must list exactly these, in this order. */
export declare const TILE_ORDER: readonly string[];
export declare function paintTile(name: string): GeneratedSheet;
export declare function createTileset(): GeneratedSheet;
