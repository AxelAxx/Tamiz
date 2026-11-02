import { expect, type Page, test } from "@playwright/test";
import { ERRORED, FAILING, FAILING_TOTAL, PASSING, useReports } from "./fixtures/evals";
import { signIn } from "./support/gateway";

// Spec 008 US6-1 … US6-6 (tasks.md T045). Reports are files: each test writes its own into
// the dashboard's reports folder before the page loads.

async function openEvals(page: Page, search = "") {
  await signIn(page);
  await page.goto(`/evals${search}`);
  await expect(page.getByRole("heading", { level: 1, name: "Evals" })).toBeVisible();
}

const card = (page: Page, id: string) =>
  page.locator(`[data-component="eval-card"][data-eval="${id}"]`);
const metricRow = (page: Page, name: string) => page.locator(`tr[data-metric="${name}"]`);

test("US6-1 a passing report shows each gated metric against its bound, and the provenance", async ({
  page,
}) => {
  await useReports({ "evals-2026-11-01.json": PASSING });
  await openEvals(page);
  const header = page.locator('[data-component="run-header"]');
  await expect(header.getByRole("heading", { name: "Run status: pass" })).toBeVisible();
  await expect(header).toContainText("Started 2026-11-01 06:12 UTC");
  await expect(header).toContainText("4 min 12 s");
  await expect(header).toContainText("commit a3f91c2");
  await expect(header).toContainText("policy default v3");
  await expect(header).toContainText("qwen2.5:1.5b");
  await expect(header).toContainText("qwen2.5:3b");
  await expect(header).toContainText("pii-leak-es v1 (160 cases)");
  await expect(header).toContainText("Critical leak rate0.0 %target = 0.0 %");

  const recall = metricRow(page, "recall.IBAN");
  await expect(recall).toContainText("IBAN recall");
  await expect(recall).toContainText("97.0 %");
  await expect(recall).toContainText("≥ 95.0 %");
  await expect(recall.locator('[data-component="pass-fail-mark"]')).toHaveText("pass");
  await expect(metricRow(page, "leak_rate.PERSON")).toContainText("< 2.0 %");
  // A reported metric has no mark; ungated ones wait behind "more".
  await expect(metricRow(page, "saving")).toContainText("reported");
  await expect(metricRow(page, "saving").locator('[data-component="pass-fail-mark"]')).toHaveCount(
    0,
  );
  await expect(card(page, "leak").getByText("2 more reported metrics")).toBeVisible();
  for (const id of ["leak", "detection", "routing", "quality", "cost"]) {
    await expect(card(page, id)).toHaveAttribute("data-status", "pass");
  }
});

test("US6-2 a metric below its threshold fails the eval and the run, and lists its cases", async ({
  page,
}) => {
  await useReports({ "evals-2026-10-30.json": FAILING });
  await openEvals(page);
  await expect(page.getByRole("heading", { name: "Run status: fail" })).toBeVisible();
  const routing = card(page, "routing");
  await expect(routing).toHaveAttribute("data-status", "fail");
  // Failing cards come first.
  await expect(page.locator('[data-component="eval-card"]').first()).toHaveAttribute(
    "data-eval",
    "routing",
  );
  const accuracy = metricRow(page, "route_accuracy");
  await expect(accuracy).toContainText("93.2 %");
  await expect(accuracy.locator('[data-component="pass-fail-mark"]')).toHaveText("fail");
  await expect(routing.getByText(`showing 50 of ${FAILING_TOTAL}`)).toBeVisible();
  const cases = routing.locator('[data-component="failing-cases"] tbody tr');
  await expect(cases).toHaveCount(50);
  await expect(cases.first()).toContainText("rt-001");
  await expect(cases.first()).toContainText("wrong target");
  await expect(cases.first()).toContainText("route ollama-llama");
  await expect(cases.first()).toContainText("route mistral-small");
  await expect(routing).toContainText(`${FAILING_TOTAL - 50} more failed`);
});

