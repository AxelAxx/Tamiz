import { createHash, createHmac, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createFakeClock, createScriptedPort } from "@tamiz/test-utils";
import { withAudit, withAuditStream } from "../../src/application/audit/with-audit.js";
import { fileVersion } from "../../src/application/policy/policy-document.js";
import type { CircuitStatePort } from "../../src/application/ports/circuit-state.port.js";
import type {
  ProviderCompletion,
  ProviderCompletionInput,
  StartedStream,
} from "../../src/application/ports/llm-provider.port.js";
import type { LoggerPort } from "../../src/application/ports/logger.port.js";
import type { RoutingEventsPort } from "../../src/application/ports/routing-events.port.js";
import type { TracerPort } from "../../src/application/ports/tracer.port.js";
import { withTracing, withTracingStream } from "../../src/application/tracing/with-tracing.js";
import { costReport } from "../../src/application/use-cases/cost-report.js";
import { getActivePolicy } from "../../src/application/use-cases/get-active-policy.js";
import type { InspectSensitivity } from "../../src/application/use-cases/inspect-sensitivity.js";
import { providerHealth } from "../../src/application/use-cases/provider-health.js";
import { queryAuditLog } from "../../src/application/use-cases/query-audit-log.js";
import { replacePolicy } from "../../src/application/use-cases/replace-policy.js";
import {
  type RouteInferenceDeps,
  routeInference,
} from "../../src/application/use-cases/route-inference.js";
import { simulatePolicy } from "../../src/application/use-cases/simulate-policy.js";
import { streamInference } from "../../src/application/use-cases/stream-inference.js";
import type { ProviderError } from "../../src/domain/errors.js";
import type { ProviderName } from "../../src/domain/model/model-target.js";
import type { RoutingPolicy, RoutingPolicyInput } from "../../src/domain/model/routing-policy.js";
import { ok, type Result } from "../../src/domain/result.js";
import { hashApiKey, verifyPrincipal } from "../../src/infrastructure/auth/api-keys.js";
import {
  createInMemoryAuditLog,
  type InMemoryAuditLog,
} from "../../src/infrastructure/cache/in-memory-audit-log.js";
import { createInMemoryCircuitState } from "../../src/infrastructure/cache/in-memory-circuit-state.js";
import {
  type LoadedPolicy,
  loadPolicyDocument,
} from "../../src/infrastructure/policy/file-policy-loader.js";
import { createInMemoryPolicyRepository } from "../../src/infrastructure/policy/in-memory-policy-repository.js";
import { toDomainPolicyInput } from "../../src/infrastructure/policy/policy-mapper.js";
import { createApp } from "../../src/presentation/app.js";
import { noopLogger } from "./noop-logger.js";
import { cleanPrivacyDeps } from "./privacy.js";

/** A test key for the client `demo`; only its hash is given to the app. */
export const DEMO_KEY = "tmz_demo-test-key-not-a-secret-000000000000000";
export const DEMO_KEY_HASH = hashApiKey(DEMO_KEY);
export const AUTH = { authorization: `Bearer ${DEMO_KEY}` } as const;

/** An admin key (spec 006 FR-008); only its hash is given to the app. */
export const ADMIN_KEY = "tmz_ops-admin-test-key-not-a-secret-0000000000";
export const ADMIN_AUTH = { authorization: `Bearer ${ADMIN_KEY}` } as const;

export const START = new Date("2026-05-06T07:08:09.000Z");

/** Keys the audit hash in tests (spec 006 research R-03); not a secret. */
export const TEST_AUDIT_KEY = "test-audit-hash-key-not-a-secret-000000";

export type CompletionResult = Result<ProviderCompletion, ProviderError>;

export async function defaultPolicyDocument(): Promise<LoadedPolicy> {
  const loaded = await loadPolicyDocument(
    resolve(import.meta.dirname, "../../policies/default.yaml"),
  );
  if (!loaded.ok) throw new Error("the default policy must load");
  return loaded.value;
}

export async function defaultPolicy(): Promise<RoutingPolicy> {
  return (await defaultPolicyDocument()).policy;
}

export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** Chat dependencies for tests that never call `/v1/*`: any call fails the test. */
export const NO_CHAT = {
  routeInference: () => Promise.reject(new Error("routeInference must not be called")),
  streamInference: () => Promise.reject(new Error("streamInference must not be called")),
  simulatePolicy: () => Promise.reject(new Error("simulatePolicy must not be called")),
  queryAuditLog: () => Promise.reject(new Error("queryAuditLog must not be called")),
  costReport: () => Promise.reject(new Error("costReport must not be called")),
  providerHealth: () => Promise.reject(new Error("providerHealth must not be called")),
  getActivePolicy: () => Promise.reject(new Error("getActivePolicy must not be called")),
  replacePolicy: () => Promise.reject(new Error("replacePolicy must not be called")),
  authenticate: () => undefined,
} as const;

