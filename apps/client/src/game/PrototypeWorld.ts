import {
  TILE_SIZE,
  buildTileLayer,
  createGameMap,
  type Direction,
  type GameMap,
  type Position,
} from '@project-realm/shared';

/**
 * The prototype zone: a hand-authored 64x40 tile area used to exercise the renderer.
 *
 * This is a RENDERER TEST BED, not game content. It exists so the camera, the tile grid, depth
 * sorting and culling have something real to draw, and it is deliberately written here in code rather
 * than loaded from a data file: the zod-validated map format and the map loader arrive in Phase 4
 * (`GameMapSchema` already exists and this map satisfies it), at which point this module is replaced
 * by loaded zone files.
 *
 * Every tile index refers to the generated tile sheet (`scripts/assets/tiles.mjs`):
 *   0 grass | 1 grass+flowers | 2 dirt | 3 water | 4 stone | 5 cloud (fog, drawn per unexplored tile)
 */
const TILE = {
  grass: 0,
  flowers: 1,
  dirt: 2,
  water: 3,
  stone: 4,
  cloud: 5,
} as const;

export const PROTOTYPE_ZONE = {
  id: 'greenfield',
  name: 'Greenfield',
  columns: 64,
  rows: 40,
  spawn: { x: 32.5, y: 20.5 } satisfies Position,
} as const;

/** Where the prototype walker starts. Documented so the spawn is not a magic number in the loop. */
export const PROTOTYPE_SPAWN: Position = PROTOTYPE_ZONE.spawn;

/**
 * Prototype identity, until accounts exist (Phase 11).
 *
 * These are LOCAL stand-ins, not server-issued values: the shared `PlayerIdSchema` is explicitly a
 * server-issued, opaque id that a client must never invent, and this phase has no login and no server
 * world. `local:` makes that unmistakable at a glance in the HUD, the code and any log line.
 */
export const PROTOTYPE_PLAYER_ID = 'local:prototype';
export const PROTOTYPE_PLAYER_NAME = 'Wanderer';

/**
 * Prototype ambience: two villagers on fixed patrol routes.
 *
 * They are NOT an NPC system. A real NPC is spawned, moved and removed by the authoritative server
 * (Phase 5), and this table disappears then. Until that exists, these routes are the honest way to
 * show animated actors, facing changes and depth sorting on the characters/NPC layers - plainly
 * labelled in the UI as prototype content, so nobody mistakes them for a game world.
 */
export interface PrototypePatrol {
  readonly id: string;
  readonly name: string;
  readonly appearance: string;
  readonly waypoints: readonly Position[];
  /** Tiles per second. Slow enough to read as walking, fast enough to see the walk cycle. */
  readonly speed: number;
}

export const PROTOTYPE_PATROLS: readonly PrototypePatrol[] = [
  {
    id: 'npc:gardener',
    name: 'Gardener',
    appearance: 'villager',
    waypoints: [
      { x: 22.5, y: 15.5 },
      { x: 28.5, y: 15.5 },
      { x: 28.5, y: 20.5 },
      { x: 22.5, y: 20.5 },
    ],
    speed: 1.6,
  },
  {
    id: 'npc:scout',
    name: 'Scout',
    appearance: 'villager',
    waypoints: [
      { x: 40.5, y: 26.5 },
      { x: 48.5, y: 26.5 },
      { x: 48.5, y: 31.5 },
      { x: 40.5, y: 31.5 },
    ],
    speed: 2.2,
  },
];

/** Tiles the prototype player may walk on. Water and stone walls are blocked; everything else is not. */
const WALKABLE = new Set<number>([TILE.grass, TILE.flowers, TILE.dirt]);

export function isWalkableTile(index: number): boolean {
  return WALKABLE.has(index);
}

/**
 * Builds the ground layer: a lake, a dirt road, a stone plaza and a tree line, sized to the map.
 *
 * The shapes are generated from tiles, so every tile has a real neighbour and the culling code sees a
 * realistic amount of work (the whole map is 2 560 tiles, of which a screen shows a few hundred).
 */
