import { z } from 'zod';

/**
 * Stable, machine-readable error codes returned by the HTTP API.
 * Clients may branch on these; human-readable text lives in `message`.
 */
export const ERROR_CODES = [
  'bad_request',
  'not_found',
  'payload_too_large',
  'too_many_requests',
  'internal_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Body of every non-2xx response from the HTTP API.
 *
 * `error` is a plain string on purpose: a newer server may introduce codes an older client does
 * not know yet, and the client must still be able to parse (and display) the response.
 */
export const ErrorResponseSchema = z.object({
  error: z.string().min(1),
  message: z.string(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
