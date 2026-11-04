/**
 * Composition root: the only module that imports from `infrastructure/` and wires
 * adapters into the application (constitution I, spec FR-015, FR-020; spec 002 FR-018,
 * FR-020 … FR-022, FR-029).
 *
 * Boot order: validate the environment (including the API key hashes) → load and
 * validate the policy file → check that every provider the policy uses is configured
 * (each step exits 1 listing every issue, before any port is bound) → logger → database
 * migrations → policy repository (PostgreSQL boots from the newest stored version, spec
 * 008 R-10; the providers are checked again for it) → provider registry, circuit state and routing-events sink → `routeInference`
 * wrapped by tracing and audit → app → `serve()` → one startup line with address, version and policy.
 */
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { withAudit, withAuditStream } from "./application/audit/with-audit.js";
import { fileVersion } from "./application/policy/policy-document.js";
import type { PolicyRepositoryPort } from "./application/ports/policy-repository.port.js";
import { withTracing, withTracingStream } from "./application/tracing/with-tracing.js";
import { costReport } from "./application/use-cases/cost-report.js";
import { getActivePolicy } from "./application/use-cases/get-active-policy.js";
import { inspectSensitivity } from "./application/use-cases/inspect-sensitivity.js";
import { providerHealth } from "./application/use-cases/provider-health.js";
import { queryAuditLog } from "./application/use-cases/query-audit-log.js";
import { replacePolicy } from "./application/use-cases/replace-policy.js";
import {
  type RouteInferenceDeps,
  routeInference,
} from "./application/use-cases/route-inference.js";
import { simulatePolicy } from "./application/use-cases/simulate-policy.js";
import { streamInference } from "./application/use-cases/stream-inference.js";
import type { ConfigurationError } from "./domain/errors.js";
import type { Milliseconds } from "./domain/model/units.js";
import type { Result } from "./domain/result.js";
import { createAuthenticator } from "./infrastructure/auth/api-keys.js";
import {
  createInMemoryAuditLog,
  type InMemoryAuditLog,
} from "./infrastructure/cache/in-memory-audit-log.js";
import { createInMemoryCircuitState } from "./infrastructure/cache/in-memory-circuit-state.js";
import { createInMemoryDetectionCache } from "./infrastructure/cache/in-memory-detection-cache.js";
import { createRedisCircuitState } from "./infrastructure/cache/redis-circuit-state.js";
import { systemClock } from "./infrastructure/clock/system-clock.js";
import { loadConfig } from "./infrastructure/config/env.js";
import { checkProviderSettings } from "./infrastructure/config/provider-settings.js";
import {
  circuitStoreProbe,
  databaseProbe,
  privacyServiceProbe,
} from "./infrastructure/health/probes.js";
import { createProviderRegistry } from "./infrastructure/llm/provider-registry.js";
import { createLogger } from "./infrastructure/logging/logger.js";
import { createPostgresApiKeyRepository } from "./infrastructure/persistence/api-key-repository.js";
import { createAsyncAuditWriter } from "./infrastructure/persistence/async-writer.js";
import {
  createPostgresAuditReader,
  createPostgresAuditStore,
} from "./infrastructure/persistence/audit-log-repository.js";
import { connectDatabase, runMigrations } from "./infrastructure/persistence/db.js";
import { loadPolicyDocument } from "./infrastructure/policy/file-policy-loader.js";
import { createInMemoryPolicyRepository } from "./infrastructure/policy/in-memory-policy-repository.js";
import { toDomainPolicyInput } from "./infrastructure/policy/policy-mapper.js";
import { createPostgresPolicyRepository } from "./infrastructure/policy/postgres-policy-repository.js";
import { loadAnonymizationNotices } from "./infrastructure/privacy/anonymization-notice.js";
import { createHttpPiiDetector } from "./infrastructure/privacy/http-pii-detector.js";
import { fanOut } from "./infrastructure/telemetry/fan-out.js";
import { createLogRoutingEvents } from "./infrastructure/telemetry/log-routing-events.js";
import { createOtelRoutingEvents } from "./infrastructure/telemetry/otel-routing-events.js";
import { setupTelemetry } from "./infrastructure/telemetry/otel-setup.js";
import { createOtelTracer } from "./infrastructure/telemetry/otel-tracer.js";
import { createApp } from "./presentation/app.js";

