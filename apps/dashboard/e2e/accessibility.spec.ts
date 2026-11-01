import { expect, test } from "@playwright/test";
import { expectNoSeriousViolations } from "./support/axe";
import { gateway, signIn } from "./support/gateway";

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
}
