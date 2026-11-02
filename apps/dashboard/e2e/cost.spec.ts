import { expect, type Page, test } from "@playwright/test";
import { type AuditEntryDto, type CostReportDto, usd } from "@tamiz/contracts";
import { formatNumber, formatUsd } from "../src/features/shared/format";
import { ADMIN_KEY, GATEWAY_URL } from "./support/fixtures";
import { auditEntry, gateway, signIn } from "./support/gateway";

// Spec 008 US7-1 … US7-6 (tasks.md T050). Entries are seeded through the control port; the
// expected figures are read from the E2E gateway's own `GET /v1/admin/cost`.

const DAY = 86_400;
const EU = {
  id: "mistral-small",
  provider: "mistral" as const,
  model: "mistral-small-latest",
  residency: "eu" as const,
};

/** Answered entries over three days on two routes, one blocked and one failed. */
function seed(): AuditEntryDto[] {
  const answered = (n: number, secondsAgo: number, onEu: boolean) =>
    auditEntry(
      {
        requestId: `req-c${n}`,
        ...(onEu && { target: EU }),
        usage: { inputTokens: 400 * n, outputTokens: 100 * n, estimated: false },
        costUsd: onEu ? 0.0001 * n : 0,
        baselineCostUsd: 0.0027 * n,
        baselineTargetId: "anthropic-sonnet",
      },
      secondsAgo,
    );
  return [
    answered(1, 60, true),
    answered(2, 120, false),
    answered(3, DAY + 60, true),
    answered(4, 2 * DAY + 60, true),
    auditEntry({ requestId: "req-cb", outcome: "blocked", blockReason: "no_target" }, 300),
    auditEntry({ requestId: "req-cf", outcome: "failed", errorType: "provider_error" }, 400),
  ];
}

/** The UI's "Last 30 days" range, computed the same way: from UTC midnight 29 days ago. */
function last30Days(): { from: string; to: string } {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { from: new Date(today - 29 * DAY * 1000).toISOString(), to: now.toISOString() };
}

async function gatewayReport(groupBy: "day" | "route" | "model"): Promise<CostReportDto> {
  const { from, to } = last30Days();
  const query = new URLSearchParams({ from, to, groupBy });
  const response = await fetch(`${GATEWAY_URL}/v1/admin/cost?${query}`, {
    headers: { authorization: `Bearer ${ADMIN_KEY}` },
  });
  return (await response.json()) as CostReportDto;
}

const kpi = (page: Page, label: string) =>
  page.locator('[data-component="kpi"]').filter({ hasText: label });

async function openCost(page: Page) {
  await signIn(page);
  await page.goto("/cost");
  await expect(page.getByRole("heading", { level: 1, name: "Cost" })).toBeVisible();
}

test.beforeEach(async () => {
  await gateway.reset();
  await gateway.appendAudit(seed());
});

test("US7-1 by day: a chart of actual vs baseline and totals equal to the report's, to the cent", async ({
  page,
}) => {
  const report = await gatewayReport("day");
  await openCost(page);
  const t = report.totals;
  await expect(kpi(page, "Actual cost")).toContainText(formatUsd(t.costUsd));
  await expect(kpi(page, "Baseline cost")).toContainText(formatUsd(t.baselineCostUsd));
  await expect(kpi(page, "Saving")).toContainText(formatUsd(t.baselineCostUsd - t.costUsd));
  await expect(kpi(page, "Requests served")).toContainText(formatNumber(t.requests));
  await expect(kpi(page, "Tokens in · out")).toContainText(formatNumber(t.inputTokens));
  const chart = page.locator('[data-component="cost-chart"]');
  await expect(chart.locator(".recharts-bar-rectangle").first()).toBeVisible();
  await expect(page.getByText("Actual (solid)")).toBeVisible();
  await expect(page.getByText("Baseline (hatched)")).toBeVisible();
  const totals = page.getByTestId("cost-totals");
  await expect(totals).toContainText(formatUsd(t.costUsd));
  await expect(totals).toContainText(formatUsd(t.baselineCostUsd));
  await expect(page.locator("table[data-slot=table] tbody tr")).toHaveCount(report.rows.length);
});

