import { z } from 'zod';
import { PositionSchema } from '../world/position';
import { WorldDataIdSchema } from './world';

/** Original Greenhaven monster families supported by the prototype roster. */
export const MonsterTypeSchema = z.enum(['forest_slime', 'wild_boar', 'thorn_wolf']);
export type MonsterType = z.infer<typeof MonsterTypeSchema>;

/** Runtime lifecycle states used by the local AI and combat systems. */
export const MonsterStateSchema = z.enum(['IDLE', 'PATROL', 'CHASE', 'ATTACK', 'HURT', 'DEAD']);
export type MonsterState = z.infer<typeof MonsterStateSchema>;

/** Validated spawn definition; current HP and state are created by the runtime entity. */
export const MonsterDataSchema = z.object({
  id: WorldDataIdSchema,
  type: MonsterTypeSchema,
  name: z.string().min(1).max(64),
  position: PositionSchema,
  sprite: WorldDataIdSchema,
  maxHP: z.number().int().positive().max(100_000),
  level: z.number().int().min(1).max(100),
  movementSpeed: z.number().positive().finite().max(30),
  detectionRadius: z.number().positive().finite().max(32),
  attackRange: z.number().positive().finite().max(8),
  attackCooldown: z.number().positive().finite().max(30),
  attackDamage: z.number().int().positive().max(1_000),
  respawnSeconds: z.number().positive().finite().max(3_600),
  patrolWaypoints: z.array(PositionSchema).min(1).max(16),
});
export type MonsterData = z.infer<typeof MonsterDataSchema>;

/** Validates all spawn definitions and requires a stable, unique ID per spawn point. */
export const MonsterDataListSchema = z.array(MonsterDataSchema).superRefine((monsters, context) => {
  const ids = new Set<string>();
  monsters.forEach((monster, index) => {
    if (ids.has(monster.id)) {
      context.addIssue({
        code: 'custom',
        path: [index, 'id'],
        message: `duplicate monster spawn id "${monster.id}"`,
      });
    }
    ids.add(monster.id);
  });
});
