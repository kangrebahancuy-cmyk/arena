/**
 * Account registration, login and session validation.
 *
 * TODO(phase-11): implement with
 *   - server-side sessions: an opaque random token, stored HASHED in the database and delivered only
 *     in an HttpOnly + SameSite cookie (never readable by JavaScript, never in localStorage);
 *   - Argon2id password hashing;
 *   - rate limiting per IP and per username (see `RequestContext`);
 *   - the same `authenticate` guarding the WebSocket upgrade, so a socket is bound to an account
 *     before a single game message is processed.
 *
 * Until an implementation exists the server MUST NOT register any /api/auth/* route and MUST NOT
 * behave as if somebody were logged in. Do not add an "always succeeds" stand-in to unblock UI work.
 */
export interface AuthService {
  register(credentials: Credentials, context: RequestContext): Promise<RegisterResult>;
  login(credentials: Credentials, context: RequestContext): Promise<LoginResult>;
  /** Invalidates the session server-side (not just by clearing the cookie). */
  logout(sessionToken: string): Promise<void>;
  /** Resolves a session token to its account, or `null` when it is unknown, expired or revoked. */
  authenticate(sessionToken: string): Promise<AccountSummary | null>;
}

export interface Credentials {
  readonly username: string;
  readonly password: string;
}

/** Facts about the caller that rate limiting and auditing need. Always derived by the server. */
export interface RequestContext {
  readonly ip: string;
  readonly userAgent?: string;
}

export interface AccountSummary {
  readonly id: string;
  readonly username: string;
}

export interface IssuedSession {
  /** Raw token. Returned exactly once, to be placed in the session cookie. */
  readonly token: string;
  readonly expiresAt: Date;
}

export type RegisterResult =
  | { readonly ok: true; readonly account: AccountSummary }
  | {
      readonly ok: false;
      readonly reason: 'username_taken' | 'invalid_username' | 'weak_password';
    };

export type LoginResult =
  | { readonly ok: true; readonly account: AccountSummary; readonly session: IssuedSession }
  | {
      readonly ok: false;
      readonly reason: 'invalid_credentials' | 'rate_limited' | 'account_disabled';
    };
