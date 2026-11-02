/**
 * The kinds of data endpoint (spec 008 `contracts/dashboard-bff.md`): reads need a session;
 * writes check the origin first, then the session, then the role. Every answer is
 * `no-store`.
 */
import "server-only";
import { serverContext } from "./context";
import {
  compose,
  type RouteHandler,
  rateLimited,
  readCookie,
  type Wrapper,
  withNoStore,
  withOrigin,
  withRole,
  withSession,
} from "./handler";
import { clientAddress, SESSION_TTL_MS } from "./session";
import { SESSION_COOKIE } from "./session-cookie";

const session = withSession(SESSION_COOKIE, (cookie) => serverContext().sessions.isValid(cookie));
const operator = withRole(
  SESSION_COOKIE,
  (cookie) => serverContext().sessions.roleOf(cookie),
  "operator",
);
const origin = withOrigin(() => serverContext().env.publicOrigin);

/** US10-4: visitor sessions share a per-address budget; operators have none. */
const visitorBudget: Wrapper = (handler) => async (request) => {
  const { env, sessions, visitorSimulations } = serverContext();
  const cookie = readCookie(request, SESSION_COOKIE);
  if (cookie === undefined || sessions.roleOf(cookie) !== "visitor") return handler(request);
  const check = visitorSimulations.take(clientAddress(request.headers, env.trustProxy));
  return check.allowed
    ? handler(request)
    : rateLimited(check.retryAfterSeconds, "Too many simulations; try again in a minute");
};

/** Any session, operator or visitor. */
export const read = (handler: RouteHandler): RouteHandler => compose(withNoStore, session)(handler);

/** Writes that change the gateway: operator sessions only (US10-3). */
export const write = (handler: RouteHandler): RouteHandler =>
  compose(withNoStore, origin, session, operator)(handler);

/** Writes any session may make: sign-out, and the simulator with the visitor budget. */
export const sessionWrite = (handler: RouteHandler): RouteHandler =>
  compose(withNoStore, origin, session)(handler);

export const simulateWrite = (handler: RouteHandler): RouteHandler =>
  compose(withNoStore, origin, session, visitorBudget)(handler);

/** Writes that need no session (sign-in): origin only. */
export const publicWrite = (handler: RouteHandler): RouteHandler =>
  compose(withNoStore, origin)(handler);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The `Set-Cookie` value of a session cookie; `Secure` except on a local address. */
export function sessionCookie(value: string, maxAgeSeconds = SESSION_TTL_MS / 1000): string {
  const { hostname } = new URL(serverContext().env.publicOrigin);
  const secure = LOCAL_HOSTS.has(hostname) ? "" : "; Secure";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}
