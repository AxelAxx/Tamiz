/**
 * The secrets of the Docker Compose stack (T-OPS-01): the gateway's client and admin API
 * keys, its audit hash key, and the dashboard's admin key, passphrase hash and session
 * secret. Network addresses are not here: `docker-compose.yml` sets them per service.
 *
 * Keys follow the gateway's format (spec 002 research R-10): `tmz_` + 32 random bytes in
 * base64url, configured as `clientId:sha256hex`. Only the hashes go to the gateway.
 */
import { createHash, randomBytes } from "node:crypto";
import { hashPassphrase } from "../src/lib/server/passphrase";

export interface ComposeEnvFiles {
  /** `apps/gateway/.env.docker` */
  readonly gateway: string;
  /** `apps/dashboard/.env.docker` */
  readonly dashboard: string;
  /** Shown once to the operator; never written to disk. */
  readonly keys: { readonly demo: string; readonly ops: string };
}

interface GeneratedKey {
  readonly key: string;
  readonly entry: string;
}

function apiKey(clientId: string): GeneratedKey {
  const key = `tmz_${randomBytes(32).toString("base64url")}`;
  return { key, entry: `${clientId}:${createHash("sha256").update(key).digest("hex")}` };
}

export function composeEnvFiles(passphrase: string): ComposeEnvFiles {
  const demo = apiKey("demo");
  const ops = apiKey("ops");
  const dashboard = apiKey("dashboard");
  const gateway = [
    "# Tamiz gateway secrets for docker compose (pnpm compose:env). Never commit this file.",
    `TAMIZ_API_KEYS=${demo.entry}`,
    `TAMIZ_ADMIN_API_KEYS=${ops.entry},${dashboard.entry}`,
    `TAMIZ_AUDIT_HASH_KEY=${randomBytes(48).toString("base64url")}`,
    "# local-only.yaml needs no cloud key. For policies/default.yaml, set the three keys below.",
    "TAMIZ_POLICY_FILE=policies/local-only.yaml",
    "MISTRAL_API_KEY=",
    "ANTHROPIC_API_KEY=",
    "OPENAI_API_KEY=",
    "",
  ].join("\n");
  const dashboardFile = [
    "# Tamiz dashboard secrets for docker compose (pnpm compose:env). Never commit this file.",
    `TAMIZ_DASHBOARD_ADMIN_KEY=${dashboard.key}`,
    `TAMIZ_DASHBOARD_PASSPHRASE_HASH=${hashPassphrase(passphrase)}`,
    `TAMIZ_DASHBOARD_SESSION_SECRET=${randomBytes(48).toString("base64url")}`,
    "",
  ].join("\n");
  return { gateway, dashboard: dashboardFile, keys: { demo: demo.key, ops: ops.key } };
}
