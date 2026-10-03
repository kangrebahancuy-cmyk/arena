// @vitest-environment happy-dom
import { createLogger } from '@project-realm/shared';
import type { LogRecord } from '@project-realm/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { installGlobalErrorHandlers } from './globalErrors';

let uninstall: (() => void) | undefined;

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
});

function capture() {
  const records: LogRecord[] = [];
  const logger = createLogger({
    name: 'client.window',
    threshold: 'trace',
    sink: (record) => records.push(record),
  });
  uninstall = installGlobalErrorHandlers(logger);
  return records;
}

describe('installGlobalErrorHandlers', () => {
  it('logs an uncaught error together with the thrown value and its origin', () => {
    const records = capture();
    const boom = new Error('boom');

    window.dispatchEvent(
      new ErrorEvent('error', {
        error: boom,
        message: 'boom',
        filename: 'main.ts',
        lineno: 12,
        colno: 3,
      }),
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ level: 'error', message: 'uncaught error' });
    expect(records[0]?.error).toBe(boom);
    expect(records[0]?.context).toEqual({ source: 'main.ts', line: 12, column: 3 });
  });

  it('falls back to the event message when the thrown value is withheld (cross-origin script)', () => {
    const records = capture();
    const event = new ErrorEvent('error', { message: 'Script error.' });

    window.dispatchEvent(event);

    expect(records[0]?.error).toBe('Script error.');
  });

  it('logs an unhandled promise rejection with the rejected value', () => {
    const records = capture();
    const reason = new Error('nobody caught me');
    const event = new Event('unhandledrejection');
    Object.defineProperty(event, 'reason', { value: reason });

    window.dispatchEvent(event);

    expect(records[0]).toMatchObject({ level: 'error', message: 'unhandled promise rejection' });
    expect(records[0]?.error).toBe(reason);
  });

  it('stops reporting after the uninstall function runs', () => {
    const records = capture();
    uninstall?.();
    uninstall = undefined;

    window.dispatchEvent(new ErrorEvent('error', { message: 'later' }));

    expect(records).toEqual([]);
  });
});
