import { describe, expect, it } from 'vitest';
import { ERROR_CODES, ErrorResponseSchema } from './error';

describe('ErrorResponseSchema', () => {
  it('accepts every documented error code', () => {
    for (const code of ERROR_CODES) {
      expect(ErrorResponseSchema.safeParse({ error: code, message: 'x' }).success).toBe(true);
    }
  });

  it('accepts codes introduced by a newer server', () => {
    expect(ErrorResponseSchema.safeParse({ error: 'brand_new_code', message: 'x' }).success).toBe(
      true,
    );
  });

  it('rejects bodies without a code or a message', () => {
    expect(ErrorResponseSchema.safeParse({ message: 'x' }).success).toBe(false);
    expect(ErrorResponseSchema.safeParse({ error: 'bad_request' }).success).toBe(false);
    expect(ErrorResponseSchema.safeParse({ error: '', message: 'x' }).success).toBe(false);
  });
});
