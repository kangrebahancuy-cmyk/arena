import { describe, expect, it } from 'vitest';
import { nextBackoffDelay } from './backoff';

describe('nextBackoffDelay', () => {
  it('grows exponentially from the base delay', () => {
    expect([0, 1, 2, 3].map((n) => nextBackoffDelay(n))).toEqual([1_000, 2_000, 4_000, 8_000]);
  });

  it('never exceeds the maximum', () => {
    expect(nextBackoffDelay(4)).toBe(15_000);
    expect(nextBackoffDelay(50)).toBe(15_000);
    expect(nextBackoffDelay(10_000)).toBe(15_000);
  });

  it('treats negative and fractional attempts defensively', () => {
    expect(nextBackoffDelay(-3)).toBe(1_000);
    expect(nextBackoffDelay(2.9)).toBe(4_000);
  });

  it('honours custom options', () => {
    const options = { baseMs: 100, maxMs: 500, factor: 3 };
    expect([0, 1, 2, 3].map((n) => nextBackoffDelay(n, options))).toEqual([100, 300, 500, 500]);
  });
});
