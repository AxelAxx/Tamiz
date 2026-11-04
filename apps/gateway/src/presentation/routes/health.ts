/**
 * `GET /health` (spec FR-017, data-model section 4).
 *
 * Without probes (tests, the E2E harness) it is plain liveness: `ok`, no `checks`. With
 * probes it reports each dependency: any check that is not
 * `ok` makes the status `degraded`, and a `down` one answers 503, so a container health
 * check or a load balancer stops sending requests that would fail. The body is validated
 * against the contract before it is sent, so a drift between the handler and
 * `@tamiz/contracts` fails loudly instead of leaking an off-contract body. Declared with
 * `createRoute` so the OpenAPI document lists it (spec 002 FR-031).
 */
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { type HealthResponse, HealthResponseSchema, milliseconds } from "@tamiz/contracts";
import type { Env, Schema } from "hono";
import type { ClockPort } from "../../application/ports/clock.port.js";
import type { HealthProbe } from "../../application/ports/health-probe.port.js";
import { HealthResponseBody } from "../openapi-schemas.js";

export interface HealthDeps {
  readonly clock: ClockPort;
  readonly version: string;
  readonly startedAt: Date;
  readonly probes?: ReadonlyArray<HealthProbe>;
}

export async function buildHealthResponse(
  deps: HealthDeps,
): Promise<{ readonly body: HealthResponse; readonly down: boolean }> {
  const elapsed = deps.clock.now().getTime() - deps.startedAt.getTime();
  const uptimeMs = milliseconds(Math.max(0, Math.round(elapsed)));
  const probes = deps.probes ?? [];
  const checks = await Promise.all(
    probes.map(async (probe) => ({ name: probe.name, ...(await probe.check()) })),
  );
  const status = checks.every((check) => check.status === "ok") ? "ok" : "degraded";
  const body = HealthResponseSchema.parse({
    status,
    version: deps.version,
    uptimeMs,
    ...(checks.length === 0 ? {} : { checks }),
  });
  return { body, down: checks.some((check) => check.status === "down") };
}

export const healthRoute = createRoute({
  method: "get",
  path: "/health",
  summary: "Liveness and version; needs no API key",
  responses: {
    200: {
      description: "The gateway is up; `degraded` names a dependency it works without",
      content: { "application/json": { schema: HealthResponseBody } },
    },
    503: {
      description: "A dependency that requests need is down; `checks` names it",
      content: { "application/json": { schema: HealthResponseBody } },
    },
  },
});

export function registerHealth<E extends Env, S extends Schema, B extends string>(
  app: OpenAPIHono<E, S, B>,
  deps: HealthDeps,
) {
  return app.openapi(healthRoute, async (c) => {
    const { body, down } = await buildHealthResponse(deps);
    return down ? c.json(body, 503) : c.json(body, 200);
  });
}
