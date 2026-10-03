import { z } from 'zod';

/**
 * Which way something faces, in 90-degree steps.
 *
 * Names describe the world, not the screen: +x is east, +y is south (see PositionSchema). Four
 * directions are what a tile-based sprite set needs (one animation row per direction). Extending
 * this list is a wire change: bump PROTOCOL_VERSION when it happens.
 */
export const DIRECTIONS = ['north', 'east', 'south', 'west'] as const;

export type Direction = (typeof DIRECTIONS)[number];

export const DirectionSchema = z.enum(DIRECTIONS);
