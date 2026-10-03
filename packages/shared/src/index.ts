export * from './constants';

// Game rules both sides share.
export * from './config/gameConfig';

// Error taxonomy and normalisation for logging.
export * from './errors/RealmError';
export * from './errors/details';

// Logging vocabulary and core (sinks are provided by each application).
export * from './logging/levels';
export * from './logging/logger';

// Realtime protocol framing and typed message containers (used from Phase 10).
export * from './protocol/messages';

// Validated map/NPC content formats, shared collision rules and original world data.
export * from './protocol/world';
export * from './protocol/npc';
export * from './protocol/monster';
export * from './world/collision';
export * from './world/maps/greenhaven';
export * from './world/npcs/greenhaven';
export * from './world/monsters/greenhaven';

// Shared maths: tile grid, camera, zero-allocation geometry helpers.
export * from './render/camera';
export * from './render/tileGrid';

// Deterministic simulation primitives (used by the client loop now, the server tick in Phase 10).
export * from './simulation/fixedTimestep';
export * from './simulation/movement';

// Domain types.
export * from './entities/player';
export * from './world/direction';
export * from './world/position';

// HTTP contracts.
export * from './api/health';
export * from './api/error';
