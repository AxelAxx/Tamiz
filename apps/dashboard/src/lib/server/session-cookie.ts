/**
 * The signed session cookie (spec 008 research R-03, amendment `T-OPS-04`):
 * `<nonce>.<role>.<expiresAt>.<HMAC-SHA-256 base64url>`. Stateless: any process with the
 * secret verifies it, so sessions survive restarts and serverless instances.
 *
 * Free of `server-only` because `proxy.ts` checks the cookie too; the secret is always
 * passed in, never read here.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "tamiz_session";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The `Set-Cookie` value of a session cookie: never readable by scripts, never sent
 * cross-site, and `Secure` except on a local address. `maxAgeSeconds` 0 clears it.
 */
export function sessionCookieHeader(
  value: string,
  publicOrigin: string,
  maxAgeSeconds: number,
): string {
  const secure = LOCAL_HOSTS.has(new URL(publicOrigin).hostname) ? "" : "; Secure";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

export type SessionRole = "operator" | "visitor";

export interface SessionClaims {
  readonly nonce: string;
  readonly role: SessionRole;
  /** Epoch milliseconds. */
  readonly expiresAt: number;
}

const isRole = (value: string): value is SessionRole => value === "operator" || value === "visitor";
const NONCE = /^[A-Za-z0-9_-]+$/;
const EPOCH_MS = /^\d{1,15}$/;

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signSession(claims: SessionClaims, secret: string): string {
  const payload = `${claims.nonce}.${claims.role}.${claims.expiresAt}`;
  return `${payload}.${signature(payload, secret)}`;
}

/**
 * The claims when the signature is right and the payload is well formed, else
 * `undefined`. Expiry is the caller's check (it needs the clock).
 */
export function verifySessionCookie(value: string, secret: string): SessionClaims | undefined {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const payload = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(signature(payload, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  const [nonce, role, expiresAt, ...rest] = payload.split(".");
  if (rest.length > 0 || nonce === undefined || role === undefined || expiresAt === undefined) {
    return undefined;
  }
  if (!NONCE.test(nonce) || !isRole(role) || !EPOCH_MS.test(expiresAt)) return undefined;
  return { nonce, role, expiresAt: Number(expiresAt) };
}
