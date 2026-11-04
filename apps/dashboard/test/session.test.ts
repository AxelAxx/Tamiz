// @vitest-environment node
import * as crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { hashPassphrase, verifyPassphrase } from "../src/lib/server/passphrase";
import {
  clientAddress,
  createSessionStore,
  createSignInLimiter,
  createWindowLimiter,
  SESSION_TTL_MS,
} from "../src/lib/server/session";
import {
  sessionCookieHeader,
  signSession,
  verifySessionCookie,
} from "../src/lib/server/session-cookie";

// Spec 008 US1-2, US1-4, FR-001, research R-03, data-model §3.1-3.2 (tasks.md T002);
// US10 (visitor role and limits, backlog T-OPS-03).

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const SECRET = "a-session-secret-of-at-least-32-bytes!";

function fakeNow(start = Date.parse("2026-10-31T09:00:00.000Z")) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("passphrase hash", () => {
  it("US1-2: has the format scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>", () => {
    const stored = hashPassphrase("correct horse battery staple");
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*$/);
    const [, , , , salt, hash] = stored.split("$");
    expect(Buffer.from(salt ?? "", "base64")).toHaveLength(16);
    expect(Buffer.from(hash ?? "", "base64")).toHaveLength(32);
    // A fresh salt every time.
    expect(hashPassphrase("correct horse battery staple")).not.toBe(stored);
  });

  it("US1-2: verifies the right passphrase and refuses a wrong one, in constant time", () => {
    const stored = hashPassphrase("correct horse battery staple");
    vi.mocked(crypto.timingSafeEqual).mockClear();
    expect(verifyPassphrase("correct horse battery staple", stored)).toBe(true);
    expect(verifyPassphrase("Correct horse battery staple", stored)).toBe(false);
    expect(verifyPassphrase("", stored)).toBe(false);
    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(3);
  });

  it("US1-2: a malformed stored hash never verifies", () => {
    expect(verifyPassphrase("x", "scrypt$16384$8$1$c2FsdA==")).toBe(false);
    expect(verifyPassphrase("x", "plain")).toBe(false);
  });
});