test("US7-2 grouping by route or model shows one row per key with the same totals", async ({
  page,
}) => {
  await openCost(page);
  for (const [label, groupBy] of [
    ["Route", "route"],
    ["Model", "model"],
  ] as const) {
    const report = await gatewayReport(groupBy);
    await page.getByRole("radio", { name: label }).click();
    await expect(
      page.getByRole("heading", { name: `Actual vs baseline by ${groupBy}` }),
    ).toBeVisible();
    const keys = page.locator("table[data-slot=table] tbody th[scope=row]");
    await expect(keys).toHaveText(report.rows.map((row) => row.key));
    await expect(page.getByTestId("cost-totals")).toContainText(formatUsd(report.totals.costUsd));
  }
});

test("US7-3 blocked and failed requests are shown apart, with their counts", async ({ page }) => {
  await openCost(page);
  const notServed = kpi(page, "Not served");
  await expect(notServed).toContainText("2");
  await expect(notServed).toContainText("1 blocked · 1 failed");
});

test("US7-4 without a priced target the baseline and saving are unavailable, not zero", async ({
  page,
}) => {
  await gateway.editPolicy((policy) => ({
    ...policy,
    targets: policy.targets.map((target) => ({
      ...target,
      pricing: { inputUsdPerMillion: usd(0), outputUsdPerMillion: usd(0) },
    })),
  }));
  await openCost(page);
  await expect(kpi(page, "Baseline cost")).toContainText("Not available");
  await expect(kpi(page, "Baseline cost")).toContainText("No priced target in the policy");
  await expect(kpi(page, "Saving")).toContainText("Not available");
  await expect(page.locator('[data-component="baseline-note"]')).toContainText(
    "Baseline unavailable",
  );
  await expect(page.getByText("Baseline (hatched)")).toBeHidden();
});

test("US7-5 a range with no requests says so", async ({ page }) => {
  await openCost(page);
  await page.getByRole("button", { name: "Custom" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Start").fill("2026-01-01");
  await dialog.getByLabel("End").fill("2026-01-07");
  await dialog.getByRole("button", { name: "Apply range" }).click();
  await expect(page.getByText("No requests between 2026-01-01 and 2026-01-08 UTC.")).toBeVisible();
  await expect(page.getByText("Nothing to break down in this range.")).toBeVisible();
});

test("a custom range that ends before it starts is refused next to the dates", async ({ page }) => {
  await openCost(page);
  await page.getByRole("button", { name: "Custom" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Start").fill("2026-11-01");
  await dialog.getByLabel("End").fill("2026-10-01");
  await dialog.getByRole("button", { name: "Apply range" }).click();
  await expect(dialog.getByText("The end date must be after the start date.")).toBeVisible();
  await expect(dialog.getByLabel("Start")).toHaveAttribute("aria-invalid", "true");
});

test("US7-6 the numbers are in a table and the series differ by more than colour", async ({
  page,
}) => {
  await openCost(page);
  const table = page.locator("table[data-slot=table]");
  await expect(table.locator("caption")).toHaveText(
    "Cost by day (utc), the accessible alternative to the chart",
  );
  await expect(table.locator("thead th[scope=col]")).toHaveCount(7);
  // Solid vs hatched: the baseline bars are filled with a pattern, and the legend says so.
  await expect(
    page
      .locator(
        '[data-component="cost-chart"] .recharts-bar-rectangle path[fill="url(#baseline-hatch)"]',
      )
      .first(),
  ).toBeAttached();
  await expect(page.locator('[data-component="cost-chart"]')).toHaveAttribute(
    "aria-hidden",
    "true",
  );
});
