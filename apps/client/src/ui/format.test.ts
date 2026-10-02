import { describe, expect, it } from 'vitest';
import type { OfflineReason } from '../boot/bootController';
import { describeOfflineReason, formatDuration } from './format';

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [0.9, '0s'],
    [59, '59s'],
    [60, '1m 0s'],
    [134, '2m 14s'],
    [3_600, '1h 0m'],
    [3_725, '1h 2m'],
    [86_400, '1d 0h'],
    [90_000, '1d 1h'],
    [-5, '0s'],
  ])('formats %f seconds as %s', (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });
});

describe('describeOfflineReason', () => {
  const reason = (overrides: Partial<OfflineReason>): OfflineReason => ({
    kind: 'network',
    message: 'raw message',
    status: undefined,
    ...overrides,
  });

  it('explains network, timeout and contract failures in player terms', () => {
    expect(describeOfflineReason(reason({ kind: 'network' }))).toMatch(/could not reach/i);
    expect(describeOfflineReason(reason({ kind: 'timeout' }))).toMatch(/in time/i);
    expect(describeOfflineReason(reason({ kind: 'invalid-response' }))).toMatch(/understand/i);
  });

  it('distinguishes rate limiting, server failures and other HTTP errors', () => {
    expect(describeOfflineReason(reason({ kind: 'http', status: 429 }))).toMatch(/too many/i);
    expect(describeOfflineReason(reason({ kind: 'http', status: 502 }))).toMatch(
      /HTTP 502.*running/,
    );
    expect(
      describeOfflineReason(reason({ kind: 'http', status: 403, message: 'Forbidden here' })),
    ).toBe('Forbidden here');
  });

  it('falls back to the message for unexpected failures', () => {
    expect(describeOfflineReason(reason({ kind: 'unexpected', message: 'boom' }))).toBe('boom');
  });
});
