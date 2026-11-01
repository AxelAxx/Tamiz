import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ActivePolicySchema,
  ErrorEnvelopeSchema,
  errorTypeToHttpStatus,
  ReplacePolicyRequestSchema,
} from "../src/index.js";

// Spec 008 US5, FR-015, FR-016, research R-11 (tasks.md T034): the policy admin contracts.

const example: { baseVersion: number; policy: Record<string, unknown> } = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../specs/008-dashboard/contracts/replace-policy.example.json",
    ),
    "utf8",
  ),
);

const HASH = "a".repeat(64);

function meta(overrides: Record<string, unknown> = {}) {
  return {
    source: "store",
    savedAt: "2026-11-03T10:15:00.000Z",
    savedBy: "dashboard",
    contentHash: HASH,
    persistent: true,
    ...overrides,
  };
}

describe("ReplacePolicyRequestSchema", () => {
  it("parses the spec's example request", () => {
    const parsed = ReplacePolicyRequestSchema.parse(example);
    expect(parsed.baseVersion).toBe(5);
    expect(parsed.policy.id).toBe("default");
  });

  it.each([0, -1, 1.5, "5"])("refuses baseVersion %j", (baseVersion) => {
    const result = ReplacePolicyRequestSchema.safeParse({ ...example, baseVersion });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(["baseVersion"]);
  });

  it("reports a policy shape issue under policy.", () => {
    const result = ReplacePolicyRequestSchema.safeParse({
      ...example,
      policy: { ...example.policy, surprise: true },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path[0]).toBe("policy");
  });

  it("refuses unknown top-level keys and a missing policy", () => {
    expect(ReplacePolicyRequestSchema.safeParse({ ...example, force: true }).success).toBe(false);
    expect(ReplacePolicyRequestSchema.safeParse({ baseVersion: 1 }).success).toBe(false);
  });
});

describe("ActivePolicySchema", () => {
  it("accepts a stored version", () => {
    expect(ActivePolicySchema.safeParse({ policy: example.policy, meta: meta() }).success).toBe(
      true,
    );
  });

  it("accepts a file policy: savedAt and savedBy null", () => {
    const parsed = ActivePolicySchema.parse({
      policy: example.policy,
      meta: meta({ source: "file", savedAt: null, savedBy: null, persistent: false }),
    });
    expect(parsed.meta.savedAt).toBeNull();
    expect(parsed.meta.savedBy).toBeNull();
  });

  it.each(["a".repeat(63), "A".repeat(64), "g".repeat(64)])(
    "refuses contentHash %s",
    (contentHash) => {
      expect(
        ActivePolicySchema.safeParse({ policy: example.policy, meta: meta({ contentHash }) })
          .success,
      ).toBe(false);
    },
  );

  it("refuses an unknown source, a bad savedAt and unknown meta keys", () => {
    for (const bad of [
      meta({ source: "yaml" }),
      meta({ savedAt: "yesterday" }),
      { ...meta(), extra: 1 },
    ]) {
      expect(ActivePolicySchema.safeParse({ policy: example.policy, meta: bad }).success).toBe(
        false,
      );
    }
  });
});

describe("error envelope additions (R-11)", () => {
  it("conflict answers 409", () => {
    expect(errorTypeToHttpStatus.conflict).toBe(409);
  });

  it("accepts optional issues with dot paths, the root as an empty path", () => {
    const parsed = ErrorEnvelopeSchema.parse({
      error: {
        type: "invalid_request",
        message: "policy: 2 issues",
        issues: [
          { path: "policy.rules.2.route.0", message: "unknown target" },
          { path: "", message: "expected an object" },
        ],
      },
    });
    expect(parsed.error.issues).toHaveLength(2);
    expect(
      ErrorEnvelopeSchema.parse({ error: { type: "conflict", message: "x" } }).error.issues,
    ).toBeUndefined();
  });

  it("refuses malformed issues", () => {
    expect(
      ErrorEnvelopeSchema.safeParse({
        error: { type: "invalid_request", message: "x", issues: [{ path: 1, message: "m" }] },
      }).success,
    ).toBe(false);
    expect(
      ErrorEnvelopeSchema.safeParse({
        error: {
          type: "invalid_request",
          message: "x",
          issues: [{ path: "a", message: "m", value: 1 }],
        },
      }).success,
    ).toBe(false);
  });
});
