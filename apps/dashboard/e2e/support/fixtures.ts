/**
 * Test values shared by `playwright.config.ts` and the specs. None is a real secret: the
 * E2E gateway (`apps/gateway/scripts/e2e-gateway.ts`) and the dashboard are started with
 * them for the browser flows only.
 */
import { resolve } from "node:path";

export const DASHBOARD_PORT = 3100;
/** A second dashboard on the same build with visitor access off (spec 008 US10-1). */
export const NO_VISITOR_DASHBOARD_PORT = 3102;
export const GATEWAY_PORT = 3210;
export const CONTROL_PORT = 3211;

export const DASHBOARD_URL = `http://localhost:${DASHBOARD_PORT}`;
export const NO_VISITOR_DASHBOARD_URL = `http://localhost:${NO_VISITOR_DASHBOARD_PORT}`;
export const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}`;
export const CONTROL_URL = `http://127.0.0.1:${CONTROL_PORT}`;

export const ADMIN_KEY = "tmz_e2e-dashboard-admin-key-not-a-secret-0000";
export const CLIENT_KEY = "tmz_e2e-demo-client-key-not-a-secret-000000";
export const PASSPHRASE = "e2e operator passphrase, not a secret";
export const SESSION_SECRET = "e2e-session-secret-not-a-secret-0123456789";

/** The dashboard's reports folder in the browser flows; `evals.spec.ts` fills it per test. */
export const EVALS_DIR = resolve(import.meta.dirname, "../.evals");

/** The pages behind the sign-in (spec 008 US1-1). */
export const PAGES = [
  "/",
  "/live",
  "/simulator",
  "/audit",
  "/policy",
  "/evals",
  "/providers",
  "/cost",
] as const;

/**
 * The data endpoints, each with a request that is valid once signed in.
 */
export const DATA_ENDPOINTS = [
  { method: "GET", path: "/api/gateway-health" },
  { method: "GET", path: "/api/audit?limit=10" },
  {
    method: "GET",
    path: "/api/cost?from=2026-10-01T00:00:00.000Z&to=2026-11-01T00:00:00.000Z",
  },
  { method: "GET", path: "/api/providers?windowMinutes=15" },
  { method: "GET", path: "/api/policy" },
  { method: "GET", path: "/api/evals" },
  {
    method: "POST",
    path: "/api/simulate",
    body: {
      model: "tamiz-auto",
      messages: [{ role: "user", content: "Resume el expediente de 12345678Z para el comité." }],
    },
  },
] as const;
