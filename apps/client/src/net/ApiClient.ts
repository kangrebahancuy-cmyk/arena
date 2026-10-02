import { ErrorResponseSchema } from '@project-realm/shared';
import type { z } from 'zod';

export type ApiErrorKind =
  /** The request never produced a response (server down, DNS, offline...). */
  | 'network'
  | 'timeout'
  /** The caller cancelled the request. */
  | 'aborted'
  /** The server answered with a non-2xx status. */
  | 'http'
  /** The server answered 2xx but the body was not what the shared contract promises. */
  | 'invalid-response';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | undefined;

  constructor(
    kind: ApiErrorKind,
    message: string,
    details: { status?: number; cause?: unknown } = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.status = details.status;
  }
}

export interface ApiClientOptions {
  /** Injectable for tests. Defaults to the browser's `fetch`. */
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

export interface GetOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Minimal typed HTTP client for the game server's REST API (auth, character list, ... from Phase 11).
 *
 * - Always same-origin: callers pass paths such as "/api/health"; a proxy routes them to the server.
 * - Every response body is validated against a shared zod schema: the network is never trusted.
 * - Every failure becomes an {@link ApiError} with a `kind`, so UI code never inspects raw exceptions.
 */
export class ApiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ApiClientOptions = {}) {
    // Wrapped in a lambda: calling a detached `window.fetch` as `this.fetchImpl(...)` throws "Illegal invocation".
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async get<TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options: GetOptions = {},
  ): Promise<z.output<TSchema>> {
    const callerSignal = options.signal;
    // A function (not an inline property check) because `aborted` can flip at any time: TypeScript
    // would otherwise narrow it to `false` after the first check and call later checks impossible.
    const callerAborted = (): boolean => callerSignal?.aborted === true;
    if (callerAborted()) {
      throw new ApiError('aborted', 'The request was cancelled');
    }

    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const forwardCallerAbort = (): void => {
      controller.abort();
    };
    callerSignal?.addEventListener('abort', forwardCallerAbort, { once: true });

    // Classifies whatever made the transfer fail (fetch itself or reading the body).
    const transportError = (cause: unknown): ApiError => {
      if (timedOut) {
        return new ApiError('timeout', `The server did not answer within ${timeoutMs} ms`, {
          cause,
        });
      }
      if (callerAborted()) {
        return new ApiError('aborted', 'The request was cancelled', { cause });
      }
      return new ApiError('network', 'Could not reach the server', { cause });
    };

    try {
      let response: Response;
      try {
        response = await this.fetchImpl(path, {
          method: 'GET',
          headers: { accept: 'application/json' },
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
      } catch (cause) {
        throw transportError(cause);
      }

      if (!response.ok) {
        throw await readHttpError(response);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (cause) {
        if (timedOut || callerAborted()) {
          throw transportError(cause);
        }
        throw new ApiError('invalid-response', 'The server sent a malformed response', {
          status: response.status,
          cause,
        });
      }

      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        throw new ApiError(
          'invalid-response',
          'The server response did not match the expected contract',
          { status: response.status, cause: parsed.error },
        );
      }
      return parsed.data;
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', forwardCallerAbort);
    }
  }
}

async function readHttpError(response: Response): Promise<ApiError> {
  let message = `The server answered with HTTP ${response.status}`;
  try {
    const parsed = ErrorResponseSchema.safeParse(await response.json());
    if (parsed.success) {
      message = parsed.data.message;
    }
  } catch {
    // Not JSON (for example an error page from a proxy): keep the generic message.
  }
  return new ApiError('http', message, { status: response.status });
}
