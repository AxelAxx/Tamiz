import { expect, test } from "@playwright/test";
import { ERRORED, FAILING, useReports } from "./fixtures/evals";
import { expectNoSeriousViolations } from "./support/axe";
import { auditEntry, gateway, signIn } from "./support/gateway";

// Spec 008 US9-1 (tasks.md T017): no serious or critical axe violation on the sign-in page
// and the empty shell, in both themes. Each screen task adds its own screen here.

test.beforeEach(async () => {
  await gateway.reset();
});

for (const theme of ["dark", "light"] as const) {
  test(`US9-1 sign-in page, ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await page.goto("/sign-in");
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
    await expectNoSeriousViolations(page, `sign-in ${theme}`);

    // The error state too.
    await page.getByLabel("Passphrase", { exact: true }).fill("not the passphrase");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expectNoSeriousViolations(page, `sign-in error ${theme}`);
  });

  test(`US9-1 empty shell, ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await signIn(page);
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
    await expect(
      page.getByRole("button", { name: /Gateway status|Connected/ }).first(),
    ).toBeVisible();
    await expectNoSeriousViolations(page, `shell ${theme}`);

    await page.getByRole("button", { name: "Operator menu" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expectNoSeriousViolations(page, `operator menu ${theme}`);
  });

  test(`US9-1 live traffic with rows and the detail, ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await gateway.appendAudit([
      auditEntry({
        requestId: "req-ax01",
        sensitivity: "critical",
        entities: { DNI: 1, PERSON: 1, EMAIL: 2, PHONE: 1 },
        privacyAction: "restrict_to_local",
      }),
      auditEntry({
        requestId: "req-ax02",
        target: {
          id: "mistral-small",
          provider: "mistral",
          model: "mistral-small-latest",
          residency: "eu",
        },
        abandoned: [{ targetId: "openai-mini", reason: "timeout" }],
        privacyAction: "anonymize",
        sensitivity: "high",
        entities: { PERSON: 1 },
      }),
      auditEntry({
        requestId: "req-ax03",
        outcome: "blocked",
        blockReason: "no_target",
        privacyAction: "block",
      }),
    ]);
    await signIn(page);
    await expect(page.locator('tr[data-request-id="req-ax03"]')).toBeVisible();
    await expectNoSeriousViolations(page, `live ${theme}`);
    await page.locator('tr[data-request-id="req-ax02"]').click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoSeriousViolations(page, `live detail ${theme}`);
  });

  test(`US9-1 simulator with an anonymize result, ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await signIn(page);
    await page.goto("/simulator");
    await page
      .getByLabel("User message", { exact: true })
      .fill("Resume el informe de Ana García (ana.garcia@example.com) para el comité.");
    await page.getByRole("button", { name: "Simulate" }).click();
    await expect(page.locator('[data-component="verdict"]')).toBeVisible();
    await expectNoSeriousViolations(page, `simulator ${theme}`);
  });

  test(`US9-1 audit log with filters set, ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await gateway.appendAudit([
      auditEntry({ requestId: "req-au01", sensitivity: "critical", entities: { DNI: 1 } }),
      auditEntry({ requestId: "req-au02", outcome: "blocked", blockReason: "no_target" }),
    ]);
    await signIn(page);
    await page.goto("/audit?outcome=blocked");
    await expect(page.locator('tr[data-request-id="req-au02"]')).toBeVisible();
    await expectNoSeriousViolations(page, `audit ${theme}`);
  });

  test(`US9-1 cost analytics with data, ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await gateway.appendAudit([
      auditEntry({ requestId: "req-co01", costUsd: 0.0012, baselineCostUsd: 0.0081 }, 60),
      auditEntry({ requestId: "req-co02", costUsd: 0.0003, baselineCostUsd: 0.0042 }, 90_000),
    ]);
    await signIn(page);
    await page.goto("/cost");
    await expect(page.getByTestId("cost-totals")).toBeVisible();
    await expectNoSeriousViolations(page, `cost ${theme}`);
  });

  test(`US9-1 evals with a failing run and an unreadable file, ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await useReports({
      "evals-2026-10-30.json": FAILING,
      "evals-2026-10-29.json": ERRORED,
      "broken.json": "{",
    });
    await signIn(page);
    await page.goto("/evals");
    await expect(page.locator('[data-component="failing-cases"]')).toBeVisible();
    await expectNoSeriousViolations(page, `evals ${theme}`);
  });
}
