import { expect, type Page, test } from "@playwright/test";
import { auditEntry, gateway, signIn } from "./support/gateway";

// Spec 008 US2-1 … US2-8, US9-3, US9-4 (tasks.md T023). Entries are appended through the
// E2E gateway's control port while the screen polls.

const table = (page: Page) => page.locator("table[data-slot=table] tbody");
const row = (page: Page, requestId: string) => page.locator(`tr[data-request-id="${requestId}"]`);

test.beforeEach(async () => {
  await gateway.reset();
});

test("US2-1 a new entry appears on top within 5 s, highlighted, with its badges and chips", async ({
  page,
}) => {
  await gateway.appendAudit([auditEntry({ requestId: "req-old1" }, 60)]);
  await signIn(page);
  await expect(row(page, "req-old1")).toBeVisible();

  const dni = auditEntry({
    requestId: "req-dni1",
    ruleId: "default",
    sensitivity: "critical",
    entities: { DNI: 1, PERSON: 1 },
    privacyAction: "restrict_to_local",
    taskType: "summarize",
  });
  await gateway.appendAudit([dni]);
  // Rows of the first load are not highlighted; only arrivals are.
  await expect(row(page, "req-old1")).not.toHaveClass(/animate-row-in/);
  const top = table(page).locator("tr").first();
  await expect(top).toHaveAttribute("data-request-id", "req-dni1", { timeout: 5_000 });
  await expect(top).toHaveClass(/animate-row-in/);
  await expect(top.locator('[data-component="residency-badge"]')).toHaveText("Local");
  await expect(top.getByText("ollama-llama")).toBeVisible();
  await expect(top.getByText("default", { exact: true })).toBeVisible();
  await expect(top.locator('[data-component="privacy-action-badge"]')).toHaveText("local only");
  await expect(top.locator('[data-component="entity-chip"]')).toHaveText([
    /DNI\s*×1/,
    /PERSON\s*×1/,
  ]);
  await expect(top.locator('[data-component="entity-chip"]').first()).toHaveAttribute(
    "data-critical",
    "true",
  );
});

test("US2-2 a fallback marker names the abandoned targets and reasons", async ({ page }) => {
  await gateway.appendAudit([
    auditEntry({
      requestId: "req-fb01",
      target: {
        id: "mistral-small",
        provider: "mistral",
        model: "mistral-small-latest",
        residency: "eu",
      },
      abandoned: [{ targetId: "openai-mini", reason: "timeout" }],
    }),
  ]);
  await signIn(page);
  const marker = row(page, "req-fb01").getByRole("button", {
    name: "Fell back 1 time: openai-mini timeout",
  });
  await expect(marker).toBeVisible();
  await marker.focus();
  await expect(page.getByRole("tooltip")).toContainText("openai-mini · timeout");
});

test("US2-3 blocked and failed rows say so instead of a route, at zero cost", async ({ page }) => {
  await gateway.appendAudit([
    auditEntry(
      {
        requestId: "req-blk1",
        outcome: "blocked",
        blockReason: "no_target",
        sensitivity: "critical",
        entities: { IBAN: 1 },
        privacyAction: "block",
        abandoned: [],
        usage: undefined,
      },
      3,
    ),
    auditEntry({ requestId: "req-fail", outcome: "failed", errorType: "provider_error" }, 2),
  ]);
  await signIn(page);
  const blocked = row(page, "req-blk1");
  await expect(blocked.locator('[data-component="outcome-badge"]')).toHaveText("Blocked");
  await expect(blocked).toContainText("no allowed target");
  await expect(blocked.locator('[data-component="residency-badge"]')).toHaveCount(0);
  await expect(blocked).toContainText("$0.0000");
  const failed = row(page, "req-fail");
  await expect(failed.locator('[data-component="outcome-badge"]')).toHaveText("Failed");
  await expect(failed).toContainText("failed: provider_error");
});

test("US2-4 pause keeps rows still and counts new ones; resume adds them once", async ({
  page,
}) => {
  await gateway.appendAudit([auditEntry({ requestId: "req-p001" }, 10)]);
  await signIn(page);
  await expect(row(page, "req-p001")).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await gateway.appendAudit([
    auditEntry({ requestId: "req-p002" }, 2),
    auditEntry({ requestId: "req-p003" }, 1),
  ]);
  await expect(page.getByRole("button", { name: /2 new/ })).toBeVisible({ timeout: 6_000 });
  await expect(table(page).locator("tr")).toHaveCount(1);

  await page.getByRole("button", { name: /2 new/ }).click();
  await expect(table(page).locator("tr")).toHaveCount(3);
  await expect(table(page).locator("tr").first()).toHaveAttribute("data-request-id", "req-p003");
  // Later polls bring the same entries again; none is duplicated.
  await page.waitForTimeout(4_500);
  await expect(table(page).locator("tr")).toHaveCount(3);
});

