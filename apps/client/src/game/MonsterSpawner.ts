import type { MonsterData } from '@project-realm/shared';
import { MonsterEntity } from './MonsterEntity';

/** Owns spawn instances and their respawn timers, but not AI decisions or combat rules. */
export class MonsterSpawner {
  private readonly monstersById = new Map<string, MonsterEntity>();
  private readonly respawnTimers = new Map<string, number>();

  constructor(definitions: readonly MonsterData[]) {
    for (const definition of definitions) {
      if (this.monstersById.has(definition.id)) {
        throw new Error(`MonsterSpawner: duplicate spawn id "${definition.id}"`);
      }
      this.monstersById.set(definition.id, new MonsterEntity(definition));
    }
  }

  get monsters(): readonly MonsterEntity[] {
    return [...this.monstersById.values()];
  }

  get aliveCount(): number {
    return [...this.monstersById.values()].filter((monster) => monster.state !== 'DEAD').length;
  }

  /** Advances dead spawn timers and restores HP/state/position when each timer expires. */
  update(deltaSeconds: number): readonly string[] {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return [];
    }

    const respawned: string[] = [];
    for (const monster of this.monstersById.values()) {
      if (monster.state !== 'DEAD') {
        this.respawnTimers.delete(monster.id);
        continue;
      }

      const remaining =
        (this.respawnTimers.get(monster.id) ?? monster.definition.respawnSeconds) - deltaSeconds;
      if (remaining <= 0) {
        monster.respawn();
        this.respawnTimers.delete(monster.id);
        respawned.push(monster.id);
      } else {
        this.respawnTimers.set(monster.id, remaining);
      }
    }
    return respawned;
  }
}
