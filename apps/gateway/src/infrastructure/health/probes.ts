/**
 * The dependency probes of `/health` (code audit 2026-11-03, M12). Each is bounded by
 * `timeoutMs` and reports a fixed detail, never the address or the error message.
 */
import { sql } from "drizzle-orm";
import type { HealthProbe } from "../../application/ports/health-probe.port.js";
import type { DatabaseHandle } from "../persistence/db.js";

const PROBE_TIMEOUT_MS = 1_000;

async function within<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function privacyServiceProbe(
  baseUrl: string,
  fetchImpl: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, init),
  timeoutMs = PROBE_TIMEOUT_MS,
): HealthProbe {
  return {
    name: "privacy",
    async check() {
      try {
        const response = await fetchImpl(new URL("/health", baseUrl), {
          signal: AbortSignal.timeout(timeoutMs),
        });
        await response.body?.cancel();
        return response.ok ? { status: "ok" } : { status: "down", detail: "unhealthy" };
      } catch {
        return { status: "down", detail: "unreachable" };
      }
    },
  };
}

export function databaseProbe(database: DatabaseHandle, timeoutMs = PROBE_TIMEOUT_MS): HealthProbe {
  return {
    name: "database",
    async check() {
      try {
        await within(database.db.execute(sql`select 1`), timeoutMs);
        return { status: "ok" };
      } catch {
        return { status: "down", detail: "unreachable" };
      }
    },
  };
}

export function circuitStoreProbe(state: { isShared(): boolean }): HealthProbe {
  return {
    name: "circuit-state",
    check: async () =>
      state.isShared() ? { status: "ok" } : { status: "degraded", detail: "in-memory fallback" },
  };
}
