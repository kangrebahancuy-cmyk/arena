import { describe, expect, it } from 'vitest';
import { readClientConfig } from './clientConfig';

describe('readClientConfig', () => {
  it('reads the build metadata and the shared game config', () => {
    const config = readClientConfig({ DEV: false }, '1.2.3');

    expect(config.appVersion).toBe('1.2.3');
    expect(config.isDevelopmentBuild).toBe(false);
    expect(config.game.protocolVersion).toBeGreaterThan(0);
    expect(config.game.simulation.hz).toBeGreaterThan(0);
  });

  it('logs debug in a development build and stays quiet in a production build', () => {
    expect(readClientConfig({ DEV: true }, '0.0.0').logLevel).toBe('debug');
    expect(readClientConfig({ DEV: false }, '0.0.0').logLevel).toBe('info');
  });

  it('accepts every documented log level, including silent', () => {
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const) {
      expect(readClientConfig({ DEV: true, VITE_LOG_LEVEL: level }, '0.0.0').logLevel).toBe(level);
    }
  });

  it('rejects an unknown log level instead of silently ignoring it', () => {
    const act = () => readClientConfig({ DEV: true, VITE_LOG_LEVEL: 'verbose' }, '0.0.0');

    expect(act).toThrow(/VITE_LOG_LEVEL/);
    expect(act).toThrow(expect.objectContaining({ code: 'config_invalid', name: 'RealmError' }));
  });

  it('rejects an environment that is not shaped like Vite’s', () => {
    // A string "false" would silently make `isDevelopmentBuild` truthy, so it must not be accepted.
    expect(() => readClientConfig({ DEV: 'true' as unknown as boolean }, '0.0.0')).toThrow(
      /config_invalid|Invalid client configuration/,
    );
  });
});
