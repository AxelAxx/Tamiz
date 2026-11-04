import { HealthResponseSchema } from "@tamiz/contracts";
import { createFakeClock } from "@tamiz/test-utils";
import { describe, expect, it } from "vitest";
import type { HealthProbe } from "../src/application/ports/health-probe.port.js";
import { circuitStoreProbe, privacyServiceProbe } from "../src/infrastructure/health/probes.js";
import { createApp } from "../src/presentation/app.js";
import { NO_CHAT } from "./helpers/app.js";
import { noopLogger } from "./helpers/noop-logger.js";

// Spec 001, US3 scenarios 1 and 2 (FR-017): GET /health matches the health contract and
// is exercised in-process through app.request(), without a socket. Time comes from the
// shared fake clock (US7, research R-09), which satisfies ClockPort structurally.

describe("GET /health", () => {
  it("US3-1/US3-2: answers 200 with a body that validates against HealthResponseSchema", async () => {
    const startedAt = new Date("2026-01-01T00:00:00Z");
    const clock = createFakeClock(startedAt);
    clock.advance(1234);
    const app = createApp({ clock, version: "9.9.9", startedAt, logger: noopLogger, ...NO_CHAT });

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    const body = HealthResponseSchema.parse(await response.json());
    expect(body.status).toBe("ok");
    expect(body.version).toBe("9.9.9");
    expect(body.uptimeMs).toBe(1234);
    expect(body.checks).toBeUndefined();
  });

  it("reports zero uptime right after start and never a negative value", async () => {
    const startedAt = new Date("2026-01-01T00:00:00Z");
    const clock = createFakeClock(startedAt);
    const app = createApp({ clock, version: "0.1.0", startedAt, logger: noopLogger, ...NO_CHAT });

    const atStart = HealthResponseSchema.parse(await (await app.request("/health")).json());
    expect(atStart.uptimeMs).toBe(0);

    clock.advance(-500);
    const beforeStart = HealthResponseSchema.parse(await (await app.request("/health")).json());
    expect(beforeStart.uptimeMs).toBe(0);
  });

  it("US3-4: carries an x-request-id header", async () => {
    const startedAt = new Date("2026-01-01T00:00:00Z");
    const app = createApp({
      clock: createFakeClock(startedAt),
      version: "0.1.0",
      startedAt,
      logger: noopLogger,
      ...NO_CHAT,
    });
    const response = await app.request("/health");
    expect(response.headers.get("x-request-id")).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
  });

  it("SC-007: answers in under 50 ms in-process", async () => {
    const startedAt = new Date("2026-01-01T00:00:00Z");
    const app = createApp({
      clock: createFakeClock(startedAt),
      version: "0.1.0",
      startedAt,
      logger: noopLogger,
      ...NO_CHAT,
    });
    await app.request("/health"); // warm up the router once
    const before = performance.now();
    const response = await app.request("/health");
    const elapsed = performance.now() - before;
    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(50);
  });
});

describe("GET /health with dependency probes (code audit 2026-11-03, M12)", () => {
  const startedAt = new Date("2026-01-01T00:00:00Z");
  const probe = (name: string, status: "ok" | "degraded" | "down"): HealthProbe => ({
    name,
    check: async () => (status === "ok" ? { status } : { status, detail: "fixed detail" }),
  });
  const appWith = (healthProbes: HealthProbe[]) =>
    createApp({
      clock: createFakeClock(startedAt),
      version: "0.1.0",
      startedAt,
      logger: noopLogger,
      healthProbes,
      ...NO_CHAT,
    });

  it("every probe ok: 200, status ok, each check listed", async () => {
    const response = await appWith([probe("privacy", "ok"), probe("database", "ok")]).request(
      "/health",
    );
    expect(response.status).toBe(200);
    const body = HealthResponseSchema.parse(await response.json());
    expect(body).toMatchObject({
      status: "ok",
      checks: [
        { name: "privacy", status: "ok" },
        { name: "database", status: "ok" },
      ],
    });
  });

  it("a degraded probe: 200 and status degraded; the gateway still works", async () => {
    const response = await appWith([
      probe("privacy", "ok"),
      probe("circuit-state", "degraded"),
    ]).request("/health");
    expect(response.status).toBe(200);
    expect(HealthResponseSchema.parse(await response.json()).status).toBe("degraded");
  });

  it("a probe down: 503 and the check named", async () => {
    const response = await appWith([probe("privacy", "down")]).request("/health");
    expect(response.status).toBe(503);
    expect(HealthResponseSchema.parse(await response.json()).checks).toEqual([
      { name: "privacy", status: "down", detail: "fixed detail" },
    ]);
  });

  it("the privacy probe: ok on a 2xx, down on an error status or no answer, no address", async () => {
    const answering = (status: number) =>
      privacyServiceProbe(
        "http://privacy.internal:8001",
        async () => new Response("{}", { status }),
      );
    expect(await answering(200).check()).toEqual({ status: "ok" });
    expect(await answering(503).check()).toEqual({ status: "down", detail: "unhealthy" });
    const refused = privacyServiceProbe("http://privacy.internal:8001", async () => {
      throw new TypeError("fetch failed: ECONNREFUSED privacy.internal:8001");
    });
    expect(await refused.check()).toEqual({ status: "down", detail: "unreachable" });
  });

  it("the circuit-state probe is degraded while the in-memory fallback answers", async () => {
    expect(await circuitStoreProbe({ isShared: () => true }).check()).toEqual({ status: "ok" });
    expect(await circuitStoreProbe({ isShared: () => false }).check()).toEqual({
      status: "degraded",
      detail: "in-memory fallback",
    });
  });
});
