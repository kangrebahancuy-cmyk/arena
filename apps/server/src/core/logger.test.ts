import type { FastifyBaseLogger } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStartupLogger, loggerFromPino } from './logger';

type FakeLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface PinoSpies {
  readonly logger: FastifyBaseLogger;
  readonly calls: Record<FakeLevel, [unknown, string][]>;
}

function fakePino(): PinoSpies {
  const calls: Record<FakeLevel, [unknown, string][]> = {
    trace: [],
    debug: [],
    info: [],
    warn: [],
    error: [],
    fatal: [],
  };
  const record =
    (level: FakeLevel) =>
    (fields: unknown, message: string): void => {
      calls[level].push([fields, message]);
    };

  const logger = {
    trace: record('trace'),
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    fatal: record('fatal'),
  } as unknown as FastifyBaseLogger;

  return { logger, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loggerFromPino', () => {
  it('forwards a record to the matching pino level, with the module name', () => {
    const { logger, calls } = fakePino();
    const log = loggerFromPino(logger, { name: 'server.game', threshold: 'trace' });

    log.info('game server ready', { port: 3001 });

    expect(calls.info).toEqual([[{ port: 3001, module: 'server.game' }, 'game server ready']]);
    expect(calls.debug).toEqual([]);
  });

  it('passes the thrown value as `err` so pino serialises it properly', () => {
    const { logger, calls } = fakePino();
    const log = loggerFromPino(logger, { name: 'server', threshold: 'trace' });
    const boom = new Error('boom');

    log.error('request failed', { route: '/api/health' }, boom);

    expect(calls.error).toEqual([
      [{ route: '/api/health', module: 'server', err: boom }, 'request failed'],
    ]);
  });

  it('honours the shared threshold before pino is even called', () => {
    const { logger, calls } = fakePino();
    const log = loggerFromPino(logger, { name: 'server', threshold: 'warn' });

    log.debug('noise');
    log.info('noise');
    log.warn('kept');
    log.fatal('kept');

    expect(calls.debug).toEqual([]);
    expect(calls.info).toEqual([]);
    expect(calls.warn).toHaveLength(1);
    expect(calls.fatal).toHaveLength(1);
  });

  it('can be silenced completely (tests, CI)', () => {
    const { logger, calls } = fakePino();
    const log = loggerFromPino(logger, { name: 'server', threshold: 'silent' });

    log.fatal('nothing');

    expect(calls.fatal).toEqual([]);
  });

  it('names children as a dotted path', () => {
    const { logger, calls } = fakePino();
    const child = loggerFromPino(logger, { name: 'server', threshold: 'trace' }).child('http');

    child.info('registered');

    expect(child.name).toBe('server.http');
    expect(calls.info[0]?.[0]).toEqual({ module: 'server.http' });
  });
});

describe('createStartupLogger', () => {
  it('writes one JSON line per record, with context merged in', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const log = createStartupLogger('info', 'server');

    log.info('game server ready', { port: 3001 });

    const line = JSON.parse(String(stdout.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(line).toMatchObject({
      level: 'info',
      name: 'server',
      msg: 'game server ready',
      port: 3001,
    });
    expect(line.time).toBe(new Date(String(line.time)).toISOString());
  });

  it('serialises a thrown value so a JSON log shipper can read it', () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const log = createStartupLogger('trace');

    log.error('failed', { code: 'EADDRINUSE' }, new Error('boom'));

    const line = JSON.parse(String(stderr.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(line).toMatchObject({ level: 'error', msg: 'failed', code: 'EADDRINUSE' });
    expect(line.err).toMatchObject({ name: 'Error', message: 'boom' });
    expect(String((line.err as Record<string, unknown>).stack)).toContain('boom');
  });

  it('sends errors and fatals to stderr, everything else to stdout', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const log = createStartupLogger('trace');

    log.debug('a');
    log.error('b');
    log.fatal('c');

    expect(stdout).toHaveBeenCalledOnce();
    expect(stderr).toHaveBeenCalledTimes(2);
  });

  it('stays silent without writing anything when switched off', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const log = createStartupLogger('silent');

    log.fatal('unreachable');

    expect(stdout).not.toHaveBeenCalled();
  });
});
