import { expect, test } from "@playwright/test";
import { gateway, signIn } from "./support/gateway";

// Spec 008 US9-2, US9-5, US9-6 (tasks.md T016): the console shell.

test.beforeEach(async () => {
  await gateway.reset();
});

test("US9-2 the skip link is the first focusable element and moves focus to the content", async ({
  page,
}) => {
  await signIn(page);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#content")).toBeFocused();
});

test("US9-2 the screens are reachable by keyboard and the current one is marked", async ({
  page,
}) => {
  await signIn(page);
  const nav = page.getByRole("navigation", { name: "Screens" });
  await expect(nav.getByRole("link", { name: "Live traffic" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const simulator = nav.getByRole("link", { name: "Simulator" });
  await simulator.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/simulator$/);
  await expect(page.getByRole("heading", { level: 1, name: "Simulator" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
});

test("US9-5 dark by default; light persists across reloads with no frame of the other theme", async ({
  page,
}) => {
  // Records the theme class as the document is parsed, before any React code runs.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      (window as unknown as { firstPaintClass: string }).firstPaintClass =
        document.documentElement.className;
    });
  });
  await signIn(page);
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);

  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveClass(/\blight\b/);

  await page.reload();
  const first = await page.evaluate(
    () => (window as unknown as { firstPaintClass: string }).firstPaintClass,
  );
  expect(first).toMatch(/\blight\b/);
  expect(first).not.toMatch(/\bdark\b/);
  await expect(page.getByRole("button", { name: "Switch to dark theme" })).toBeVisible();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("US9-6 the navigation is a menu, the sheet keeps and returns focus, and nothing scrolls sideways", async ({
    page,
  }) => {
    await signIn(page);
    await expect(page.getByRole("complementary", { name: "Main" })).toBeHidden();
    const open = page.getByRole("button", { name: "Open navigation" });
    await open.click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    // Focus stays inside the sheet while it is open.
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(open).toBeFocused();

    await open.click();
    await page.getByRole("dialog").getByRole("link", { name: "Audit log" }).click();
    await expect(page).toHaveURL(/\/audit$/);
    await expect(page.getByRole("dialog")).toBeHidden();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
