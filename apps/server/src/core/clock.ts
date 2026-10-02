/**
 * Time source.
 *
 * It is injected instead of calling `Date.now()` all over the code so that time-dependent logic
 * (uptime today; cooldowns, buffs, respawn timers and rate limits later) stays deterministic in tests.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
