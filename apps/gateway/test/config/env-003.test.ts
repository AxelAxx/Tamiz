import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/infrastructure/config/env.js";

// Spec 003 FR-031, research R-11 (tasks.md T056): `REDIS_URL` selects the shared circuit
// state; without it the gateway keeps in-memory state. Never echoed.

const BASE = {
  TAMIZ_API_KEYS: `demo:${"0".repeat(64)}`,
  TAMIZ_PRIVACY_URL: "http://privacy.test:8001",
} as const;

describe("loadConfig, feature 003 settings", () => {
  it("leaves redisUrl absent when REDIS_URL is unset or empty", () => {
    for (const env of [BASE, { ...BASE, REDIS_URL: "" }]) {
      const result = loadConfig(env);
      expect(result.ok && result.value).not.toHaveProperty("redisUrl");
    }
  });

  it.each(["redis://valkey:6379", "rediss://user:pw@cache.example:6380/0"])("accepts %s", (url) => {
    const result = loadConfig({ ...BASE, REDIS_URL: url });

    expect(result.ok && result.value.redisUrl).toBe(url);
  });

  it("rejects another scheme without echoing the value", () => {
    const result = loadConfig({ ...BASE, REDIS_URL: "http://cache-SECRET:6379" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues).toEqual([
      { path: "REDIS_URL", message: "expected a redis:// or rediss:// URL" },
    ]);
    expect(JSON.stringify(result.error)).not.toContain("SECRET");
  });
});

describe("loadConfig, OpenTelemetry endpoints (code audit 2026-11-03, L8)", () => {
  it("accepts an http(s) collector URL and refuses a malformed one at boot", () => {
    expect(loadConfig({ ...BASE, OTEL_EXPORTER_OTLP_ENDPOINT: "http://jaeger:4318" }).ok).toBe(
      true,
    );
    const bad = loadConfig({ ...BASE, OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "jaeger-SECRET:4318" });

    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.issues.map((issue) => issue.path)).toEqual([
      "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
    ]);
    expect(JSON.stringify(bad.error)).not.toContain("SECRET");
  });
});
