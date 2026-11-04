// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { composeEnvFiles } from "../scripts/compose-env-files";
import { parseEnv } from "../src/lib/server/env";
import { verifyPassphrase } from "../src/lib/server/passphrase";

// T-OPS-01: the secrets `pnpm compose:env` writes for docker compose.

const PASSPHRASE = "correct horse battery";

function parse(file: string): ReadonlyMap<string, string> {
  const entries = file
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)] as const;
    });
  return new Map(entries);
}

const sha256 = (key: string) => createHash("sha256").update(key).digest("hex");

describe("compose env files", () => {
  const files = composeEnvFiles(PASSPHRASE);
  const gateway = parse(files.gateway);
  const dashboard = parse(files.dashboard);

  it("configures the demo client key and the ops and dashboard admin keys by their hashes", () => {
    expect(gateway.get("TAMIZ_API_KEYS")).toBe(`demo:${sha256(files.keys.demo)}`);
    const admins = gateway.get("TAMIZ_ADMIN_API_KEYS")?.split(",") ?? [];
    expect(admins).toEqual([
      `ops:${sha256(files.keys.ops)}`,
      `dashboard:${sha256(dashboard.get("TAMIZ_DASHBOARD_ADMIN_KEY") ?? "")}`,
    ]);
    for (const key of [
      files.keys.demo,
      files.keys.ops,
      dashboard.get("TAMIZ_DASHBOARD_ADMIN_KEY"),
    ]) {
      expect(key).toMatch(/^tmz_[A-Za-z0-9_-]{43}$/);
      expect(files.gateway).not.toContain(key);
    }
  });

  it("gives the audit log a hash key of at least 32 characters and the local-only policy", () => {
    expect(gateway.get("TAMIZ_AUDIT_HASH_KEY")?.length).toBeGreaterThanOrEqual(32);
    expect(gateway.get("TAMIZ_POLICY_FILE")).toBe("policies/local-only.yaml");
  });

  it("is a valid dashboard configuration once compose adds the addresses", async () => {
    const result = parseEnv({
      ...Object.fromEntries(dashboard),
      TAMIZ_GATEWAY_URL: "http://gateway:3000",
      TAMIZ_DASHBOARD_PUBLIC_URL: "http://localhost:3100",
    });
    expect(result.ok).toBe(true);
    expect(
      await verifyPassphrase(PASSPHRASE, dashboard.get("TAMIZ_DASHBOARD_PASSPHRASE_HASH") ?? ""),
    ).toBe(true);
  });

  it("generates new secrets every time", () => {
    const again = composeEnvFiles(PASSPHRASE);
    expect(again.keys.demo).not.toBe(files.keys.demo);
    expect(again.dashboard).not.toBe(files.dashboard);
  });
});
