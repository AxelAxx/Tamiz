/**
 * Helpers for the end-to-end tests: run the example against the harness and drive the
 * harness's control server (reset, provider calls and failures, circuits, detector).
 */
import { inject } from "vitest";
import { type ExampleConfig, loadConfig } from "../../src/config.js";
import type { ReportField } from "../../src/report.js";
import { runExample } from "../../src/run-example.js";
import { HARNESS_KEYS } from "../global-setup.js";

export { HARNESS_KEYS };

export function harnessUrls() {
  return inject("harness");
}

async function control(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${harnessUrls().controlUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`control ${path} answered ${response.status}`);
  return response.json();
}

export const reset = () => control("/__e2e/reset", {});
export const failTarget = (targetId: string, fail: "http_error" | "timeout") =>
  control("/__e2e/provider-script", { targetId, fail });
export const openCircuit = (targetId: string, cooldownMs: number) =>
  control("/__e2e/circuit", { targetId, cooldownMs });
export const setDetectorOutage = (outage: boolean) => control("/__e2e/detector", { outage });

export interface ProviderCall {
  readonly targetId: string;
  readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string | null }>;
}

export async function providerCalls(): Promise<ReadonlyArray<ProviderCall>> {
  const body = (await control("/__e2e/provider-calls")) as { calls: ProviderCall[] };
  return body.calls;
}

/** Gateway requests the harness saw (method and path), e.g. to count audit lookups. */
export async function gatewayRequests(): Promise<ReadonlyArray<{ method: string; path: string }>> {
  const body = (await control("/__e2e/requests")) as {
    requests: Array<{ method: string; path: string }>;
  };
  return body.requests;
}

export interface ExampleRun {
  readonly code: number;
  readonly output: string;
  /** `key: value` fields of the report (everything before the blank line). */
  readonly fields: Readonly<Partial<Record<ReportField, string>>>;
  /** The answer block, or "" when there is none. */
  readonly answer: string;
}

/**
 * Runs the example through `loadConfig` (as `main` does) with real `fetch`. `sleep` can be
 * replaced so a retry happens at once (US2-5).
 */
export async function runAgainstHarness(
  env: Readonly<Record<string, string>>,
  options: { readonly sleep?: (ms: number) => Promise<void> } = {},
): Promise<ExampleRun> {
  const loaded = loadConfig({
    TAMIZ_BASE_URL: harnessUrls().baseUrl,
    TAMIZ_API_KEY: HARNESS_KEYS.citara,
    TAMIZ_AUDIT_WAIT_MS: "2000",
    ...env,
  });
  if (!loaded.ok) throw new Error(loaded.message);
  const config: ExampleConfig = loaded.config;
  let output = "";
  const code = await runExample(config, {
    fetch: globalThis.fetch,
    sleep: options.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms))),
    now: Date.now,
    write: (text) => {
      output += text;
    },
  });
  const [head = "", ...rest] = output.split("\n\n");
  const fields: Partial<Record<ReportField, string>> = {};
  for (const line of head.split("\n")) {
    const at = line.indexOf(": ");
    if (at > 0) fields[line.slice(0, at) as ReportField] = line.slice(at + 2);
  }
  return { code, output, fields, answer: rest.join("\n\n").replace(/\n$/, "") };
}
