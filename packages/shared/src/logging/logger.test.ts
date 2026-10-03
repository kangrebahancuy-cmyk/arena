import { describe, expect, it, vi } from 'vitest';
import { LOG_LEVELS, isLevelEnabled } from './levels';
import { createLogger, silentLogger } from './logger';
import type { LogRecord, LogSink } from './logger';

function capture(): { records: LogRecord[]; sink: LogSink } {
  const records: LogRecord[] = [];
  return { records, sink: (record) => records.push(record) };
}

const AT = new Date('2026-10-03T08:00:00.000Z');

describe('isLevelEnabled', () => {
  it('enables the threshold and everything more severe', () => {
    expect(isLevelEnabled('warn', 'warn')).toBe(true);
    expect(isLevelEnabled('error', 'warn')).toBe(true);
    expect(isLevelEnabled('info', 'warn')).toBe(false);
  });

  it('orders every level from trace down to fatal', () => {
    const enabled = LOG_LEVELS.map((level) => isLevelEnabled(level, 'debug'));
    expect(enabled).toEqual([false, true, true, true, true, true]);
  });

  it('switches everything off when silent', () => {
    for (const level of LOG_LEVELS) {
      expect(isLevelEnabled(level, 'silent')).toBe(false);
    }
  });
});

describe('createLogger', () => {
  it('emits a structured record with name, time, message and context', () => {
    const { records, sink } = capture();
    const log = createLogger({ name: 'server.game', threshold: 'debug', sink, now: () => AT });

    log.info('game server ready', { port: 3001 });

    expect(records).toEqual([
      {
        level: 'info',
        time: AT,
        name: 'server.game',
        message: 'game server ready',
        context: { port: 3001 },
        error: undefined,
      },
    ]);
  });

  it('drops records below the threshold and reports that decision through isEnabled', () => {
    const { records, sink } = capture();
    const log = createLogger({ name: 'client', threshold: 'warn', sink });

    log.debug('noise');
    log.info('noise');
    log.warn('kept');
    log.error('kept');
    log.fatal('kept');

    expect(records.map((record) => record.level)).toEqual(['warn', 'error', 'fatal']);
    expect(log.isEnabled('info')).toBe(false);
    expect(log.isEnabled('warn')).toBe(true);
  });

  it('keeps the thrown value itself on error records so sinks can serialise it', () => {
    const { records, sink } = capture();
    const log = createLogger({ name: 'server', threshold: 'trace', sink });
    const boom = new Error('boom');

    log.error('request failed', { route: '/api/health' }, boom);

    expect(records[0]?.error).toBe(boom);
    expect(records[0]?.context).toEqual({ route: '/api/health' });
  });

  it('names children as a dotted path and shares the sink', () => {
    const { records, sink } = capture();
    const child = createLogger({ name: 'server', threshold: 'info', sink })
      .child('http')
      .child('routes');

    child.info('registered');

    expect(child.name).toBe('server.http.routes');
    expect(records[0]?.name).toBe('server.http.routes');
  });

  it('never calls the clock for a record that is filtered out', () => {
    const now = vi.fn(() => AT);
    const log = createLogger({ name: 'client', threshold: 'error', sink: () => undefined, now });

    log.debug('dropped');
    expect(now).not.toHaveBeenCalled();

    log.error('kept');
    expect(now).toHaveBeenCalledOnce();
  });

  it('provides a silent logger that accepts every call and emits nothing', () => {
    const log = silentLogger.child('client');

    expect(log.isEnabled('fatal')).toBe(false);
    expect(() => {
      log.debug('a');
      log.info('b');
      log.warn('c');
      log.error('d', undefined, new Error('e'));
      log.fatal('f');
    }).not.toThrow();
  });
});
