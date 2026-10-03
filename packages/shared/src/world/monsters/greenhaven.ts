import { MonsterDataListSchema } from '../../protocol/monster';
import type { MonsterData } from '../../protocol/monster';

/** Original monster spawn points and patrol routes for Greenhaven. */
export const GREENHAVEN_MONSTERS: readonly MonsterData[] = MonsterDataListSchema.parse([
  {
    id: 'monster-forest-slime-grove',
    type: 'forest_slime',
    name: 'Forest Slime',
    position: { x: 14.5, y: 13.5 },
    sprite: 'forest_slime',
    maxHP: 18,
    level: 1,
    movementSpeed: 0.9,
    detectionRadius: 4.5,
    attackRange: 0.9,
    attackCooldown: 1.4,
    attackDamage: 4,
    respawnSeconds: 20,
    patrolWaypoints: [
      { x: 14.5, y: 13.5 },
      { x: 17.5, y: 13.5 },
      { x: 17.5, y: 16.5 },
      { x: 14.5, y: 16.5 },
    ],
  },
  {
    id: 'monster-wild-boar-meadow',
    type: 'wild_boar',
    name: 'Wild Boar',
    position: { x: 40.5, y: 12.5 },
    sprite: 'wild_boar',
    maxHP: 32,
    level: 2,
    movementSpeed: 1.55,
    detectionRadius: 5.5,
    attackRange: 1,
    attackCooldown: 1.15,
    attackDamage: 6,
    respawnSeconds: 25,
    patrolWaypoints: [
      { x: 40.5, y: 12.5 },
      { x: 43.5, y: 12.5 },
      { x: 43.5, y: 15.5 },
      { x: 40.5, y: 15.5 },
    ],
  },
  {
    id: 'monster-thorn-wolf-meadow',
    type: 'thorn_wolf',
    name: 'Thorn Wolf',
    position: { x: 29.5, y: 12.5 },
    sprite: 'thorn_wolf',
    maxHP: 26,
    level: 3,
    movementSpeed: 2.1,
    detectionRadius: 6.5,
    attackRange: 1.05,
    attackCooldown: 0.95,
    attackDamage: 8,
    respawnSeconds: 30,
    patrolWaypoints: [
      { x: 29.5, y: 12.5 },
      { x: 32.5, y: 12.5 },
      { x: 32.5, y: 15.5 },
      { x: 29.5, y: 15.5 },
    ],
  },
]);

/** Returns fresh, schema-validated spawn data for a Greenhaven session. */
export function createGreenhavenMonsters(): readonly MonsterData[] {
  return MonsterDataListSchema.parse(GREENHAVEN_MONSTERS);
}
