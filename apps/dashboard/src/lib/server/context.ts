/**
 * The dashboard server's state, built once from the validated configuration.
 *
 * Kept on `globalThis`: Next.js may bundle route handlers apart, and a session created by
 * `/api/session` must be visible to every other handler of the same process.
 */
import "server-only";
import { type DashboardEnv, loadEnvOrExit } from "./env";
import { createGatewayClient, type GatewayCallLog, type GatewayClient } from "./gateway";
import {
  createSessionStore,
  createSignInLimiter,
  createWindowLimiter,
  type SessionStore,
  type SignInLimiter,
  type WindowLimiter,
} from "./session";

export interface ServerContext {
  readonly env: DashboardEnv;
  readonly sessions: SessionStore;
  readonly signIn: SignInLimiter;
  /** Spec US10-5, US10-4: visitor sessions created and visitor simulations, per address. */
  readonly visitorSessions: WindowLimiter;
  readonly visitorSimulations: WindowLimiter;
  readonly gateway: GatewayClient;
  readonly log: (line: GatewayCallLog) => void;
}

const KEY = Symbol.for("tamiz.dashboard.context");
const SWEEP_EVERY_MS = 10 * 60 * 1000;

function build(): ServerContext {
  const env = loadEnvOrExit();
  const sessions = createSessionStore({ secret: env.sessionSecret, now: Date.now });
  setInterval(() => sessions.sweep(), SWEEP_EVERY_MS).unref();
  return {
    env,
    sessions,
    signIn: createSignInLimiter({ now: Date.now }),
    visitorSessions: createWindowLimiter({ now: Date.now }),
    visitorSimulations: createWindowLimiter({ now: Date.now }),
    gateway: createGatewayClient({ baseUrl: env.gatewayUrl, adminKey: env.adminKey }),
    log: (line) => process.stdout.write(`${JSON.stringify({ msg: "gateway call", ...line })}\n`),
  };
}

export function serverContext(): ServerContext {
  const holder = globalThis as { [KEY]?: ServerContext };
  holder[KEY] ??= build();
  return holder[KEY];
}
