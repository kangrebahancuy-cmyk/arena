import { buildCollisionLayer, buildTileLayer, createMapData } from '../../protocol/world';
import type { MapData, ObjectData, TileData, TileId } from '../../protocol/world';

export const GREENHAVEN_SIZE = { columns: 72, rows: 48 } as const;

/** Semantic tile properties shared by map validation and collision, never by atlas index. */
export const GREENHAVEN_TILE_DATA: readonly TileData[] = [
  { id: 'grass', blocksMovement: false },
  { id: 'grass_flowers', blocksMovement: false },
  { id: 'dirt', blocksMovement: false },
  { id: 'water', blocksMovement: true },
  { id: 'stone', blocksMovement: false },
  { id: 'stone_wall', blocksMovement: true },
  { id: 'wood_plank', blocksMovement: false },
];

const QUARRY_WALLS = new Set<string>();
for (let column = 52; column <= 67; column += 1) {
  QUARRY_WALLS.add(cellKey(column, 4));
  if (column !== 60) {
    QUARRY_WALLS.add(cellKey(column, 15));
  }
}
for (let row = 5; row < 15; row += 1) {
  QUARRY_WALLS.add(cellKey(52, row));
  QUARRY_WALLS.add(cellKey(67, row));
}

function cellKey(column: number, row: number): string {
  return `${column}:${row}`;
}

function isQuarryWall(column: number, row: number): boolean {
  return QUARRY_WALLS.has(cellKey(column, row));
}

function isLake(column: number, row: number): boolean {
  const centre = { x: 11.5, y: 34 };
  const radius = { x: 8.5, y: 9.2 };
  const ripple = 1 + 0.1 * Math.sin(column * 0.8) * Math.cos(row * 0.6);
  return (
    ((column + 0.5 - centre.x) / (radius.x * ripple)) ** 2 +
      ((row + 0.5 - centre.y) / (radius.y * ripple)) ** 2 <=
    1
  );
}

function isBridge(column: number, row: number): boolean {
  return column >= 19 && column <= 24 && (row === 33 || row === 34);
}

function isVillagePlaza(column: number, row: number): boolean {
  return ((column - 37) / 8) ** 2 + ((row - 33) / 6) ** 2 <= 1;
}

function isRoad(column: number, row: number): boolean {
  const eastWestRoad = Math.abs(row - (33 + Math.sin(column * 0.11) * 1.4)) < 1.15;
  const northSouthRoad = column >= 35 && column <= 37 && row >= 16 && row <= 34;
  return eastWestRoad || northSouthRoad;
}

function pickGround(column: number, row: number): TileId {
  if (isBridge(column, row)) {
    return 'wood_plank';
  }
  if (isLake(column, row)) {
    return 'water';
  }
  if (column >= 53 && row < 16) {
    return 'stone';
  }
  if (isVillagePlaza(column, row)) {
    return 'stone';
  }
  if (isRoad(column, row)) {
    return 'dirt';
  }
  if (column < 24 && row < 24 && Math.sin(column * 0.39) * Math.cos(row * 0.32) > 0.78) {
    return 'grass_flowers';
  }
  if ((column > 47 && row > 24) || (column > 28 && row < 23)) {
    return Math.sin(column * 0.27 + row * 0.13) > 0.82 ? 'grass_flowers' : 'grass';
  }
  const meadowPattern = Math.sin(column * 0.31) * Math.cos(row * 0.27);
  return meadowPattern > 0.78 ? 'grass_flowers' : 'grass';
}

function pickDecoration(column: number, row: number): TileId | null {
  if (isQuarryWall(column, row)) {
    return 'stone_wall';
  }
  // Flower tiles overlay their ground cell, adding detail without tying collision to sprite indices.
  if (column < 24 && row < 24 && Math.sin(column * 0.7) * Math.cos(row * 0.45) > 0.86) {
    return 'grass_flowers';
  }
  return null;
}

function isCollisionWall(column: number, row: number): boolean {
  return isQuarryWall(column, row);
}

function object(
  id: string,
  kind: string,
  sprite: string,
  column: number,
  row: number,
  collision: ObjectData['collision'] = [],
): ObjectData {
  return {
    id,
    kind,
    sprite,
    // Object anchors are the bottom-centre of their tile in map coordinates.
    position: { x: column + 0.5, y: row + 1 },
    collision: [...collision],
  };
}

const TREE_COLLISION: ObjectData['collision'] = [{ x: -0.2, y: -0.38, width: 0.4, height: 0.38 }];
const ROCK_COLLISION: ObjectData['collision'] = [{ x: -0.38, y: -0.3, width: 0.76, height: 0.3 }];
const COTTAGE_COLLISION: ObjectData['collision'] = [
  { x: -0.86, y: -1.65, width: 0.52, height: 1.65 },
  { x: 0.34, y: -1.65, width: 0.52, height: 1.65 },
  { x: -0.34, y: -1.65, width: 0.68, height: 0.55 },
];