function paintGround(column: number, row: number): number {
  const { columns, rows } = PROTOTYPE_ZONE;

  // A lake in the south-west, with an irregular edge derived from the tile position (deterministic).
  const lakeCentre = { x: columns * 0.25, y: rows * 0.72 };
  const lakeRadius = { x: columns * 0.12, y: rows * 0.16 };
  const wobble = 1 + 0.12 * Math.sin(column * 0.7) * Math.cos(row * 0.9);
  const lakeDistance =
    ((column - lakeCentre.x) / (lakeRadius.x * wobble)) ** 2 +
    ((row - lakeCentre.y) / (lakeRadius.y * wobble)) ** 2;
  if (lakeDistance <= 1) {
    return TILE.water;
  }

  // A dirt road: a two-tile-wide horizontal track with a gentle bend.
  const roadRow = rows * 0.5 + Math.sin(column * 0.18) * 2.5;
  if (Math.abs(row - roadRow) < 1.2) {
    return TILE.dirt;
  }

  // A stone plaza where the road meets the eastern half (somewhere for the camera to reveal detail).
  const plaza = { x: columns * 0.62, y: rows * 0.5, rx: 5, ry: 4 };
  if (((column - plaza.x) / plaza.rx) ** 2 + ((row - plaza.y) / plaza.ry) ** 2 <= 1) {
    return TILE.stone;
  }

  // Flower patches: a deterministic pattern rather than random scatter, so the map is the same on
  // every machine (and so regenerating assets does not change the world).
  const patch = Math.sin(column * 0.31) * Math.cos(row * 0.27);
  return patch > 0.72 ? TILE.flowers : TILE.grass;
}

/** Where the prototype trees, bushes and rocks stand. Hand-placed, so the map has focal points. */
function prototypeObjects(): readonly { sprite: string; column: number; row: number }[] {
  const objects: { sprite: string; column: number; row: number }[] = [];

  // A tree line along the north edge, thinning out towards the middle.
  for (let column = 2; column < PROTOTYPE_ZONE.columns - 2; column += 3) {
    const row = 2 + Math.round(1.5 * Math.sin(column * 0.4) + 1.5);
    objects.push({ sprite: column % 6 === 0 ? 'tree_pine' : 'tree_broad', column, row });
  }

  // A small grove west of the road.
  const grove: readonly [number, number][] = [
    [12, 12],
    [16, 14],
    [14, 18],
    [19, 11],
    [10, 20],
    [17, 22],
  ];
  for (const [column, row] of grove) {
    objects.push({ sprite: 'tree_broad', column, row });
  }

  // Bushes and rocks scattered along the road and around the plaza.
  const bushes: readonly [number, number][] = [
    [24, 22],
    [30, 18],
    [36, 24],
    [42, 19],
    [46, 27],
    [20, 28],
    [33, 30],
    [50, 22],
  ];
  for (const [column, row] of bushes) {
    objects.push({ sprite: 'bush', column, row });
  }

  const rocks: readonly [number, number][] = [
    [8, 26],
    [11, 31],
    [26, 33],
    [39, 12],
    [44, 35],
    [53, 30],
    [56, 12],
  ];
  for (const [column, row] of rocks) {
    objects.push({ sprite: 'rock', column, row });
  }

  return objects;
}

export interface PrototypeWorld {
  readonly map: GameMap;
  readonly layerId: string;
  readonly spawn: Position;
  readonly spawnFacing: Direction;
  readonly objects: readonly { id: string; sprite: string; column: number; row: number }[];
  readonly patrols: readonly PrototypePatrol[];
  /** Which tile index is walkable, for the prototype walker's collision check. */
  readonly walkable: (index: number) => boolean;
}

/**
 * Builds the prototype zone. The result is validated against the SHARED map schema, so the day the
 * real loader replaces this function, everything downstream already speaks the same format.
 */
export function createPrototypeWorld(): PrototypeWorld {
  const { columns, rows, id, name } = PROTOTYPE_ZONE;

  const map = createGameMap({
    id,
    name,
    columns,
    rows,
    spawn: PROTOTYPE_SPAWN,
    layers: [buildTileLayer('ground', columns, rows, paintGround)],
  });

  return {
    map,
    layerId: 'ground',
    spawn: PROTOTYPE_SPAWN,
    spawnFacing: 'east',
    objects: prototypeObjects().map((object, index) => ({
      id: `object:${index}`,
      sprite: object.sprite,
      column: object.column,
      row: object.row,
    })),
    patrols: PROTOTYPE_PATROLS,
    walkable: isWalkableTile,
  };
}

/** Pixel size of the prototype zone. Used by tests and by the debug HUD. */
export function prototypeWorldPixelSize(world: PrototypeWorld): { width: number; height: number } {
  return { width: world.map.columns * TILE_SIZE, height: world.map.rows * TILE_SIZE };
}
