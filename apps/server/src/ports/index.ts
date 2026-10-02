/**
 * Ports: the interfaces game and HTTP code depend on for anything that lives outside the process
 * (accounts, database, ...). Adapters (PostgreSQL, ...) implement them in later phases, so the game
 * logic never imports a database driver directly.
 *
 * NOTHING here is implemented yet. That is intentional: a port without an adapter means "feature not
 * built", and callers must treat it that way rather than substituting fake data.
 */
export type * from './auth';
export type * from './characters';
export type * from './world';