test("US2-5 an entry that finishes late still appears in start order, once", async ({ page }) => {
  await gateway.appendAudit([auditEntry({ requestId: "req-shrt" }, 2)]);
  await signIn(page);
  await expect(row(page, "req-shrt")).toBeVisible();

  // Started 90 s ago, written now.
  await gateway.appendAudit([auditEntry({ requestId: "req-long", latencyMs: 88_000 }, 90)]);
  await expect(row(page, "req-long")).toBeVisible({ timeout: 5_000 });
  await expect(table(page).locator("tr").nth(1)).toHaveAttribute("data-request-id", "req-long");
  await page.waitForTimeout(4_500);
  await expect(row(page, "req-long")).toHaveCount(1);
});

test("US2-6 when polls fail the rows stay, the status says retrying, and it recovers", async ({
  page,
}) => {
  await gateway.appendAudit([auditEntry({ requestId: "req-kept" }, 5)]);
  await signIn(page);
  await expect(row(page, "req-kept")).toBeVisible();

  await page.route("**/api/audit**", (route) => route.abort());
  await expect(page.locator('[data-component="stream-status"]')).toContainText("Retrying since", {
    timeout: 8_000,
  });
  await expect(page.getByText("Live updates interrupted")).toBeVisible();
  await expect(row(page, "req-kept")).toBeVisible();

  await page.unroute("**/api/audit**");
  await expect(page.locator('[data-component="stream-status"]')).toHaveText("Live", {
    timeout: 20_000,
  });
  await expect(page.getByText("Live updates interrupted")).toBeHidden();
});

test("US2-7 and US2-8 the detail shows every field, no content, and links to the audit log", async ({
  page,
}) => {
  const entry = auditEntry({
    requestId: "req-a41c",
    ruleId: "long-documents-eu",
    taskType: "summarize",
    size: "long",
    sensitivity: "high",
    entities: { PERSON: 1, EMAIL: 1 },
    privacyAction: "anonymize",
    noticeVersion: "v1",
    target: {
      id: "mistral-small",
      provider: "mistral",
      model: "mistral-small-latest",
      residency: "eu",
    },
    abandoned: [{ targetId: "openai-mini", reason: "rate_limited" }],
    usage: { inputTokens: 1240, outputTokens: 310, estimated: true },
    costUsd: 0.0002,
    baselineCostUsd: 0.0084,
    baselineTargetId: "anthropic-sonnet",
  });
  await gateway.appendAudit([entry]);
  await signIn(page);
  await row(page, "req-a41c").click();

  const detail = page.getByRole("dialog", { name: /Request req-a41c/ });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Tamiz never stores what was said.");
  for (const text of [
    "mistral-small-latest",
    "openai-mini",
    "rate_limited",
    "anonymize",
    "v1",
    "version 3",
    "long-documents-eu",
    "summarize · long",
    "1,240 · 310",
    "estimated",
    "$0.0002",
    "$0.0084",
    "anthropic-sonnet",
    entry.requestHash.slice(0, 12),
  ]) {
    await expect(detail, text).toContainText(text);
  }
  // Only the first characters of the hash are ever shown.
  expect(await page.content()).not.toContain(entry.requestHash);
  await detail.getByRole("link", { name: "See requests with this rule" }).click();
  await expect(page).toHaveURL(/\/audit\?rule=long-documents-eu$/);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("US9-3 a new row only fades", async ({ page }) => {
    await signIn(page);
    // Rows of the first load are not new; wait for it so the next entry is.
    await expect(page.getByText("Showing 0")).toBeVisible();
    await gateway.appendAudit([auditEntry({ requestId: "req-rm01" })]);
    const added = row(page, "req-rm01");
    await expect(added).toBeVisible({ timeout: 5_000 });
    expect(await added.evaluate((el) => getComputedStyle(el).animationName)).toBe("row-fade");
  });
});

test("US9-4 arrivals are announced politely, at most once every 10 s, with a count", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await signIn(page);
  await expect(page.getByText("Showing 0")).toBeVisible();
  const region = page.getByTestId("live-announcement");
  await expect(region).toHaveAttribute("aria-live", "polite");
  await region.evaluate((el) => {
    const w = window as unknown as { changes: number };
    w.changes = 0;
    new MutationObserver(() => {
      w.changes += 1;
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
  for (let i = 0; i < 3; i++) {
    await gateway.appendAudit([auditEntry({ requestId: `req-an0${i}` })]);
    await page.waitForTimeout(2_500);
  }
  await expect(region).toHaveText(/^\d+ new requests?$/, { timeout: 12_000 });
  const first = await page.evaluate(() => (window as unknown as { changes: number }).changes);
  await page.waitForTimeout(4_000);
  const after = await page.evaluate(() => (window as unknown as { changes: number }).changes);
  expect(after).toBe(first);
});
