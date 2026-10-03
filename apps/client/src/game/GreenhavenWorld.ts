import {
  TILE_SIZE,
  createGreenhavenMap,
  createGreenhavenMonsters,
  createGreenhavenNpcs,
} from '@project-realm/shared';
import type { MapData, MonsterData, NpcData, SpawnPoint } from '@project-realm/shared';

export const PROTOTYPE_PLAYER_ID = 'local:prototype';
export const PROTOTYPE_PLAYER_NAME = 'Wanderer';

export interface GreenhavenWorld {
  readonly map: MapData;
  readonly spawn: SpawnPoint;
  readonly npcs: readonly NpcData[];
  readonly monsters: readonly MonsterData[];
}

/** Loads the validated map and NPC/dialogue data, then selects the declared player spawn. */
export function createGreenhavenWorld(): GreenhavenWorld {
  const map = createGreenhavenMap();
  const spawn = map.spawnPoints.find((point) => point.kind === 'player');
  if (spawn === undefined) {
    throw new Error('Greenhaven map has no player spawn point');
  }
  return {
    map,
    spawn,
    npcs: createGreenhavenNpcs(),
    monsters: createGreenhavenMonsters(),
  };
}

/** Pixel size for world-stage camera and boundary tests. */
export function greenhavenPixelSize(map: MapData): { width: number; height: number } {
  return { width: map.columns * TILE_SIZE, height: map.rows * TILE_SIZE };
}
