import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../constants';
import { RealmError } from '../errors/RealmError';
import { DEFAULT_GAME_CONFIG, GameConfigSchema, createGameConfig } from './gameConfig';

describe('DEFAULT_GAME_CONFIG', () => {
  it('is a valid configuration that satisfies its own schema', () => {
    expect(GameConfigSchema.parse(DEFAULT_GAME_CONFIG)).toEqual(DEFAULT_GAME_CONFIG);
  });

  it('follows the shared protocol version instead of duplicating it', () => {
    expect(DEFAULT_GAME_CONFIG.protocolVersion).toBe(PROTOCOL_VERSION);
  });
});

describe('createGameConfig', () => {
  it('returns the defaults when nothing is overridden', () => {
    expect(createGameConfig()).toEqual(DEFAULT_GAME_CONFIG);
  });

  it('applies partial overrides one field at a time', () => {
    const config = createGameConfig({ simulation: { hz: 30 } });

    expect(config.simulation.hz).toBe(30);
    expect(config.simulation.maxCatchUpSteps).toBe(DEFAULT_GAME_CONFIG.simulation.maxCatchUpSteps);
    expect(config.protocolVersion).toBe(PROTOCOL_VERSION);
  });

  it('freezes the result, because config is read by every part of the game and never written', () => {
    const config = createGameConfig();

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.simulation)).toBe(true);
  });

  it.each([
    ['a zero simulation rate', { simulation: { hz: 0 } }],
    ['an absurd simulation rate', { simulation: { hz: 1_000 } }],
    ['a fractional catch-up bound', { simulation: { maxCatchUpSteps: 1.5 } }],
    ['a negative protocol version', { protocolVersion: -1 }],
  ])('rejects %s with a named field', (_label, overrides) => {
    const act = () => createGameConfig(overrides);

    expect(act).toThrow(RealmError);
    expect(act).toThrow(/simulation|protocolVersion/);
    expect(act).toThrow(expect.objectContaining({ code: 'config_invalid' }));
  });
});
