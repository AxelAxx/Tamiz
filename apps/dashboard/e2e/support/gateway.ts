import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import type { ActivePolicyDto, AuditEntryDto, RoutingPolicyDto } from "@tamiz/contracts";
import { ADMIN_KEY, CONTROL_URL, GATEWAY_URL, PASSPHRASE } from "./fixtures";

/** One request the E2E gateway received (its control port, `GET /__e2e/requests`). */
export interface ReceivedRequest {
  readonly method: string;
  readonly path: string;
  readonly authorization: string | null;
}

async function control(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${CONTROL_URL}${path}`, init);
  if (!response.ok) throw new Error(`control ${path} answered ${response.status}`);
  return response.json();
}

export const gateway = {
  reset: () => control("/__e2e/reset", { method: "POST" }),
  /** Appends audit entries as if the gateway had just written them. */
  appendAudit: (entries: ReadonlyArray<AuditEntryDto>) =>
    control("/__e2e/audit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entries),
    }),
  /** Opens a target's circuit in the shared circuit store for `cooldownMs`. */
  openCircuit: (targetId: string, cooldownMs: number) =>
    control("/__e2e/circuit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetId, cooldownMs }),
    }),
  /** Turns the scripted detector's outage on or off. */
  detector: (outage: boolean) =>
    control("/__e2e/detector", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outage }),
    }),
  /**
   * Replaces the E2E gateway's policy through its admin API (spec 008 T-008-12); a reset
   * restores the default one.
   */
  editPolicy: async (edit: (policy: RoutingPolicyDto) => RoutingPolicyDto) => {
    const headers = { authorization: `Bearer ${ADMIN_KEY}`, "content-type": "application/json" };
    const active = (await (
      await fetch(`${GATEWAY_URL}/v1/admin/policy`, { headers })
    ).json()) as ActivePolicyDto;
    const response = await fetch(`${GATEWAY_URL}/v1/admin/policy`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ baseVersion: active.policy.version, policy: edit(active.policy) }),
    });
    if (!response.ok) throw new Error(`policy replace answered ${response.status}`);
  },
  requests: async () =>
    ((await control("/__e2e/requests")) as { requests: ReceivedRequest[] }).requests,
};

/** Signs in through the sign-in page and waits for the live traffic screen. */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/live$/);
}

/**
 * A synthetic audit entry that started `secondsAgo` ago: by default an answered short chat
 * on `ollama-llama` with no personal data. Never real data (constitution IV).
 */
export function auditEntry(overrides: Partial<AuditEntryDto> = {}, secondsAgo = 1): AuditEntryDto {
  const started = Date.now() - secondsAgo * 1000;
  const n = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
  return {
    id: randomUUID(),
    requestId: `req-${n}`,
    clientId: "demo",
    startedAt: new Date(started).toISOString(),
    endedAt: new Date(started + 840).toISOString(),
    latencyMs: 840,
    requestHash: "b7c4e2a19f03d5c6".repeat(4),
    policyId: "default",
    policyVersion: 3,
    ruleId: "default",
    taskType: "chat",
    size: "short",
    sensitivity: "none",
    entities: {},
    privacyAction: "allow",
    outcome: "answered",
    streamed: false,
    target: { id: "ollama-llama", provider: "ollama", model: "llama3.1:8b", residency: "local" },
    abandoned: [],
    usage: { inputTokens: 40, outputTokens: 10, estimated: false },
    costUsd: 0,
    ...overrides,
  };
}