/** Returns the value, or prints one `path: message` line per issue and exits 1. */
function orExit<T>(result: Result<T, ConfigurationError>): T {
  if (result.ok) return result.value;
  process.stderr.write(`${result.error.message}:\n`);
  for (const issue of result.error.issues) {
    process.stderr.write(`  ${issue.path}: ${issue.message}\n`);
  }
  process.exit(1);
}

/** Exits 1 naming only the driver's error code: the URL and messages carry credentials. */
function databaseFailure(step: string, error: unknown): never {
  const code = (error as { code?: unknown } | null)?.code;
  process.stderr.write(`${step} failed (${typeof code === "string" ? code : "unknown"})\n`);
  process.exit(1);
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

const config = orExit(loadConfig(process.env));
const policyFile = orExit(await loadPolicyDocument(config.policyFile));
orExit(checkProviderSettings(policyFile.policy, config));
const anonymizationNotices = orExit(loadAnonymizationNotices());

const logger = createLogger({ level: config.logLevel });

// Spec 006 FR-011: spans are exported when an OTLP endpoint is configured, else a no-op.
const telemetry = setupTelemetry({ env: process.env, version: config.version });
const tracer = createOtelTracer();
logger.info({ enabled: telemetry.enabled }, "trace export");

// Spec 003 FR-029 … FR-031: shared circuit state when REDIS_URL is set (falling back to
// memory while the store is unreachable); in-memory state for a single instance.
const redisState =
  config.redisUrl === undefined
    ? undefined
    : await createRedisCircuitState({ url: config.redisUrl, clock: systemClock, logger });
const circuitState = redisState ?? createInMemoryCircuitState(systemClock);

// Spec 005: every request is inspected by the privacy service before it is routed; results
// are cached in this process by a SHA-256 hash of the messages (positions only).
const events = fanOut(createLogRoutingEvents(logger), createOtelRoutingEvents());
const inspect = inspectSensitivity({
  detector: createHttpPiiDetector({ baseUrl: config.privacy.url }),
  cache: createInMemoryDetectionCache({
    maxEntries: config.privacy.cacheMaxEntries,
    ttlMs: config.privacy.cacheTtlMs,
    now: () => systemClock.now(),
  }),
  clock: systemClock,
  events,
  hash: sha256,
  timeoutMs: config.privacy.timeoutMs as Milliseconds,
});

// Spec 006 FR-005: PostgreSQL when DATABASE_URL is set (migrations before listening), else a
// bounded in-memory log. Never log the URL: errors are reported by their code.
const database = config.databaseUrl === undefined ? undefined : connectDatabase(config.databaseUrl);
if (database !== undefined) {
  try {
    await runMigrations(database);
  } catch (error) {
    databaseFailure("Database migration", error);
  }
}
// Spec 008 R-10: the policy is replaceable through the admin API; with a database its
// versions are kept and the newest one is used at boot unless the file's version is higher.
const bootVersion = fileVersion(policyFile, sha256);
let policies: PolicyRepositoryPort;
if (database === undefined) {
  policies = createInMemoryPolicyRepository(bootVersion);
} else {
  try {
    policies = orExit(
      await createPostgresPolicyRepository({
        db: database.db,
        clock: systemClock,
        file: bootVersion,
        // T-OPS-05: an edited file at a stored version number is not used; say so.
        onFileIgnored: (notice) =>
          logger.warn(
            notice,
            "routing policy file differs from the stored version with the same number and is ignored; raise its version to use it",
          ),
      }),
    );
  } catch (error) {
    databaseFailure("Loading the stored policy", error);
  }
}
const active = await policies.getActiveVersion();
orExit(checkProviderSettings(active.policy, config));
logger.info(
  {
    policyId: active.policy.id,
    policyVersion: active.policy.version,
    source: active.source,
    persistent: active.persistent,
  },
  "routing policy loaded",
);

const routing: RouteInferenceDeps = {
  policies,
  providers: createProviderRegistry(config.providers),
  clock: systemClock,
  circuitState,
  events,
  random: Math.random,
  inspect,
  anonymizationNotices,
  tracer,
};
// Spec 006: one content-free audit entry per request. The messages are identified by an
// HMAC keyed with TAMIZ_AUDIT_HASH_KEY, or an ephemeral key when it is unset.
const auditHashKey = config.audit.hashKey ?? randomBytes(32).toString("hex");
if (config.audit.hashKey === undefined) {
  logger.warn(
    {},
    "audit hash key is ephemeral: set TAMIZ_AUDIT_HASH_KEY to correlate across restarts",
  );
}
const auditWriter =
  database === undefined
    ? undefined
    : createAsyncAuditWriter({
        store: createPostgresAuditStore(database.db),
        clock: systemClock,
        events,
        logger,
      });
const auditLog = auditWriter ?? createInMemoryAuditLog(config.audit.memoryEntries);
if (auditWriter === undefined) {
  logger.info({ entries: config.audit.memoryEntries }, "audit log in memory (bounded)");
} else {
  logger.info({}, "audit log in PostgreSQL");
}
const auditDeps = {
  audit: auditLog,
  clock: systemClock,
  policies: routing.policies,
  hash: (messages: ReadonlyArray<unknown>) =>
    createHmac("sha256", auditHashKey).update(JSON.stringify(messages)).digest("hex"),
  newId: randomUUID,
  logger,
};
const route = withAudit(withTracing(routeInference(routing), tracer), auditDeps);
const stream = withAuditStream(withTracingStream(streamInference(routing), tracer), auditDeps);
const auditReader =
  database === undefined ? (auditLog as InMemoryAuditLog) : createPostgresAuditReader(database.db);
const replace = replacePolicy({
  policies,
  checkProviders: (candidate) => {
    const checked = checkProviderSettings(candidate, config);
    return checked.ok ? [] : checked.error.issues;
  },
  clock: systemClock,
  hash: sha256,
  logger,
});
const startedAt = systemClock.now();
const app = createApp({
  clock: systemClock,
  version: config.version,
  startedAt,
  healthProbes: [
    privacyServiceProbe(config.privacy.url),
    ...(database === undefined ? [] : [databaseProbe(database)]),
    ...(redisState === undefined ? [] : [circuitStoreProbe(redisState)]),
  ],
  logger,
  routeInference: route,
  streamInference: stream,
  simulatePolicy: simulatePolicy(routing),
  queryAuditLog: queryAuditLog(auditReader),
  costReport: costReport({ reader: auditReader, policies: routing.policies }),
  providerHealth: providerHealth({
    reader: auditReader,
    policies: routing.policies,
    circuitState,
    clock: systemClock,
  }),
  getActivePolicy: getActivePolicy(policies),
  replacePolicy: (command) =>
    replace({
      input: toDomainPolicyInput(command.policy),
      baseVersion: command.baseVersion,
      adminClientId: command.adminClientId,
    }),
  authenticate: createAuthenticator(
    config.apiKeys,
    database === undefined ? undefined : createPostgresApiKeyRepository(database.db),
  ),
});

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  logger.info(
    {
      host: info.address,
      port: info.port,
      version: config.version,
      nodeEnv: config.nodeEnv,
      policyId: active.policy.id,
      policyVersion: active.policy.version,
    },
    "gateway listening",
  );
});

/**
 * Stops accepting connections and waits for the open requests, at most `SHUTDOWN_GRACE_MS`
 * (under compose's 10 s before SIGKILL), so their audit entries are queued before the last
 * flush (code audit 2026-11-03, M10). Then flushes the audit writer, closes the
 * connections and exits. A request still running after the grace loses its entry, which
 * the writer reports as `audit.dropped`.
 */
const SHUTDOWN_GRACE_MS = 8_000;
function shutdown(): void {
  const drained = new Promise<void>((resolve) => server.close(() => resolve()));
  if ("closeIdleConnections" in server) server.closeIdleConnections();
  void (async () => {
    let grace: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      drained,
      new Promise<void>((resolve) => {
        grace = setTimeout(resolve, SHUTDOWN_GRACE_MS);
      }),
    ]);
    clearTimeout(grace);
    await auditWriter?.close();
    await database?.close();
    await redisState?.close();
    await telemetry.shutdown();
  })().finally(() => process.exit(0));
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
