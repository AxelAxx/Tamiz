import { createHash } from "node:crypto";
import {
  type ActivePolicyDto,
  ActivePolicySchema,
  ErrorEnvelopeSchema,
  type RoutingPolicyDto,
  SimulateResponseSchema,
} from "@tamiz/contracts";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../src/application/policy/policy-document.js";
import { conflictError } from "../../src/domain/errors.js";
import { domainErrorToErrorType } from "../../src/presentation/mappers/error-envelope.js";
import { ADMIN_AUTH, AUTH, createTestApp, defaultPolicyDocument } from "../helpers/app.js";
import { recordingLogger } from "../helpers/noop-logger.js";

// Spec 008 US5-1, US5-3 … US5-6, US5-8, FR-015 … FR-017, contracts/gateway-policy.md
// (tasks.md T035). In-process HTTP over the in-memory policy repository.

const PATH = "/v1/admin/policy";

function put(body: unknown, auth: Record<string, string> = ADMIN_AUTH) {
  return {
    method: "PUT",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function read(app: Awaited<ReturnType<typeof createTestApp>>): Promise<ActivePolicyDto> {
  const response = await app.send(PATH, { headers: ADMIN_AUTH });
  expect(response.status).toBe(200);
  return ActivePolicySchema.parse(await response.json());
}

async function envelope(response: Response) {
  return ErrorEnvelopeSchema.parse(await response.json()).error;
}

/** The default policy with another default chain. */
function edited(policy: RoutingPolicyDto): RoutingPolicyDto {
  return { ...policy, default: { ...policy.default, route: ["openai-mini", "mistral-small"] } };
}

function simulate() {
  return {
    method: "POST",
    headers: { ...AUTH, "content-type": "application/json" },
    body: JSON.stringify({ model: "tamiz-auto", messages: [{ role: "user", content: "Hola" }] }),
  };
}

describe("GET /v1/admin/policy", () => {
  it("US5-1: a file policy with its version, source, hash and no persistence", async () => {
    const app = await createTestApp();
    const { document } = await defaultPolicyDocument();

    const body = await read(app);

    expect(body.policy.id).toBe("default");
    expect(body.policy.version).toBe(document.version);
    expect(body.policy).toEqual(JSON.parse(JSON.stringify(document)));
    expect(body.meta).toEqual({
      source: "file",
      savedAt: null,
      savedBy: null,
      contentHash: createHash("sha256").update(canonicalJson(document)).digest("hex"),
      persistent: false,
    });
  });

  it("US5-6: a client key is refused with 403 and no key with 401", async () => {
    const app = await createTestApp();
    const client = await app.send(PATH, { headers: AUTH });
    expect(client.status).toBe(403);
    expect((await envelope(client)).type).toBe("forbidden");
    const anonymous = await app.send(PATH);
    expect(anonymous.status).toBe(401);
    expect((await envelope(anonymous)).type).toBe("unauthorized");
  });
});

describe("PUT /v1/admin/policy", () => {
  it("US5-4: saves as base + 1 by the admin client, applied to the next simulation and request", async () => {
    const { logger, entries } = recordingLogger();
    const app = await createTestApp({ logger });
    const before = await read(app);
    const simulatedBefore = SimulateResponseSchema.parse(
      await (await app.send("/v1/simulate", simulate())).json(),
    );

    const response = await app.send(
      PATH,
      put({
        baseVersion: before.policy.version,
        policy: { ...edited(before.policy), version: 99 },
      }),
    );

    expect(response.status).toBe(200);
    const saved = ActivePolicySchema.parse(await response.json());
    expect(saved.policy.version).toBe(before.policy.version + 1);
    expect(saved.policy.default.route).toEqual(["openai-mini", "mistral-small"]);
    expect(saved.meta).toMatchObject({
      source: "store",
      savedAt: app.clock.now().toISOString(),
      savedBy: "ops",
      persistent: false,
    });
    expect(saved.meta.contentHash).not.toBe(before.meta.contentHash);
    expect(await read(app)).toEqual(saved);

    // The next simulation routes with the saved chain.
    const simulated = SimulateResponseSchema.parse(
      await (await app.send("/v1/simulate", simulate())).json(),
    );
    expect(simulated.ruleId).toBe("default");
    expect(simulatedBefore.ruleId).toBe("default");
    expect(simulatedBefore.chain.map((t) => t.id)).not.toEqual(["openai-mini", "mistral-small"]);
    expect(simulated.chain.map((t) => t.id)).toEqual(["openai-mini", "mistral-small"]);

    // The next chat completion's audit entry carries the new version.
    const chat = await app.send("/v1/chat/completions", simulate());
    expect(chat.status).toBe(200);
    expect(app.audit.entries()[0]?.policyVersion).toBe(saved.policy.version);

    // One `policy.replaced` line, without the document.
    const lines = entries.filter((entry) => entry.message === "policy.replaced");
    expect(lines).toEqual([
      {
        level: "info",
        message: "policy.replaced",
        bindings: {
          policyId: "default",
          version: saved.policy.version,
          clientId: "ops",
          contentHash: saved.meta.contentHash,
        },
      },
    ]);
  });

  it("US5-5: a save from a version that is no longer active is a 409 conflict", async () => {
    const app = await createTestApp();
    const base = await read(app);
    const body = { baseVersion: base.policy.version, policy: edited(base.policy) };
    expect((await app.send(PATH, put(body))).status).toBe(200);

    const stale = await app.send(PATH, put(body));

    expect(stale.status).toBe(409);
    const error = await envelope(stale);
    expect(error.type).toBe("conflict");
    expect(error.message).toContain(`version ${base.policy.version + 1}`);
    expect((await read(app)).policy.version).toBe(base.policy.version + 1);
    expect(domainErrorToErrorType(conflictError(2))).toBe("conflict");
  });

  it("US5-8: a different policy id is refused at policy.id", async () => {
    const app = await createTestApp();
    const base = await read(app);

    const response = await app.send(
      PATH,
      put({ baseVersion: base.policy.version, policy: { ...base.policy, id: "other" } }),
    );

    expect(response.status).toBe(400);
    const error = await envelope(response);
    expect(error.type).toBe("invalid_request");
    expect(error.issues?.map((issue) => issue.path)).toEqual(["policy.id"]);
    expect(await read(app)).toEqual(base);
  });

  describe("US5-3: cross-field failures answer 400 with paths and change nothing", () => {
    it("an undeclared target in a chain, quoting its id", async () => {
      const app = await createTestApp();
      const base = await read(app);
      const policy = {
        ...base.policy,
        default: { ...base.policy.default, route: ["mistral-small", "mistral-large"] },
      };

      const response = await app.send(PATH, put({ baseVersion: base.policy.version, policy }));

      expect(response.status).toBe(400);
      const error = await envelope(response);
      expect(error.issues).toContainEqual({
        path: "policy.default.route.1",
        message: expect.stringContaining('"mistral-large"'),
      });
      expect(await read(app)).toEqual(base);
    });

    it("a duplicate rule id", async () => {
      const app = await createTestApp();
      const base = await read(app);
      const [first] = base.policy.rules;
      if (first === undefined) throw new Error("the default policy has rules");
      const policy = { ...base.policy, rules: [...base.policy.rules, first] };

      const response = await app.send(PATH, put({ baseVersion: base.policy.version, policy }));

      expect(response.status).toBe(400);
      const paths = (await envelope(response)).issues?.map((issue) => issue.path);
      expect(paths).toContain(`policy.rules.${base.policy.rules.length}.id`);
      expect(await read(app)).toEqual(base);
    });

    it("a provider that is not configured on this gateway", async () => {
      const app = await createTestApp({ configuredProviders: ["ollama", "mistral", "openai"] });
      const base = await read(app);
      const index = base.policy.targets.findIndex((t) => t.provider === "anthropic");

      const response = await app.send(
        PATH,
        put({ baseVersion: base.policy.version, policy: base.policy }),
      );

      expect(response.status).toBe(400);
      expect((await envelope(response)).issues).toEqual([
        { path: `policy.targets.${index}.provider`, message: expect.any(String) },
      ]);
      expect(await read(app)).toEqual(base);
    });
  });

  it("a shape issue answers 400 with its path under policy.", async () => {
    const app = await createTestApp();
    const base = await read(app);

    const response = await app.send(
      PATH,
      put({ baseVersion: base.policy.version, policy: { ...base.policy, surprise: true } }),
    );

    expect(response.status).toBe(400);
    const error = await envelope(response);
    expect(error.type).toBe("invalid_request");
    expect(error.issues?.[0]?.path).toBe("policy");
    expect(error.issues?.[0]?.message).toMatch(/surprise/);
  });

  it("refuses a missing baseVersion and a non-JSON content type", async () => {
    const app = await createTestApp();
    const base = await read(app);

    const missing = await app.send(PATH, put({ policy: base.policy }));
    expect(missing.status).toBe(400);
    expect((await envelope(missing)).issues?.map((issue) => issue.path)).toEqual(["baseVersion"]);

    const text = await app.send(PATH, {
      method: "PUT",
      headers: { ...ADMIN_AUTH, "content-type": "text/plain" },
      body: JSON.stringify({ baseVersion: 1, policy: base.policy }),
    });
    expect(text.status).toBe(400);
  });

  it("US5-6: a client key is refused with 403 and no key with 401, nothing changes", async () => {
    const app = await createTestApp();
    const base = await read(app);
    const body = { baseVersion: base.policy.version, policy: edited(base.policy) };

    expect((await app.send(PATH, put(body, AUTH))).status).toBe(403);
    expect((await app.send(PATH, put(body, {}))).status).toBe(401);
    expect(await read(app)).toEqual(base);
  });
});

describe("OpenAPI", () => {
  it("declares both routes and names ActivePolicy and ReplacePolicyRequest", async () => {
    const app = await createTestApp();
    const document = (await (await app.send("/openapi.json")).json()) as {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
      components: { schemas: Record<string, unknown> };
    };

    expect(Object.keys(document.paths[PATH] ?? {}).sort()).toEqual(["get", "put"]);
    expect(Object.keys(document.paths[PATH]?.["put"]?.responses ?? {}).sort()).toEqual([
      "200",
      "400",
      "401",
      "403",
      "409",
    ]);
    expect(document.components.schemas).toHaveProperty("ActivePolicy");
    expect(document.components.schemas).toHaveProperty("ReplacePolicyRequest");
  });
});
