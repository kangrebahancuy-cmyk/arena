import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PROTOCOL_VERSION } from '../constants';
import {
  MessageEnvelopeSchema,
  decodeMessageFrame,
  encodeMessageFrame,
  type ClientIntent,
  type MessageRegistry,
  type MessageOf,
} from './messages';

/**
 * A registry that exists only in this test: the real message kinds are designed in Phase 10, and
 * inventing game traffic here would be exactly the "fake networking" this project forbids.
 */
const TEST_REGISTRY = {
  'example/move-intent': z.object({ direction: z.enum(['north', 'east', 'south', 'west']) }),
  'example/frame-count': z.object({ frames: z.number().int().nonnegative() }),
} satisfies MessageRegistry;

type TestIntent = MessageOf<typeof TEST_REGISTRY>;

describe('MessageEnvelopeSchema', () => {
  it('accepts a well-formed frame', () => {
    const frame = {
      v: PROTOCOL_VERSION,
      kind: 'example/move-intent',
      payload: { direction: 'east' },
    };

    expect(MessageEnvelopeSchema.parse(frame)).toEqual(frame);
  });

  it.each([
    ['a missing version', { kind: 'x', payload: {} }],
    ['a string version', { v: '1', kind: 'x', payload: {} }],
    ['an empty kind', { v: 1, kind: '', payload: {} }],
    ['a non-object frame', 'hello'],
    ['null', null],
  ])('rejects %s', (_label, frame) => {
    expect(MessageEnvelopeSchema.safeParse(frame).success).toBe(false);
  });
});

describe('decodeMessageFrame', () => {
  const validIntent = {
    v: PROTOCOL_VERSION,
    kind: 'example/move-intent',
    payload: { direction: 'east' },
  };

  it('returns a typed message when kind, payload and version all match', () => {
    const intent: TestIntent | null = decodeMessageFrame(TEST_REGISTRY, validIntent);

    expect(intent).toEqual({ kind: 'example/move-intent', payload: { direction: 'east' } });
  });

  it('rejects a frame from another protocol version instead of guessing', () => {
    expect(
      decodeMessageFrame(TEST_REGISTRY, { ...validIntent, v: PROTOCOL_VERSION + 1 }),
    ).toBeNull();
  });

  it('rejects a kind the registry does not know', () => {
    expect(
      decodeMessageFrame(TEST_REGISTRY, { ...validIntent, kind: 'example/unknown' }),
    ).toBeNull();
  });

  it('rejects a payload that does not match the kind schema', () => {
    expect(
      decodeMessageFrame(TEST_REGISTRY, { ...validIntent, payload: { direction: 'up' } }),
    ).toBeNull();
  });

  it('strips unknown payload fields, so a newer sender cannot smuggle state in', () => {
    const decoded = decodeMessageFrame(TEST_REGISTRY, {
      ...validIntent,
      payload: { direction: 'north', position: { x: 999, y: 999 } },
    });

    expect(decoded).toEqual({ kind: 'example/move-intent', payload: { direction: 'north' } });
  });

  it('never throws, whatever arrives on the wire', () => {
    for (const frame of [undefined, null, 0, 'nonsense', [], { v: 1 }]) {
      expect(() => decodeMessageFrame(TEST_REGISTRY, frame)).not.toThrow();
    }
  });
});

describe('encodeMessageFrame', () => {
  it('round-trips a message through the wire frame', () => {
    const intent: ClientIntent<typeof TEST_REGISTRY> = {
      kind: 'example/frame-count',
      payload: { frames: 12 },
    };

    const frame = encodeMessageFrame(intent);

    expect(frame).toEqual({
      v: PROTOCOL_VERSION,
      kind: 'example/frame-count',
      payload: { frames: 12 },
    });
    expect(decodeMessageFrame(TEST_REGISTRY, frame)).toEqual(intent);
  });

  it('stamps the version every receiver checks', () => {
    const frame = encodeMessageFrame({ kind: 'example/frame-count', payload: { frames: 0 } }, 7);

    expect(frame.v).toBe(7);
    expect(decodeMessageFrame(TEST_REGISTRY, frame)).toBeNull(); // version 7 is not this build's
  });
});