function createObjects(): ObjectData[] {
  const objects: ObjectData[] = [];
  const trees: readonly (readonly [number, number, 'tree_broad' | 'tree_pine'])[] = [
    [3, 3, 'tree_pine'],
    [8, 4, 'tree_broad'],
    [13, 3, 'tree_broad'],
    [19, 5, 'tree_pine'],
    [4, 9, 'tree_broad'],
    [10, 11, 'tree_pine'],
    [17, 9, 'tree_broad'],
    [22, 14, 'tree_broad'],
    [4, 17, 'tree_pine'],
    [11, 19, 'tree_broad'],
    [19, 21, 'tree_pine'],
    [27, 5, 'tree_broad'],
    [32, 8, 'tree_pine'],
    [43, 7, 'tree_broad'],
    [27, 18, 'tree_pine'],
    [46, 19, 'tree_broad'],
    [5, 46, 'tree_broad'],
    [28, 44, 'tree_pine'],
    [54, 45, 'tree_broad'],
    [67, 43, 'tree_pine'],
  ];
  for (const [column, row, sprite] of trees) {
    objects.push(object(`tree-${objects.length + 1}`, 'tree', sprite, column, row, TREE_COLLISION));
  }

  const rocks: readonly (readonly [number, number])[] = [
    [54, 6],
    [57, 8],
    [63, 6],
    [65, 11],
    [56, 18],
    [61, 19],
    [66, 21],
    [27, 41],
    [31, 43],
    [20, 25],
  ];
  for (const [column, row] of rocks) {
    objects.push(object(`rock-${objects.length + 1}`, 'rock', 'rock', column, row, ROCK_COLLISION));
  }

  const bushes: readonly (readonly [number, number])[] = [
    [25, 27],
    [29, 38],
    [44, 37],
    [48, 30],
    [8, 22],
    [16, 22],
    [58, 33],
    [63, 39],
  ];
  for (const [column, row] of bushes) {
    objects.push(object(`bush-${objects.length + 1}`, 'bush', 'bush', column, row));
  }

  objects.push(
    object('village-cottage-east', 'building', 'cottage', 41, 28, COTTAGE_COLLISION),
    object('village-cottage-west', 'building', 'cottage', 32, 28, COTTAGE_COLLISION),
  );
  return objects;
}

/**
 * Original hand-authored/procedural map data for Greenhaven: a meadow, old grove, lakeshore,
 * village, quarry and south fields. This module contains no PixiJS or renderer concepts.
 */
export function createGreenhavenMap(): MapData {
  const { columns, rows } = GREENHAVEN_SIZE;
  const areas = [
    {
      id: 'heartwood-grove',
      name: 'Heartwood Grove',
      bounds: { x: 0, y: 0, width: 24, height: 24 },
    },
    {
      id: 'bracken-meadow',
      name: 'Bracken Meadow',
      bounds: { x: 24, y: 0, width: 24, height: 24 },
    },
    { id: 'old-quarry', name: 'Old Quarry', bounds: { x: 48, y: 0, width: 24, height: 24 } },
    {
      id: 'moonmere-shore',
      name: 'Moonmere Shore',
      bounds: { x: 0, y: 24, width: 24, height: 24 },
    },
    {
      id: 'greenhaven-village',
      name: 'Greenhaven Village',
      bounds: { x: 24, y: 24, width: 24, height: 24 },
    },
    { id: 'south-fields', name: 'South Fields', bounds: { x: 48, y: 24, width: 24, height: 24 } },
  ];

  return createMapData({
    id: 'greenhaven',
    name: 'Greenhaven',
    columns,
    rows,
    bounds: { x: 0, y: 0, width: columns, height: rows },
    tileData: GREENHAVEN_TILE_DATA,
    layers: [
      buildTileLayer('ground', 'ground', columns, rows, pickGround),
      buildTileLayer('decoration', 'decoration', columns, rows, pickDecoration),
      buildCollisionLayer('collision', columns, rows, isCollisionWall),
      {
        id: 'objects',
        kind: 'objects',
        objects: createObjects(),
      },
    ],
    areas,
    spawnPoints: [
      {
        id: 'village-square',
        name: 'Village Square',
        kind: 'player',
        position: { x: 36.5, y: 33.5 },
        direction: 'east',
        areaId: 'greenhaven-village',
      },
      {
        id: 'lakeshore-bridge',
        name: 'Lakeshore Bridge',
        kind: 'transition',
        position: { x: 23.5, y: 33.5 },
        direction: 'east',
        areaId: 'moonmere-shore',
      },
      {
        id: 'quarry-approach',
        name: 'Quarry Approach',
        kind: 'transition',
        position: { x: 49.5, y: 20.5 },
        direction: 'south',
        areaId: 'old-quarry',
      },
    ],
  });
}

export function greenhavenTileData(map: MapData, tileId: TileId): TileData | undefined {
  return map.tileData.find((tile) => tile.id === tileId);
}
