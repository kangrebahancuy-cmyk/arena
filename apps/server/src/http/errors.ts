import type { ErrorCode, ErrorResponse } from '@project-realm/shared';

/** Builds a body that satisfies the shared `ErrorResponseSchema` contract. */
export function errorBody(code: ErrorCode, message: string): ErrorResponse {
  return { error: code, message };
}

/** Maps an HTTP status to the stable error code documented in `@project-realm/shared`. */
export function errorCodeForStatus(statusCode: number): ErrorCode {
  switch (statusCode) {
    case 404:
      return 'not_found';
    case 413:
      return 'payload_too_large';
    case 429:
      return 'too_many_requests';
    default:
      return statusCode >= 500 ? 'internal_error' : 'bad_request';
  }
}
