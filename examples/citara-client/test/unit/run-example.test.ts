import { describe, expect, it } from "vitest";
import type { ExampleConfig } from "../../src/config.js";
import { type RunDeps, runExample } from "../../src/run-example.js";
import {
  auditEntry,
  auditPage,
  completion,
  fakeFetch,
  gatewayError,
  type Responder,
  streamed,
} from "../support/fake-fetch.js";

const KEY = "tmz_unit-client-key-0001";
const ADMIN = "tmz_unit-admin-key-0002";
const CONFIG: ExampleConfig = {
  baseUrl: "http://tamiz.test/v1",
  apiKey: KEY,
  model: "tamiz-auto",
  prompt: "hello there",
  stream: false,
  timeoutMs: 70_000,
  auditWaitMs: 0,
};

async function run(config: ExampleConfig, responders: ReadonlyArray<Responder>) {
  const { fetch, requests } = fakeFetch(responders);
  const sleeps: number[] = [];
  let output = "";
  const deps: RunDeps = {
    fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    now: () => Date.parse("2026-11-01T10:00:00.000Z"),
    write: (text) => {
      output += text;
    },
  };
  const code = await runExample(config, deps);
  return { code, output, requests, sleeps };
}

describe("runExample (spec 010 FR-008 … FR-012)", () => {
  it("reports the answer, the request id and every Tamiz header of a 200", async () => {
    const { code, output, requests } = await run(CONFIG, [completion("hi!")]);
    expect(code).toBe(0);
    expect(output).toContain("status: 200\nrequest_id: req-1\nroute: ollama-llama\n");
    expect(output).toContain("rule: pinned-local\nsensitivity: none\nprivacy: allow\n");
    expect(output).toContain("attempts: 1\nmodel: llama3.1:8b\nfinish_reason: stop\n");
    expect(output).toMatch(/\n\nhi!\n$/);
    expect(requests[0]?.url).toBe("http://tamiz.test/v1/chat/completions");
    expect(requests[0]?.headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(requests[0]?.body ?? "{}")).toEqual({
      model: "tamiz-auto",
      messages: [{ role: "user", content: "hello there" }],
    });
  });

  it("concatenates streamed deltas and reports the usage chunk", async () => {
    const { code, output, requests } = await run({ ...CONFIG, stream: true }, [
      streamed(["he", "llo"]),
    ]);
    expect(code).toBe(0);
    expect(JSON.parse(requests[0]?.body ?? "{}")).toMatchObject({ stream: true });
    expect(output).toContain("route: ollama-llama");
    expect(output).toContain('usage: {"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}');
    expect(output).toMatch(/\n\nhello\n$/);
  });

  it("sends the correlation id as x-request-id", async () => {
    const { requests } = await run({ ...CONFIG, requestId: "citara-42" }, [completion("ok")]);
    expect(requests[0]?.headers.get("x-request-id")).toBe("citara-42");
  });

  it("US1-5: a 401 exits 1 with `unauthorized` and never prints the key", async () => {
    const { code, output, requests } = await run(CONFIG, [gatewayError(401, "unauthorized")]);
    expect(code).toBe(1);
    expect(output).toContain("status: 401");
    expect(output).toContain("error_type: unauthorized\nretryable: false\nattempts: 1\n");
    expect(output).not.toContain(KEY);
    expect(requests).toHaveLength(1);
  });

  it("a network error is reported, not retried, and exits 1", async () => {
    const { code, output, requests } = await run(CONFIG, [
      () => Promise.reject(new TypeError("fetch failed")),
    ]);
    expect(code).toBe(1);
    expect(output).toContain("status: none\nerror_type: network_error\nretryable: false");
    expect(requests).toHaveLength(1);
  });
});

describe("retry rule (spec 010 FR-010, research R-03)", () => {
  it("503 then 200: waits `retry-after` once and exits 0 after 2 attempts", async () => {
    const { code, output, sleeps } = await run(CONFIG, [
      gatewayError(503, "provider_unavailable", { "retry-after": "2" }),
      completion("recovered"),
    ]);
    expect(code).toBe(0);
    expect(sleeps).toEqual([2_000]);
    expect(output).toContain("attempts: 2");
    expect(output).toContain("recovered");
  });

  it("503 twice: stops after 2 attempts and exits 1", async () => {
    const { code, output, requests } = await run(CONFIG, [
      gatewayError(503, "privacy_unavailable"),
      gatewayError(503, "privacy_unavailable"),
    ]);
    expect(code).toBe(1);
    expect(requests).toHaveLength(2);
    expect(output).toContain("error_type: privacy_unavailable\nretryable: true\nattempts: 2");
  });

  it.each([
    [451, "policy_blocked"],
    [400, "invalid_request"],
    [502, "provider_error"],
    [504, "provider_timeout"],
  ])("%i %s is sent exactly once", async (status, type) => {
    const { code, requests, output } = await run(CONFIG, [gatewayError(status, type)]);
    expect(code).toBe(1);
    expect(requests).toHaveLength(1);
    expect(output).toContain(`error_type: ${type}\nretryable: false\nattempts: 1`);
  });

  it("caps a retry-after of 120 s at 30 s", async () => {
    const { sleeps } = await run(CONFIG, [
      gatewayError(429, "rate_limited", { "retry-after": "120" }),
      completion("ok"),
    ]);
    expect(sleeps).toEqual([30_000]);
  });
});

describe("audit check wiring (spec 010 FR-011, FR-012)", () => {
  const WITH_ADMIN = { ...CONFIG, adminKey: ADMIN };

  it("prints the entry found by request id and exits 0", async () => {
    const { code, output, requests } = await run(WITH_ADMIN, [
      completion("ok"),
      auditPage([auditEntry("other"), auditEntry("req-1")]),
    ]);
    expect(code).toBe(0);
    expect(output).toContain('audit: {"id":');
    expect(output).toContain('"requestId":"req-1"');
    expect(requests[1]?.headers.get("authorization")).toBe(`Bearer ${ADMIN}`);
    expect(output).not.toContain(ADMIN);
  });

  it("checks the audit of a blocked request too, and still exits 1", async () => {
    const { code, output } = await run(WITH_ADMIN, [
      gatewayError(451, "policy_blocked"),
      auditPage([auditEntry("req-1", { outcome: "blocked" })]),
    ]);
    expect(code).toBe(1);
    expect(output).toContain('"outcome":"blocked"');
  });

  it("an entry not found makes the run fail even when the request was answered", async () => {
    const { code, output } = await run(WITH_ADMIN, [completion("ok"), auditPage([])]);
    expect(code).toBe(1);
    expect(output).toContain("audit_error: not_found");
  });

  it("skips the audit check when the gateway never answered", async () => {
    const { requests, output } = await run(WITH_ADMIN, [
      () => Promise.reject(new TypeError("fetch failed")),
    ]);
    expect(requests).toHaveLength(1);
    expect(output).not.toContain("audit");
  });
});
