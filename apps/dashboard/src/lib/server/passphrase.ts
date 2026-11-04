/**
 * The operator passphrase hash (spec 008 research R-03): `scrypt$<N>$<r>$<p>$<salt>$<hash>`
 * with base64 salt and hash, compared in constant time.
 *
 * Free of `server-only` on purpose: `scripts/hash-passphrase.ts` and the Playwright
 * configuration use it outside Next.js. It holds no secret itself.
 */
import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

const DEFAULTS = { N: 16_384, r: 8, p: 1, saltBytes: 16, keyBytes: 32 } as const;

export function hashPassphrase(passphrase: string): string {
  const { N, r, p, saltBytes, keyBytes } = DEFAULTS;
  const salt = randomBytes(saltBytes);
  const hash = scryptSync(passphrase, salt, keyBytes, { N, r, p });
  return ["scrypt", N, r, p, salt.toString("base64"), hash.toString("base64")].join("$");
}

/**
 * Whether `passphrase` matches `stored`. Asynchronous: scrypt runs in libuv's pool, so a
 * burst of sign-in attempts never blocks the event loop that serves every other screen
 * (second code audit, 2026-11-04, D1).
 */
export async function verifyPassphrase(passphrase: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || salt === undefined || hash === undefined) return false;
  const expected = Buffer.from(hash, "base64");
  if (expected.length === 0) return false;
  const options = { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 };
  const actual = await new Promise<Buffer | undefined>((resolve) => {
    scrypt(passphrase, Buffer.from(salt, "base64"), expected.length, options, (error, key) =>
      resolve(error === null ? key : undefined),
    );
  });
  return actual !== undefined && timingSafeEqual(actual, expected);
}
