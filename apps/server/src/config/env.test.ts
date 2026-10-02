import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './env';

describe('loadConfig', () => {
  it('uses safe defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual({
      env: 'development',
      host: '127.0.0.1', // local-only unless the operator opts in to something wider
      port: 3001,
      log: { level: 'info', pretty: true },
      trustProxy: false, // never trust forwarded headers by default
      rateLimit: { max: 120, windowMs: 60_000 },
    });
  });

  it('reads and converts values from the environment', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: '8080',
      LOG_LEVEL: 'warn',
      TRUST_PROXY: 'true',
      HTTP_RATE_LIMIT_MAX: '30',
      HTTP_RATE_LIMIT_WINDOW_MS: '5000',
    });

    expect(config).toEqual({
      env: 'production',
      host: '0.0.0.0',
      port: 8080,
      log: { level: 'warn', pretty: false },
      trustProxy: true,
      rateLimit: { max: 30, windowMs: 5000 },
    });
  });

  it('only enables pretty logs in development', () => {
    expect(loadConfig({ NODE_ENV: 'development' }).log.pretty).toBe(true);
    expect(loadConfig({ NODE_ENV: 'test' }).log.pretty).toBe(false);
    expect(loadConfig({ NODE_ENV: 'production' }).log.pretty).toBe(false);
  });

  it('ignores unrelated variables', () => {
    expect(() => loadConfig({ PATH: '/usr/bin', SOMETHING_ELSE: 'x' })).not.toThrow();
  });

  it.each([
    ['PORT', 'abc'],
    ['PORT', '0'],
    ['PORT', '70000'],
    ['PORT', '30.5'],
    ['PORT', ''],
    ['HOST', '   '],
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'verbose'],
    ['TRUST_PROXY', 'maybe'],
    ['HTTP_RATE_LIMIT_MAX', '0'],
    ['HTTP_RATE_LIMIT_WINDOW_MS', '10'],
  ])('rejects %s=%j and names the offending variable', (name, value) => {
    const act = () => loadConfig({ [name]: value });

    expect(act).toThrow(ConfigError);
    expect(act).toThrow(name);
  });

  it('reports every invalid variable at once', () => {
    expect(() => loadConfig({ PORT: 'abc', LOG_LEVEL: 'nope' })).toThrow(/PORT[\s\S]*LOG_LEVEL/);
  });
});
