import { describe, expect, it } from 'vitest';
import { SERVER_SERVICE_NAME } from '../constants';
import { HealthResponseSchema } from './health';

const valid = {
  status: 'ok',
  service: SERVER_SERVICE_NAME,
  version: '0.1.0',
  protocolVersion: 1,
  uptimeSeconds: 12.5,
  serverTime: '2026-10-02T12:00:00.000Z',
};

describe('HealthResponseSchema', () => {
  it('accepts a well-formed response', () => {
    expect(HealthResponseSchema.parse(valid)).toEqual(valid);
  });

  it('ignores unknown fields so newer servers stay readable by older clients', () => {
    const parsed = HealthResponseSchema.parse({ ...valid, somethingNew: true });
    expect(parsed).toEqual(valid);
  });

  it.each([
    ['wrong status', { status: 'degraded' }],
    ['wrong service', { service: 'someone-else' }],
    ['empty version', { version: '' }],
    ['non-integer protocol version', { protocolVersion: 1.5 }],
    ['zero protocol version', { protocolVersion: 0 }],
    ['negative uptime', { uptimeSeconds: -1 }],
    ['non-ISO server time', { serverTime: 'yesterday' }],
    ['server time with a local offset', { serverTime: '2026-10-02T12:00:00+07:00' }],
  ])('rejects %s', (_label, override) => {
    expect(HealthResponseSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it('rejects non-object payloads', () => {
    expect(HealthResponseSchema.safeParse(null).success).toBe(false);
    expect(HealthResponseSchema.safeParse('ok').success).toBe(false);
  });
});
