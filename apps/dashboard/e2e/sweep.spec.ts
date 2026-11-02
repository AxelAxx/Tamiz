import { expect, type Page, test } from "@playwright/test";
import { FAILING, useReports } from "./fixtures/evals";
import { expectNoSeriousViolations } from "./support/axe";
import { auditEntry, gateway, signIn } from "./support/gateway";

// Spec 008 US9-1, US9-2, US9-6 (tasks.md T052): every screen with data, empty and in error,
// in both themes, at 1280×800 and 390×844:
// - no serious or critical axe violation;
// - at phone width, no horizontal page scroll;
// - on desktop, a keyboard walk through the screen's controls that never loses focus.
// The error state is a BFF answer of "gateway unreachable", served by the browser route.

interface Screen {
  readonly path: string;
  /** The BFF endpoint whose failure is the screen's error state. */
  readonly api: string;
  /** Visible once the screen shows its data, or its empty state. */
  readonly ready: (page: Page) => ReturnType<Page["locator"]>;
  readonly seed?: () => Promise<unknown>;
  /** Puts the screen in its empty state; `undefined` when it has none (it always has data). */
  readonly empty?: () => Promise<unknown>;
  /** What the screen shows when its endpoint fails. */
  readonly error?: (page: Page) => ReturnType<Page["locator"]>;
  /** Run after loading, for screens whose data needs an action (the simulator). */
  readonly act?: (page: Page) => Promise<void>;
}

const regionError = (page: Page) => page.locator('[data-component="region-error"]');
/** A traffic row (table on desktop, card on phone) or the empty state, whichever shows. */
const trafficReady = (page: Page) =>
  page
    .locator("main [data-request-id]:visible, main [data-component='region-empty']:visible")
    .first();
const audit = () =>
  gateway.appendAudit([
    auditEntry({ requestId: "req-sw01", sensitivity: "critical", entities: { DNI: 1 } }, 30),
    auditEntry({ requestId: "req-sw02", outcome: "blocked", blockReason: "no_target" }, 90),
    auditEntry({ requestId: "req-sw03", costUsd: 0.0012, baselineCostUsd: 0.0081 }, 3_600),
  ]);

const SCREENS: ReadonlyArray<Screen> = [
  {
    path: "/live",
    api: "/api/audit",
    seed: audit,
    empty: async () => {},
    ready: trafficReady,
    error: regionError,
  },
  {
    path: "/simulator",
    api: "/api/simulate",
    ready: (page) => page.getByRole("button", { name: "Simulate" }),
    act: async (page) => {
      await page
        .getByLabel("User message", { exact: true })
        .fill("Resume el expediente de 12345678Z.");
      await page.getByRole("button", { name: "Simulate" }).click();
    },
    error: (page) => page.getByRole("alert").first(),
  },
  {
    path: "/audit",
    api: "/api/audit",
    seed: audit,
    empty: async () => {},
    ready: trafficReady,
    error: regionError,
  },
  {
    path: "/cost",
    api: "/api/cost",
    seed: audit,
    empty: async () => {},
    // The key figures show in every state but loading, on every width.
    ready: (page) => page.locator('[data-component="kpi"]').first(),
    error: regionError,
  },
  {
    path: "/providers",
    api: "/api/providers",
    seed: async () => {
      await audit();
      await gateway.openCircuit("mistral-small", 29_000);
    },
    ready: (page) => page.locator('[data-component="provider-card"]').first(),
    error: regionError,
  },
  {
    path: "/evals",
    api: "/api/evals",
    seed: () => useReports({ "evals.json": FAILING, "broken.json": "{" }),
    empty: () => useReports({}),
    ready: (page) =>
      page.locator('[data-component="run-header"], [data-component="region-empty"]').first(),
    error: regionError,
  },
  {
    path: "/policy",
    api: "/api/policy",
    ready: (page) => page.getByTestId("policy-yaml"),
    error: regionError,
  },
];

const VIEWPORTS = [
  { name: "1280", width: 1280, height: 800 },
  { name: "390", width: 390, height: 844 },
] as const;

async function noHorizontalScroll(page: Page, context: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${context}: horizontal page scroll`).toBeLessThanOrEqual(0);
}

async function check(page: Page, context: string, phone: boolean) {
  await expectNoSeriousViolations(page, context);
  if (phone) await noHorizontalScroll(page, context);
}

/**
 * Tabs from the top of the page through up to 30 stops: each focused element is visible.
 * Focus leaving the page (back to `body`) ends the walk, but not before the first stop.
 */
async function keyboardWalk(page: Page, context: string) {
  // Focusing the body once moves the sequential-navigation start to the top of the page.
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
    document.body.removeAttribute("tabindex");
  });
  for (let stop = 0; stop < 30; stop += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      if (element === null || element === document.body) return { ok: false, what: "body" };
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        ok: box.width > 0 && box.height > 0 && style.visibility !== "hidden",
        what: `${element.tagName.toLowerCase()} ${element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 30) ?? ""}`,
      };
    });
    if (focused.what === "body" && stop > 0) return;
    expect(focused.ok, `${context}: Tab stop ${stop + 1} (${focused.what})`).toBe(true);
  }
}

test.beforeEach(async () => {
  await gateway.reset();
  await useReports({});
});

for (const screen of SCREENS) {
  for (const theme of ["dark", "light"] as const) {
    for (const viewport of VIEWPORTS) {
      const phone = viewport.width < 768;
      test(`US9-1/2/6 ${screen.path} ${theme} ${viewport.name}`, async ({ page }) => {
        const context = `${screen.path} ${theme} ${viewport.name}`;
        await page.setViewportSize(viewport);
        await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
        await signIn(page);

        // Empty (or the screen's first state).
        await page.goto(screen.path);
        await expect(screen.ready(page)).toBeVisible();
        if (screen.empty !== undefined) {
          await screen.empty();
          await page.reload();
          await expect(screen.ready(page)).toBeVisible();
          await check(page, `${context} empty`, phone);
        }

        // With data.
        await screen.seed?.();
        await page.reload();
        await expect(screen.ready(page)).toBeVisible();
        await screen.act?.(page);
        await check(page, `${context} data`, phone);
        if (!phone && theme === "dark") await keyboardWalk(page, context);

        // In error.
        if (screen.error !== undefined) {
          const error = screen.error;
          await page.route(`**${screen.api}**`, (route) =>
            route.fulfill({
              status: 504,
              contentType: "application/json",
              body: JSON.stringify({
                error: { type: "gateway_unreachable", message: "Gateway unreachable" },
              }),
            }),
          );
          await page.reload();
          if (screen.act !== undefined) {
            await expect(screen.ready(page)).toBeVisible();
            await screen.act(page);
          }
          await expect(error(page)).toBeVisible({ timeout: 15_000 });
          await check(page, `${context} error`, phone);
        }
      });
    }
  }
}
