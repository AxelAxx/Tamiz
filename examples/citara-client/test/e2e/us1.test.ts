/**
 * Spec 010 US1: Citara gets completions through Tamiz by changing only the base URL and
 * the key. One test per acceptance scenario, against the E2E harness.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { failTarget, providerCalls, reset, runAgainstHarness } from "../support/harness.js";

beforeEach(async () => {
  await reset();
});

describe("US1 - completions with only base URL and key", () => {
  it("US1-1: a non-streaming request reports the answer and the Tamiz headers", async () => {
    const run = await runAgainstHarness({ TAMIZ_PROMPT: "Say hello to the team" });
    expect(run.code).toBe(0);
    expect(run.fields.status).toBe("200");
    expect(run.fields.request_id).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
    expect(run.fields.route).toEqual(expect.any(String));
    expect(run.fields.rule).toEqual(expect.any(String));
    expect(run.fields.sensitivity).toBe("none");
    expect(run.fields.privacy).toBe("allow");
    expect(run.answer).toBe("echo: Say hello to the team");
    const calls = await providerCalls();
    expect(calls.map((c) => c.targetId)).toEqual([run.fields.route]);
  });

  it("US1-2: a streamed request reports the same headers and the joined deltas", async () => {
    const run = await runAgainstHarness({
      TAMIZ_PROMPT: "Say hello to the team",
      TAMIZ_STREAM: "true",
    });
    expect(run.code).toBe(0);
    expect(run.fields.status).toBe("200");
    expect(run.fields.route).toEqual(expect.any(String));
    expect(run.fields.privacy).toBe("allow");
    expect(run.fields.usage).toContain('"total_tokens"');
    expect(run.answer).toBe("echo: Say hello to the team");
  });

  it("US1-3: model tamiz-local is routed to ollama-llama by pinned-local", async () => {
    const run = await runAgainstHarness({ TAMIZ_PROMPT: "hello", TAMIZ_MODEL: "tamiz-local" });
    expect(run.code).toBe(0);
    expect(run.fields.route).toBe("ollama-llama");
    expect(run.fields.rule).toBe("pinned-local");
  });

  it("US1-4: the gateway echoes the client's correlation id", async () => {
    const run = await runAgainstHarness({
      TAMIZ_PROMPT: "hello",
      TAMIZ_REQUEST_ID: "citara-corr-0001",
    });
    expect(run.code).toBe(0);
    expect(run.fields.request_id).toBe("citara-corr-0001");
  });

  it("US1-5: a wrong key exits non-zero with `unauthorized` and never prints the key", async () => {
    const wrongKey = "tmz_wrong-key-for-us1-5-0000000000";
    const run = await runAgainstHarness({ TAMIZ_PROMPT: "hello", TAMIZ_API_KEY: wrongKey });
    expect(run.code).toBe(1);
    expect(run.fields.status).toBe("401");
    expect(run.fields.error_type).toBe("unauthorized");
    expect(run.output).not.toContain(wrongKey);
  });

  it("US1-6: a failed first target is reported in `fallback` next to the route that answered", async () => {
    // Discover the head of the chain for this prompt, then make it fail.
    const first = await runAgainstHarness({ TAMIZ_PROMPT: "Say hello to the team" });
    const head = first.fields.route ?? "";
    await reset();
    await failTarget(head, "http_error");
    const run = await runAgainstHarness({ TAMIZ_PROMPT: "Say hello to the team" });
    expect(run.code).toBe(0);
    expect(run.fields.fallback).toContain(`${head}:`);
    expect(run.fields.route).not.toBe(head);
    expect(run.answer).toBe("echo: Say hello to the team");
  });
});
