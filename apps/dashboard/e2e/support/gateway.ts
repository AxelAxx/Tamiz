import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import type { AuditEntryDto } from "@tamiz/contracts";
import { CONTROL_URL, PASSPHRASE } from "./fixtures";

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
