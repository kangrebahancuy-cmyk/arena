import { z } from 'zod';

/**
 * A point in world space, in **tile units**.
 *
 * Conventions both sides must agree on (the shared schema is the contract, this comment is the why):
 *   - `x` grows to the right (east), `y` grows downwards (south);
 *   - the origin (0, 0) is the top-left corner of the map's first tile;
 *   - fractional values are allowed: a position is a real number in tile units, not a tile index,
 *     so movement is not forced onto a grid;
 *   - the server is the only writer of authoritative positions (see docs/ARCHITECTURE.md).
 */
export const PositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export type Position = z.infer<typeof PositionSchema>;
