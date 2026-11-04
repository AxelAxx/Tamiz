/**
 * `POST /api/session` signs in, `DELETE /api/session` signs out (spec 008 US1-2, US1-4,
 * research R-03), `GET /api/session` says which role the session has (US10). Writes check
 * the origin first; a wrong passphrase never says whether one is configured.
 */
import { SignInRequestSchema } from "@/lib/schemas";
import { publicWrite, read, sessionCookie, sessionWrite } from "@/lib/server/bff";
import { serverContext } from "@/lib/server/context";
import { bffError, rateLimited, readCookie, readJson } from "@/lib/server/handler";
import { verifyPassphrase } from "@/lib/server/passphrase";
import { clientAddress } from "@/lib/server/session";
import { SESSION_COOKIE } from "@/lib/server/session-cookie";

export const GET = read(async (request) => {
  const cookie = readCookie(request, SESSION_COOKIE) ?? "";
  const role = serverContext().sessions.roleOf(cookie);
  // `read` checked the session; it can still expire in between. Never assume the
  // more privileged role (code audit 2026-11-03, L12).
  if (role === undefined) return bffError(401, "unauthenticated", "Session expired");
  return Response.json({ role });
});

export const POST = publicWrite(async (request) => {
  const { env, sessions, signIn } = serverContext();
  const address = clientAddress(request.headers, env.trustProxy);
  const check = signIn.check(address);
  if (!check.allowed) {
    return rateLimited(check.retryAfterSeconds, "Too many failed attempts; try again later");
  }
  // Counted before the first `await`: concurrent attempts each see the ones before them,
  // so a burst cannot pass the check together. A success clears it (second audit, D1).
  signIn.recordFailure(address);
  const body = await readJson(request, SignInRequestSchema);
  if (!body.ok) return body.response;
  if (!(await verifyPassphrase(body.value.passphrase, env.passphraseHash))) {
    return bffError(401, "unauthenticated", "Wrong passphrase");
  }
  signIn.recordSuccess(address);
  const { cookie } = sessions.create("operator");
  return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie(cookie) } });
});

export const DELETE = sessionWrite(async (request) => {
  const cookie = readCookie(request, SESSION_COOKIE);
  if (cookie !== undefined) serverContext().sessions.revoke(cookie);
  return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie("", 0) } });
});
