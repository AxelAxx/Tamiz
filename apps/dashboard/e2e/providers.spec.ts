import { expect, type Page, test } from "@playwright/test";
import type { ProvidersReportDto } from "@tamiz/contracts";
import { ADMIN_KEY, GATEWAY_URL } from "./support/fixtures";
import { auditEntry, gateway, signIn } from "./support/gateway";

// Spec 008 US8-1 … US8-3 (tasks.md T047). Attempts are seeded as audit entries and circuits
// opened through the control port; expected figures come from the E2E gateway's own
// `GET /v1/admin/providers`.

const EU = {
  id: "mistral-small",
  provider: "mistral" as const,
  model: "mistral-small-latest",
  residency: "eu" as const,
};

async function gatewayReport(windowMinutes: number): Promise<ProvidersReportDto> {
  const response = await fetch(`${GATEWAY_URL}/v1/admin/providers?windowMinutes=${windowMinutes}`, {
    headers: { authorization: `Bearer ${ADMIN_KEY}` },
  });
  return (await response.json()) as ProvidersReportDto;
}

const card = (page: Page, targetId: string) =>
  page.locator(`[data-component="provider-card"][data-target="${targetId}"]`);
const figure = (page: Page, targetId: string, label: string) =>
  card(page, targetId)
    .locator("dl > div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("dd");

async function openProviders(page: Page) {
  await signIn(page);
  await page.goto("/providers");
  await expect(page.getByRole("heading", { level: 1, name: "Providers" })).toBeVisible();
  await expect(page.locator('[data-component="provider-card"]').first()).toBeVisible();
}

test.beforeEach(async () => {
  await gateway.reset();
  await gateway.appendAudit([
    auditEntry({ latencyMs: 820 }, 60),
    auditEntry({ latencyMs: 1410 }, 120),
    auditEntry({ target: EU, latencyMs: 1340 }, 90),
    auditEntry({ target: EU, outcome: "failed", errorType: "provider_error" }, 100),
    // Outside the default 15-minute window, inside the 60-minute one.
    auditEntry({ latencyMs: 900 }, 30 * 60),
  ]);
});

test("US8-1 every declared target is shown with its circuit state, idle ones included", async ({
  page,
}) => {
  const report = await gatewayReport(15);
  await openProviders(page);
  const cards = page.locator('[data-component="provider-card"]');
  await expect(cards).toHaveCount(report.targets.length);
  await expect(cards.locator("h2")).toHaveText(report.targets.map((t) => t.targetId));

  for (const target of report.targets) {
    const badge = card(page, target.targetId).locator('[data-component="circuit-badge"]');
    await expect(badge).toHaveText(target.circuit.replace("_", " "));
    await expect(figure(page, target.targetId, "Attempts")).toHaveText(
      String(target.window.requests),
    );
  }
  await expect(figure(page, "ollama-llama", "Latency p50")).not.toHaveText("—");
  await expect(figure(page, "mistral-small", "Errors")).toHaveText("1");
  await expect(figure(page, "mistral-small", "Error rate")).toHaveText("50.0 %");

  const idle = report.targets.find((t) => t.window.requests === 0);
  expect(idle, "the default policy has a target without traffic").toBeDefined();
  if (idle === undefined) return;
  await expect(card(page, idle.targetId)).toContainText("idle: no attempts in this window");
  await expect(figure(page, idle.targetId, "Attempts")).toHaveText("0");
  await expect(figure(page, idle.targetId, "Error rate")).toHaveText("—");
  await expect(figure(page, idle.targetId, "Latency p50")).toHaveText("—");
  await expect(figure(page, idle.targetId, "Latency p95")).toHaveText("—");
});

test("US8-2 an open circuit counts its cool-down down and the screen refreshes within 10 s", async ({
  page,
}) => {
  await openProviders(page);
  // Opened after the first load: only a refresh can show it. The cool-down stays within
  // the default policy's 30 s, or the gateway would read the circuit as half-open.
  await gateway.openCircuit("mistral-small", 29_000);
  const target = card(page, "mistral-small");
  await expect(target).toHaveAttribute("data-circuit", "open", { timeout: 11_000 });
  await expect(target).toContainText("requests skip this target; fallbacks take over");

  const badge = target.locator('[data-component="circuit-badge"]');
  const seconds = async () => Number((await badge.textContent())?.match(/retry in (\d+) s/)?.[1]);
  const first = await seconds();
  expect(first).toBeGreaterThan(10);
  expect(first).toBeLessThanOrEqual(29);
  await expect.poll(seconds, { timeout: 5_000 }).toBeLessThan(first);
});

test("US8-3 another window shows that window's numbers and names it", async ({ page }) => {
  const [fifteen, sixty] = [await gatewayReport(15), await gatewayReport(60)];
  const attempts = (r: ProvidersReportDto) =>
    String(r.targets.find((t) => t.targetId === "ollama-llama")?.window.requests);
  expect(attempts(sixty)).not.toBe(attempts(fifteen));

  await openProviders(page);
  const header = page.locator('[data-component="provider-window"]');
  await expect(header).toContainText("Last 15 min");
  await expect(page.getByRole("radio", { name: "15 min" })).toHaveAttribute("aria-checked", "true");
  await expect(figure(page, "ollama-llama", "Attempts")).toHaveText(attempts(fifteen));

  await page.getByRole("radio", { name: "60 min" }).click();
  await expect(header).toContainText("Last 60 min");
  await expect(figure(page, "ollama-llama", "Attempts")).toHaveText(attempts(sixty));
});
