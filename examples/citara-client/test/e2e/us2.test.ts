/**
 * Spec 010 US2: personal data Citara sends is handled by Tamiz's policy, with no change in
 * Citara. Prompts use the harness's synthetic markers (DNI 12345678Z, person Ana García,
 * phone 612345678). One test per acceptance scenario.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  openCircuit,
  providerCalls,
  reset,
  runAgainstHarness,
  setDetectorOutage,
} from "../support/harness.js";

beforeEach(async () => {
  await reset();
});

const contents = (calls: Awaited<ReturnType<typeof providerCalls>>) =>
  calls.flatMap((call) => call.messages.map((m) => m.content ?? "")).join("\n");

describe("US2 - personal data handled by the policy", () => {
  it("US2-1: a DNI is restricted to the local route; no other target is called", async () => {
    const run = await runAgainstHarness({
      TAMIZ_PROMPT: "Summarise the case of the customer with DNI 12345678Z",
    });
    expect(run.code).toBe(0);
    expect(run.fields.sensitivity).toBe("critical");
    expect(run.fields.privacy).toBe("restrict_to_local");
    expect(run.fields.route).toBe("ollama-llama");
    const calls = await providerCalls();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.targetId === "ollama-llama")).toBe(true);
  });

  it("US2-2: a name and a phone are anonymized for the provider and restored for the client", async () => {
    const run = await runAgainstHarness({
      TAMIZ_PROMPT: "Call Ana García back on 612345678 tomorrow",
    });
    expect(run.code).toBe(0);
    expect(run.fields.privacy).toBe("anonymize;notice=v1");
    const sent = contents(await providerCalls());
    expect(sent).not.toContain("Ana García");
    expect(sent).not.toContain("612345678");
    expect(run.answer).toContain("Ana García");
    expect(run.answer).toContain("612345678");
  });

  it("US2-3: tamiz-frontier with a name is blocked (451), sent once, no provider called", async () => {
    const run = await runAgainstHarness({
      TAMIZ_PROMPT: "Call Ana García back",
      TAMIZ_MODEL: "tamiz-frontier",
    });
    expect(run.code).toBe(1);
    expect(run.fields.status).toBe("451");
    expect(run.fields.error_type).toBe("policy_blocked");
    expect(run.fields.retryable).toBe("false");
    expect(run.fields.privacy).toBe("block");
    expect(run.fields.attempts).toBe("1");
    expect(await providerCalls()).toHaveLength(0);
  });

  it("US2-4: with the detector down, the default policy answers on the local route", async () => {
    await setDetectorOutage(true);
    const run = await runAgainstHarness({ TAMIZ_PROMPT: "Say hello to the team" });
    expect(run.code).toBe(0);
    expect(run.fields.route).toBe("ollama-llama");
    expect(run.fields.sensitivity).toBe("unknown");
    expect(run.fields.privacy).toBe("restrict_to_local");
  });

  it("US2-5: a 503 is reported as retryable with retry-after, and retried once", async () => {
    await openCircuit("ollama-llama", 1_000);
    const waits: number[] = [];
    // The retry happens at once, so the circuit is still open on the second attempt.
    const run = await runAgainstHarness(
      { TAMIZ_PROMPT: "hello", TAMIZ_MODEL: "tamiz-local" },
      { sleep: async (ms) => void waits.push(ms) },
    );
    expect(run.code).toBe(1);
    expect(run.fields.status).toBe("503");
    expect(run.fields.error_type).toBe("provider_unavailable");
    expect(run.fields.retryable).toBe("true");
    expect(run.fields.retry_after).toBe("1");
    expect(run.fields.attempts).toBe("2");
    expect(waits).toEqual([1_000]);
  });
});
