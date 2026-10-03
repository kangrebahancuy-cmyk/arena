import { describe, expect, it } from 'vitest';
import { toErrorDetails } from './details';
import { RealmError, isRealmError } from './RealmError';

describe('RealmError', () => {
  it('carries a stable code, a name and structured context', () => {
    const error = new RealmError('config_invalid', 'PORT must be a number', {
      context: { variable: 'PORT' },
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('config_invalid');
    expect(error.name).toBe('RealmError');
    expect(error.message).toBe('PORT must be a number');
    expect(error.context).toEqual({ variable: 'PORT' });
  });

  it('keeps the cause chain', () => {
    const cause = new Error('socket closed');
    const error = new RealmError('invalid_state', 'cannot start twice', { cause });

    expect(error.cause).toBe(cause);
  });

  it('lets subclasses report their own name', () => {
    class ConfigError extends RealmError {
      constructor(message: string) {
        super('config_invalid', message, { name: 'ConfigError' });
      }
    }

    expect(new ConfigError('nope').name).toBe('ConfigError');
  });

  it('is recognised by isRealmError, and nothing else is', () => {
    expect(isRealmError(new RealmError('invalid_state', 'x'))).toBe(true);
    expect(isRealmError(new Error('plain'))).toBe(false);
    expect(isRealmError('a string')).toBe(false);
    expect(isRealmError(null)).toBe(false);
  });
});

describe('toErrorDetails', () => {
  it('describes a RealmError, including code and context', () => {
    const details = toErrorDetails(
      new RealmError('port_unavailable', 'Port 3001 is already in use', {
        context: { port: 3001 },
      }),
    );

    expect(details).toMatchObject({
      name: 'RealmError',
      message: 'Port 3001 is already in use',
      code: 'port_unavailable',
      context: { port: 3001 },
      cause: undefined,
    });
    expect(details.stack).toEqual(expect.any(String));
  });

  it('describes a plain Error without inventing a code', () => {
    const details = toErrorDetails(new TypeError('x is not a function'));

    expect(details.name).toBe('TypeError');
    expect(details.code).toBeUndefined();
    expect(details.context).toBeUndefined();
  });

  it.each([
    ['a string', 'something broke', 'something broke'],
    ['a number', 42, '42'],
    ['null', null, 'null'],
    ['undefined', undefined, 'undefined'],
    ['an object', { reason: 'why' }, '{"reason":"why"}'],
  ])('describes %s thrown instead of an Error', (_label, thrown, expected) => {
    const details = toErrorDetails(thrown);

    expect(details.name).toBe('UnknownError');
    expect(details.message).toBe(expected);
    expect(details.cause).toBeUndefined();
  });

  it('survives values that cannot be stringified', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(toErrorDetails(circular).message).toBe('[object Object]');
  });

  it('walks the cause chain but stops at a bounded depth', () => {
    const root = new Error('root');
    const level1 = new RealmError('invalid_state', 'one', { cause: root });
    const level2 = new RealmError('invalid_state', 'two', { cause: level1 });
    const level3 = new RealmError('invalid_state', 'three', { cause: level2 });
    const level4 = new RealmError('invalid_state', 'four', { cause: level3 });

    const details = toErrorDetails(level4);

    expect(details.cause?.message).toBe('three');
    expect(details.cause?.cause?.message).toBe('two');
    expect(details.cause?.cause?.cause?.message).toBe('one'); // depth 3: the root is not reached
    expect(details.cause?.cause?.cause?.cause).toBeUndefined();
  });

  it('produces a plain object a JSON logger can serialise', () => {
    const details = toErrorDetails(
      new RealmError('config_invalid', 'bad', { cause: new Error('why') }),
    );

    expect(JSON.parse(JSON.stringify(details))).toEqual(details);
  });
});