describe("session cookie", () => {
  const claims = {
    nonce: "bm9uY2Utbm9uY2Utbm9uYw",
    role: "operator",
    expiresAt: Date.parse("2026-10-31T17:00:00.000Z"),
  } as const;

  it("US1-2: carries nonce, role and expiry, signed; a tampered cookie is invalid", () => {
    const value = signSession(claims, SECRET);
    expect(value.split(".")).toHaveLength(4);
    expect(verifySessionCookie(value, SECRET)).toEqual(claims);
    // The role cannot be raised by editing the cookie (FR-026).
    expect(verifySessionCookie(value.replace(".operator.", ".visitor."), SECRET)).toBeUndefined();
    expect(
      verifySessionCookie(signSession({ ...claims, role: "visitor" }, SECRET), SECRET)?.role,
    ).toBe("visitor");
    expect(verifySessionCookie(value.replace(/\.(\d+)\./, ".9$1."), SECRET)).toBeUndefined();
    expect(verifySessionCookie(`${value.slice(0, -1)}A`, SECRET)).toBeUndefined();
    expect(verifySessionCookie(value, `${SECRET}x`)).toBeUndefined();
    expect(verifySessionCookie("abc", SECRET)).toBeUndefined();
    expect(verifySessionCookie("", SECRET)).toBeUndefined();
  });

  it("refuses a well-signed payload that is not nonce.role.expiresAt", () => {
    const signRaw = (payload: string) =>
      `${payload}.${crypto.createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
    expect(verifySessionCookie(signRaw("n.operator.1"), SECRET)).toEqual({
      nonce: "n",
      role: "operator",
      expiresAt: 1,
    });
    for (const payload of [
      "abc",
      "n.admin.1",
      "n.operator.soon",
      "n.operator.1.extra",
      "n!.visitor.1",
    ]) {
      expect(verifySessionCookie(signRaw(payload), SECRET), payload).toBeUndefined();
    }
  });
});

describe("session store", () => {
  it("US1-2: a session lasts 8 hours, absolute", () => {
    const clock = fakeNow();
    const store = createSessionStore({ secret: SECRET, now: clock.now });
    const { cookie, expiresAt } = store.create();
    expect(SESSION_TTL_MS).toBe(8 * 60 * 60 * 1000);
    expect(expiresAt).toBe(clock.now() + SESSION_TTL_MS);
    expect(verifySessionCookie(cookie, SECRET)?.expiresAt).toBe(expiresAt);
    expect(store.isValid(cookie)).toBe(true);
    // Using the session does not extend it.
    clock.advance(SESSION_TTL_MS - 1);
    expect(store.isValid(cookie)).toBe(true);
    clock.advance(1);
    expect(store.isValid(cookie)).toBe(false);
  });

  it("T-OPS-04: a session holds in another process with the same secret", () => {
    const clock = fakeNow();
    const signedIn = createSessionStore({ secret: SECRET, now: clock.now });
    const elsewhere = createSessionStore({ secret: SECRET, now: clock.now });
    const { cookie } = signedIn.create("visitor");
    expect(elsewhere.roleOf(cookie)).toBe("visitor");
    // Another secret (a rotation) ends every session.
    expect(createSessionStore({ secret: `${SECRET}2`, now: clock.now }).isValid(cookie)).toBe(
      false,
    );
  });

  it("US1-2: the nonce is 16 random bytes and the cookie is signed", () => {
    const store = createSessionStore({ secret: SECRET, now: fakeNow().now });
    const { cookie } = store.create();
    const nonce = verifySessionCookie(cookie, SECRET)?.nonce;
    expect(Buffer.from(nonce ?? "", "base64url")).toHaveLength(16);
    expect(store.create().cookie).not.toBe(cookie);
    expect(store.isValid(cookie.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBe(false);
  });

  it("US1-4: sign-out revokes the session in this process, so a copied cookie stops working", () => {
    const store = createSessionStore({ secret: SECRET, now: fakeNow().now });
    const { cookie } = store.create();
    const other = store.create().cookie;
    store.revoke(cookie);
    expect(store.isValid(cookie)).toBe(false);
    expect(store.isValid(other)).toBe(true);
    expect(store.size()).toBe(1);
  });

  it("US10-2: a session has a role, operator by default, and loses it when it ends", () => {
    const clock = fakeNow();
    const store = createSessionStore({ secret: SECRET, now: clock.now });
    const operator = store.create().cookie;
    const visitor = store.create("visitor").cookie;
    expect(store.roleOf(operator)).toBe("operator");
    expect(store.roleOf(visitor)).toBe("visitor");
    store.revoke(visitor);
    expect(store.roleOf(visitor)).toBeUndefined();
    clock.advance(SESSION_TTL_MS);
    expect(store.roleOf(operator)).toBeUndefined();
  });

  it("sweeps revocations of expired sessions", () => {
    const clock = fakeNow();
    const store = createSessionStore({ secret: SECRET, now: clock.now });
    store.revoke(store.create().cookie);
    clock.advance(SESSION_TTL_MS / 2);
    store.revoke(store.create().cookie);
    clock.advance(SESSION_TTL_MS / 2);
    store.sweep();
    expect(store.size()).toBe(1);
  });
});

describe("sign-in rate limit", () => {
  it("US1-2: 5 failures per 60 s per address, then refused for 60 s", () => {
    const clock = fakeNow();
    const limiter = createSignInLimiter({ now: clock.now });
    for (let i = 0; i < 5; i++) {
      expect(limiter.check("203.0.113.1")).toEqual({ allowed: true });
      limiter.recordFailure("203.0.113.1");
    }
    expect(limiter.check("203.0.113.1")).toEqual({ allowed: false, retryAfterSeconds: 60 });
    // Another address is not affected.
    expect(limiter.check("203.0.113.2")).toEqual({ allowed: true });
    clock.advance(59_500);
    expect(limiter.check("203.0.113.1")).toEqual({ allowed: false, retryAfterSeconds: 1 });
    clock.advance(500);
    expect(limiter.check("203.0.113.1")).toEqual({ allowed: true });
  });

  it("US1-2: failures older than the window do not count", () => {
    const clock = fakeNow();
    const limiter = createSignInLimiter({ now: clock.now });
    for (let i = 0; i < 4; i++) limiter.recordFailure("a");
    clock.advance(60_000);
    limiter.recordFailure("a");
    expect(limiter.check("a")).toEqual({ allowed: true });
  });

  it("US1-2: a successful sign-in clears the failures", () => {
    const limiter = createSignInLimiter({ now: fakeNow().now });
    for (let i = 0; i < 4; i++) limiter.recordFailure("a");
    limiter.recordSuccess("a");
    for (let i = 0; i < 4; i++) limiter.recordFailure("a");
    expect(limiter.check("a")).toEqual({ allowed: true });
  });
});

describe("visitor limits", () => {
  it("US10-4, US10-5: 10 uses per fixed 60 s window per address, then Retry-After", () => {
    const clock = fakeNow();
    const limiter = createWindowLimiter({ now: clock.now });
    for (let i = 0; i < 10; i++) expect(limiter.take("a")).toEqual({ allowed: true });
    expect(limiter.take("a")).toEqual({ allowed: false, retryAfterSeconds: 60 });
    // Another address has its own window.
    expect(limiter.take("b")).toEqual({ allowed: true });
    clock.advance(45_000);
    expect(limiter.take("a")).toEqual({ allowed: false, retryAfterSeconds: 15 });
    clock.advance(15_000);
    expect(limiter.take("a")).toEqual({ allowed: true });
  });

  it("refused uses do not extend the window", () => {
    const clock = fakeNow();
    const limiter = createWindowLimiter({ now: clock.now, limit: 1, windowMs: 1000 });
    limiter.take("a");
    for (let i = 0; i < 5; i++) limiter.take("a");
    clock.advance(1000);
    expect(limiter.take("a")).toEqual({ allowed: true });
  });
});

describe("session cookie flags (code audit 2026-11-03, L12)", () => {
  it("is HttpOnly, SameSite=Strict, scoped to the site, and Secure on a public origin", () => {
    expect(sessionCookieHeader("v", "https://tamiz.example.com", 28_800)).toBe(
      "tamiz_session=v; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800; Secure",
    );
  });

  it("drops Secure only on a local address, and clears with Max-Age=0", () => {
    expect(sessionCookieHeader("v", "http://localhost:3100", 60)).not.toContain("Secure");
    expect(sessionCookieHeader("v", "http://127.0.0.1:3100", 60)).not.toContain("Secure");
    expect(sessionCookieHeader("", "https://tamiz.example.com", 0)).toContain("Max-Age=0;");
  });
});

describe("client address", () => {
  // The client sent the first hop; the trusted proxy appended the address it saw.
  const headers = new Headers({ "x-forwarded-for": "203.0.113.66, 198.51.100.7" });

  it("US1-2: X-Forwarded-For is used only with TAMIZ_DASHBOARD_TRUST_PROXY=true", () => {
    expect(clientAddress(headers, true)).toBe("198.51.100.7");
    // Without a trusted proxy the header is client-controlled: every attempt shares one
    // bucket, so a forged header cannot escape the limit.
    expect(clientAddress(headers, false)).toBe("direct");
    expect(clientAddress(new Headers(), false)).toBe("direct");
    expect(clientAddress(new Headers(), true)).toBe("unknown");
  });
});