/** The app wired to the real use case, the default policy and a scripted provider. */
export async function createTestApp(
  options: {
    readonly script?: (
      input: ProviderCompletionInput,
    ) => CompletionResult | Promise<CompletionResult>;
    readonly logger?: LoggerPort;
    readonly policy?: RoutingPolicy;
    /** Answers `stream()` calls (spec 003 streaming tests). */
    readonly streamScript?: (
      input: ProviderCompletionInput,
    ) => Promise<Result<StartedStream, ProviderError>>;
    readonly circuitState?: CircuitStatePort;
    readonly events?: RoutingEventsPort;
    /** Spans (spec 006): the use cases are wrapped by tracing as in `main.ts`. */
    readonly tracer?: TracerPort;
    /** What the privacy service reports (spec 005); clean by default. */
    readonly inspect?: InspectSensitivity;
    /** Receives the audit entries (spec 006); a fresh in-memory log by default. */
    readonly audit?: InMemoryAuditLog;
    /** Providers the policy admin API treats as configured (spec 008); all by default. */
    readonly configuredProviders?: ReadonlyArray<ProviderName>;
  } = {},
) {
  const clock = createFakeClock(START);
  const provider = createScriptedPort<ProviderCompletionInput, CompletionResult>(
    options.script ??
      ((input) =>
        ok({
          text: "Hola.",
          finishReason: "stop",
          usage: { promptTokens: 12, completionTokens: 3 },
          modelName: `${input.target.model}-served`,
        })),
  );
  // A policy given as a domain value stands for its own document (tests of the policy admin
  // API use the default policy, whose document comes from the file).
  const loaded =
    options.policy === undefined
      ? await defaultPolicyDocument()
      : { policy: options.policy, document: options.policy as unknown as RoutingPolicyInput };
  const policies = createInMemoryPolicyRepository(fileVersion(loaded, sha256));
  const deps: RouteInferenceDeps = {
    policies,
    providers: {
      resolve: () => ({
        complete: provider.fn,
        stream: (input) =>
          options.streamScript === undefined
            ? Promise.reject(new Error("no stream script for this test"))
            : options.streamScript(input),
      }),
    },
    clock,
    circuitState: options.circuitState ?? createInMemoryCircuitState(clock),
    events: options.events ?? { emit: () => {} },
    random: () => 0.5,
    ...cleanPrivacyDeps(),
    ...(options.inspect === undefined ? {} : { inspect: options.inspect }),
    ...(options.tracer === undefined ? {} : { tracer: options.tracer }),
  };
  const audit = options.audit ?? createInMemoryAuditLog();
  const auditDeps = {
    audit,
    clock,
    policies: deps.policies,
    hash: (messages: ReadonlyArray<unknown>) =>
      createHmac("sha256", TEST_AUDIT_KEY).update(JSON.stringify(messages)).digest("hex"),
    newId: randomUUID,
  };
  const traced = <T>(useCase: T, wrap: (u: T, t: TracerPort) => T): T =>
    options.tracer === undefined ? useCase : wrap(useCase, options.tracer);
  const route = withAudit(traced(routeInference(deps), withTracing), auditDeps);
  const stream = withAuditStream(traced(streamInference(deps), withTracingStream), auditDeps);
  const records = [
    { clientId: "demo", keyHash: DEMO_KEY_HASH },
    { clientId: "ops", keyHash: hashApiKey(ADMIN_KEY), role: "admin" as const },
  ];
  const configured = new Set(
    options.configuredProviders ?? ["ollama", "mistral", "anthropic", "openai"],
  );
  const replace = replacePolicy({
    policies,
    checkProviders: (policy) =>
      policy.targets.flatMap((target, index) =>
        configured.has(target.provider)
          ? []
          : [{ path: `targets.${index}.provider`, message: `provider ${target.provider}` }],
      ),
    clock,
    hash: sha256,
    logger: options.logger ?? noopLogger,
  });
  const app = createApp({
    clock,
    version: "0.1.0",
    startedAt: START,
    logger: options.logger ?? noopLogger,
    routeInference: route,
    streamInference: stream,
    simulatePolicy: simulatePolicy(deps),
    queryAuditLog: queryAuditLog(audit),
    costReport: costReport({ reader: audit, policies: deps.policies }),
    providerHealth: providerHealth({
      reader: audit,
      policies: deps.policies,
      circuitState: deps.circuitState,
      clock,
    }),
    getActivePolicy: getActivePolicy(policies),
    replacePolicy: (command) =>
      replace({
        input: toDomainPolicyInput(command.policy),
        baseVersion: command.baseVersion,
        adminClientId: command.adminClientId,
      }),
    authenticate: (key) => verifyPrincipal(key, records),
  });
  /** `app.request` with the fake clock driven, for paths that retry or wait (spec 003). */
  const send = (path: string, init?: RequestInit) =>
    clock.drive(Promise.resolve(app.request(path, init)));
  return { app, provider, clock, send, audit, policies };
}
