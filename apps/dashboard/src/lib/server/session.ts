/**
 * Sessions and the rate limits, in memory (spec 008 FR-001, FR-026, FR-028, research R-03,
 * data-model §3.1-3.2). A restart signs everyone out; that is accepted for one instance.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { signSessionId, verifySessionCookie } from "./session-cookie";

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/** Who a session belongs to (US10): the server holds it, the cookie never carries it. */
export type SessionRole = "operator" | "visitor";

export interface SessionStore {
  /** A new session; the cookie carries `id.signature`. */
  create(role?: SessionRole): { readonly cookie: string; readonly expiresAt: number };
  /** The signature is right and the session exists and has not expired. */
  isValid(cookie: string): boolean;
  /** The role of a valid session, else `undefined`. */
  roleOf(cookie: string): SessionRole | undefined;
  revoke(cookie: string): void;
  /** Removes expired sessions. */
  sweep(): void;
  size(): number;
}

export function createSessionStore(deps: {
  readonly secret: string;
  readonly now: () => number;
  readonly ttlMs?: number;
}): SessionStore {
  const ttlMs = deps.ttlMs ?? SESSION_TTL_MS;
  const sessions = new Map<string, { readonly expiresAt: number; readonly role: SessionRole }>();
  const idOf = (cookie: string) => verifySessionCookie(cookie, deps.secret);
  const roleOf = (cookie: string): SessionRole | undefined => {
    const id = idOf(cookie);
    if (id === undefined) return undefined;
    const session = sessions.get(id);
    if (session === undefined) return undefined;
    if (deps.now() >= session.expiresAt) {
      sessions.delete(id);
      return undefined;
    }
    return session.role;
  };
  return {
    create(role = "operator") {
      const id = randomBytes(32).toString("base64url");
      const expiresAt = deps.now() + ttlMs;
      sessions.set(id, { expiresAt, role });
      return { cookie: signSessionId(id, deps.secret), expiresAt };
    },
    isValid: (cookie) => roleOf(cookie) !== undefined,
    roleOf,
    revoke(cookie) {
      const id = idOf(cookie);
      if (id !== undefined) sessions.delete(id);
    },
    sweep() {
      const now = deps.now();
      for (const [id, { expiresAt }] of sessions) if (now >= expiresAt) sessions.delete(id);
    },
    size: () => sessions.size,
  };
}

export type SignInCheck =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

export interface SignInLimiter {
  check(address: string): SignInCheck;
  recordFailure(address: string): void;
  recordSuccess(address: string): void;
}

/** US1-2: `maxFailures` per `windowMs` per address, then refused for `blockMs`. */
export function createSignInLimiter(deps: {
  readonly now: () => number;
  readonly maxFailures?: number;
  readonly windowMs?: number;
  readonly blockMs?: number;
}): SignInLimiter {
  const maxFailures = deps.maxFailures ?? 5;
  const windowMs = deps.windowMs ?? 60_000;
  const blockMs = deps.blockMs ?? 60_000;
  const attempts = new Map<
    string,
    { failures: number; windowStart: number; blockedUntil?: number }
  >();
  return {
    check(address) {
      const blockedUntil = attempts.get(address)?.blockedUntil;
      const now = deps.now();
      if (blockedUntil === undefined || now >= blockedUntil) return { allowed: true };
      return { allowed: false, retryAfterSeconds: Math.ceil((blockedUntil - now) / 1000) };
    },
    recordFailure(address) {
      const now = deps.now();
      const current = attempts.get(address);
      const fresh =
        current === undefined ||
        now - current.windowStart >= windowMs ||
        (current.blockedUntil !== undefined && now >= current.blockedUntil);
      const entry = fresh ? { failures: 0, windowStart: now } : current;
      entry.failures += 1;
      if (entry.failures >= maxFailures) entry.blockedUntil = now + blockMs;
      attempts.set(address, entry);
    },
    recordSuccess(address) {
      attempts.delete(address);
    },
  };
}

export interface WindowLimiter {
  /** Counts one use by `address`; refused once `limit` uses fall in the current window. */
  take(address: string): SignInCheck;
}

const MAX_TRACKED_ADDRESSES = 10_000;

/** US10-4, US10-5: `limit` uses per fixed `windowMs` window per address. */
export function createWindowLimiter(deps: {
  readonly now: () => number;
  readonly limit?: number;
  readonly windowMs?: number;
}): WindowLimiter {
  const limit = deps.limit ?? 10;
  const windowMs = deps.windowMs ?? 60_000;
  const windows = new Map<string, { count: number; windowStart: number }>();
  return {
    take(address) {
      const now = deps.now();
      const current = windows.get(address);
      const entry =
        current === undefined || now - current.windowStart >= windowMs
          ? { count: 0, windowStart: now }
          : current;
      if (entry.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil((entry.windowStart + windowMs - now) / 1000),
        };
      }
      entry.count += 1;
      windows.set(address, entry);
      // A public demo sees many addresses: past windows are dropped once the map grows.
      if (windows.size > MAX_TRACKED_ADDRESSES) {
        for (const [key, { windowStart }] of windows) {
          if (now - windowStart >= windowMs) windows.delete(key);
        }
      }
      return { allowed: true };
    },
  };
}

/**
 * The address the rate limit counts by. Next.js route handlers do not expose the socket,
 * and Next.js keeps a client-sent `X-Forwarded-For`, so the header is used only behind a
 * trusted proxy (`TAMIZ_DASHBOARD_TRUST_PROXY=true`, first hop). Otherwise every attempt
 * shares one bucket: a forged header cannot escape the limit.
 */
export function clientAddress(headers: Headers, trustProxy: boolean): string {
  if (!trustProxy) return "direct";
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first === undefined || first === "" ? "unknown" : first;
}