test("US6-3 an eval in error or skipped shows why, and never a pass", async ({ page }) => {
  await useReports({ "evals-2026-10-29.json": ERRORED });
  await openEvals(page);
  await expect(page.getByRole("heading", { name: "Run status: error" })).toBeVisible();
  const quality = card(page, "quality");
  await expect(quality).toContainText("Eval did not finish");
  await expect(quality).toContainText("provider_timeout from judge");
  await expect(quality.locator('[data-component="pass-fail-mark"]')).toHaveText(["error"]);
  const cost = card(page, "cost");
  await expect(cost).toContainText("Skipped: quality did not finish; cost compares against it.");
  await expect(cost.locator('[data-component="pass-fail-mark"]')).toHaveText(["skipped"]);
  await expect(page.locator('[data-component="run-header"]')).toContainText("unknown policy");
});

test("US6-4 the history lists runs newest first by policy version, and selecting one shows it", async ({
  page,
}) => {
  await useReports({
    "a-oldest.json": ERRORED,
    "b-newest.json": PASSING,
    "c-middle.json": FAILING,
  });
  await openEvals(page);
  const history = page.locator('[data-component="run-history"]');
  await expect(history.locator("button[data-file]")).toHaveText([
    /pass\s*2026-11-01 06:12 UTC/,
    /fail\s*2026-10-30 06:11 UTC/,
    /error\s*2026-10-29 06:09 UTC/,
  ]);
  await expect(history.getByRole("heading", { level: 3 })).toHaveText([
    "policy default v3",
    "policy default v2",
    "unknown policy",
  ]);
  await expect(history.locator('button[aria-current="true"]')).toHaveAttribute(
    "data-file",
    "b-newest.json",
  );

  await history.locator('button[data-file="c-middle.json"]').click();
  await expect(page).toHaveURL(/\/evals\?run=c-middle\.json$/);
  await expect(page.getByRole("heading", { name: "Run status: fail" })).toBeVisible();
  await expect(page.locator('[data-component="run-header"]')).toContainText("commit 4c22f18");
  await expect(history.locator('button[aria-current="true"]')).toHaveAttribute(
    "data-file",
    "c-middle.json",
  );

  // The selection is in the address, so a reload keeps it.
  await page.reload();
  await expect(page.locator('[data-component="run-header"]')).toContainText("commit 4c22f18");
});

test("US6-5 a file that is not a valid report is listed by name and the valid ones still show", async ({
  page,
}) => {
  await useReports({
    "evals-2026-11-01.json": PASSING,
    "evals-2026-10-27.json": { schemaVersion: 2, run: {} },
    "notes.json": "not json at all",
    "README.txt": "ignored: not a .json file",
  });
  await openEvals(page);
  await expect(page.getByRole("heading", { name: "Run status: pass" })).toBeVisible();
  const notice = page.locator('[data-component="unreadable-reports"]');
  await expect(notice.getByRole("heading")).toHaveText("2 files could not be read");
  await expect(notice).toContainText("evals-2026-10-27.json does not match the report schema");
  await expect(notice).toContainText("notes.json is not valid JSON");
  await expect(notice).not.toContainText("README.txt");
});

test("US6-6 with no reports the screen says where they come from and how to add one", async ({
  page,
}) => {
  await useReports({});
  await openEvals(page);
  const empty = page.locator('[data-component="region-empty"]');
  await expect(empty).toContainText("CI artifact evals-report");
  await expect(empty).toContainText("TAMIZ_DASHBOARD_EVALS_DIR");
  await expect(empty).toContainText("gh run download <run-id> --name evals-report");
  await expect(page.locator('[data-component="run-history"]')).toHaveCount(0);
});

test("an unknown run in the address falls back to the latest one and says so", async ({ page }) => {
  await useReports({ "evals-2026-11-01.json": PASSING });
  await openEvals(page, "?run=gone.json");
  await expect(
    page.getByRole("status").filter({ hasText: "No report named gone.json" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Run status: pass" })).toBeVisible();
});
