// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RoutingPolicySchema } from "@tamiz/contracts";
import { describe, expect, it } from "vitest";
import {
  checkPolicyYaml,
  lineOfPath,
  outline,
  policyToYaml,
} from "@/features/policy-editor/editor/policy-yaml";

// Spec 008 US5-2 (tasks.md T041): YAML → RoutingPolicySchema issues → lines.

const FILE = readFileSync(
  resolve(import.meta.dirname, "../../gateway/policies/default.yaml"),
  "utf8",
);
const POLICY = RoutingPolicySchema.parse((await import("yaml")).parse(FILE));
const TEXT = policyToYaml(POLICY);

const lineContaining = (text: string, needle: string) =>
  text.split("\n").findIndex((line) => line.includes(needle)) + 1;

describe("policyToYaml", () => {
  it("round-trips to the same policy, with short lists inline", () => {
    const check = checkPolicyYaml(TEXT);
    expect(check.ok && check.policy).toEqual(POLICY);
    expect(TEXT).toContain("localRoute: [ollama-llama]");
    expect(TEXT).toContain("backoff: {baseDelayMs: 250, maxDelayMs: 2000}");
    expect(TEXT).toContain("\n\nrules:\n");
  });
});

describe("checkPolicyYaml", () => {
  it("accepts the default policy", () => {
    expect(checkPolicyYaml(FILE)).toMatchObject({ ok: true, issues: [] });
  });

  it("reports a wrong enum with its path and line", () => {
    const text = TEXT.replace("onDetectorError: restrict_to_local", "onDetectorError: allow");
    const check = checkPolicyYaml(text);
    expect(check.ok).toBe(false);
    expect(check.issues).toEqual([
      expect.objectContaining({
        path: "privacy.onDetectorError",
        line: lineContaining(text, "onDetectorError"),
      }),
    ]);
  });

  it("reports an unknown key on the key's own line, named in the path", () => {
    const text = TEXT.replace("maxAttempts: 2", "maxAttempts: 2\n  retries: 3");
    expect(checkPolicyYaml(text).issues).toEqual([
      {
        path: "resilience.retries",
        message: 'Unknown key "retries"',
        line: lineContaining(text, "retries"),
      },
    ]);
  });

  it("places a missing section on its parent", () => {
    const parsed = (TEXT.match(/^privacy:/m) ?? []).length;
    expect(parsed).toBe(1);
    const text = TEXT.replace(/^default:.*\n(?: {2}.*\n)*/m, "");
    const check = checkPolicyYaml(text);
    expect(check.issues).toEqual([expect.objectContaining({ path: "default", line: 1 })]);
  });

  it("reports an item of a list by index (rules.N.route.M)", () => {
    const text = TEXT.replace("route: [ollama-llama]", "route: [42]");
    const issue = checkPolicyYaml(text).issues[0];
    expect(issue?.path).toBe("rules.0.route.0");
    expect(issue?.line).toBe(lineContaining(text, "route: [42]"));
  });

  it("reports a YAML syntax error at its line, before any schema check", () => {
    const text = TEXT.replace("maxAttempts: 2", "maxAttempts: [2");
    const check = checkPolicyYaml(text);
    expect(check.ok).toBe(false);
    expect(check.issues[0]?.path).toBe("");
    expect(check.issues[0]?.message).toMatch(/^YAML: /);
    expect(check.issues[0]?.line).toBeGreaterThanOrEqual(lineContaining(text, "maxAttempts"));
  });
});

describe("lineOfPath and outline", () => {
  it("finds the line of a gateway issue's path", () => {
    expect(lineOfPath(TEXT, "rules.0.route.0")).toBe(lineContaining(TEXT, "route: [ollama-llama]"));
    expect(lineOfPath(TEXT, "privacy.levels.high.residency.1")).toBe(lineContaining(TEXT, "high:"));
    expect(lineOfPath("a: [", "a")).toBeUndefined();
  });

  it("lists the sections, targets and rules with their lines", () => {
    const items = outline(TEXT);
    expect(items.filter((i) => i.depth === 0).map((i) => i.label)).toEqual(Object.keys(POLICY));
    expect(items).toContainEqual({
      label: "pinned-local",
      line: lineContaining(TEXT, "id: pinned-local"),
      depth: 1,
    });
  });
});
