/**
 * `POST /api/session/visitor` opens a read-only visitor session (spec 008 US10-1, US10-2,
 * US10-5): `404` while visitor access is off, at most 10 per minute per address.
 */
import { publicWrite, sessionCookie } from "@/lib/server/bff";
import { serverContext } from "@/lib/server/context";
import { bffError, rateLimited } from "@/lib/server/handler";
import { clientAddress } from "@/lib/server/session";

export const POST = publicWrite(async (request) => {
  const { env, sessions, visitorSessions } = serverContext();
  if (!env.visitorAccess) return bffError(404, "not_found", "Visitor access is off");
  const check = visitorSessions.take(clientAddress(request.headers, env.trustProxy));
  if (!check.allowed) {
    return rateLimited(check.retryAfterSeconds, "Too many visitor sessions; try again later");
  }
  const { cookie } = sessions.create("visitor");
  return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie(cookie) } });
});
