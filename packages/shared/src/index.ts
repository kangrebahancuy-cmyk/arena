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

// Domain types.
export * from './entities/player';
export * from './world/direction';
export * from './world/position';

// HTTP contracts.
export * from './api/health';
export * from './api/error';
