// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClientLogger } from './logger';

let consoleCalls: { method: string; args: readonly unknown[] }[] = [];

beforeEach(() => {
  consoleCalls = [];
  for (const method of ['debug', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleCalls.push({ method, args });
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createClientLogger', () => {
  it('writes a prefixed line with the structured context as an object', () => {
    const log = createClientLogger({ name: 'client.game', threshold: 'debug' });

    log.info('server online', { latencyMs: 25 });

    expect(consoleCalls).toEqual([
      { method: 'info', args: ['[client.game] server online', { latencyMs: 25 }] },
    ]);
  });

  it('passes the real Error object through so the stack stays clickable in devtools', () => {
    const log = createClientLogger({ name: 'client', threshold: 'debug' });
    const boom = new Error('boom');

    log.error('uncaught error', { source: 'main.ts' }, boom);

    expect(consoleCalls[0]?.method).toBe('error');
    expect(consoleCalls[0]?.args[2]).toBe(boom);
  });

  it('maps the shared levels onto console channels', () => {
    const log = createClientLogger({ name: 'client', threshold: 'trace' });

    log.debug('a');
    log.info('b');
    log.warn('c');
    log.error('d');
    log.fatal('e');

    expect(consoleCalls.map((call) => call.method)).toEqual([
      'debug',
      'info',
      'warn',
      'error',
      'error',
    ]);
  });

  it('drops everything below the configured threshold', () => {
    const log = createClientLogger({ name: 'client', threshold: 'warn' });

    log.debug('noise');
    log.info('noise');
    log.warn('kept');

    expect(consoleCalls).toEqual([{ method: 'warn', args: ['[client] kept'] }]);
    expect(log.isEnabled('info')).toBe(false);
  });

  it('emits nothing at all when the level is silent', () => {
    const log = createClientLogger({ name: 'client', threshold: 'silent' });

    log.fatal('nothing, not even this');

    expect(consoleCalls).toEqual([]);
  });
});
