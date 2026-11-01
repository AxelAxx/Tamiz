import { expect, type Page, test } from "@playwright/test";
import type { AuditEntryDto } from "@tamiz/contracts";
import { auditEntry, gateway, signIn } from "./support/gateway";

// Spec 008 US4-1 … US4-6 (tasks.md T032). A known set of synthetic entries, more than one
// page (the screen asks for 50 at a time).

const EU = {
  id: "mistral-small",
  provider: "mistral" as const,
  model: "mistral-small-latest",
  residency: "eu" as const,
};

/** 60 entries, one a minute: every third on mistral-small, every fifth with a DNI. */
function knownSet(): AuditEntryDto[] {
  return Array.from({ length: 60 }, (_, i) =>
    auditEntry(
      {
        requestId: `req-${String(i).padStart(4, "0")}`,
        ...(i % 3 === 0 && { target: EU }),
        ...(i % 5 === 0 && {
          sensitivity: "critical" as const,
          entities: { DNI: 1 },
          privacyAction: "restrict_to_local" as const,
        }),
      },
      60 * (i + 1),
    ),
  );
}

const rows = (page: Page) => page.locator("table[data-slot=table] tbody tr");
const requestIds = async (page: Page) =>
  rows(page).evaluateAll((trs) => trs.map((tr) => tr.getAttribute("data-request-id")));

async function openAudit(page: Page, query = "") {
  await signIn(page);
  await page.goto(`/audit${query}`);
  await expect(page.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible();
}

test.beforeEach(async () => {
  await gateway.reset();
  await gateway.appendAudit(knownSet());
});

test("US4-1 filtering by route lists only that route's entries", async ({ page }) => {
  await openAudit(page);
  await expect(rows(page)).toHaveCount(50);
  await page.getByLabel("Route", { exact: true }).selectOption("mistral-small");
  await expect(page).toHaveURL(/\/audit\?route=mistral-small$/);
  await expect(rows(page)).toHaveCount(20);
  for (const row of await rows(page).all()) {
    await expect(row.locator('[data-component="target-label"]')).toHaveText("mistral-small");
  }
  await expect(page.getByRole("button", { name: "Remove filter Route" })).toBeVisible();
});

test("US4-2 Load older appends the next page with no repeats, then says there are no more", async ({
  page,
}) => {
  await openAudit(page);
  await expect(rows(page)).toHaveCount(50);
  await expect(page.getByText("50 entries loaded")).toBeVisible();
  await page.getByRole("button", { name: "Load older" }).click();
  await expect(rows(page)).toHaveCount(60);
  const ids = await requestIds(page);
  expect(new Set(ids).size).toBe(60);
  expect(ids[0]).toBe("req-0000");
  expect(ids.at(-1)).toBe("req-0059");
  await expect(page.getByRole("button", { name: "No older entries" })).toBeDisabled();
});

test("US4-3 an address with filters applies them; it holds only filter values", async ({
  page,
}) => {
  await openAudit(page, "?route=mistral-small&entity=DNI");
  await expect(page.getByLabel("Route", { exact: true })).toHaveValue("mistral-small");
  await expect(page.getByLabel("Entity kind", { exact: true })).toHaveValue("DNI");
  // i % 3 === 0 and i % 5 === 0: 0, 15, 30, 45.
  await expect(rows(page)).toHaveCount(4);
  expect(new URL(page.url()).searchParams.toString()).toBe("route=mistral-small&entity=DNI");
});

test("an invalid value in the address is dropped with a notice", async ({ page }) => {
  await openAudit(page, "?sensitivity=extreme&route=mistral-small");
  await expect(
    page.getByText("Ignored an invalid filter in the address: sensitivity."),
  ).toBeVisible();
  await expect(rows(page)).toHaveCount(20);
});

test("US4-4 no match names the active filters and offers to clear them", async ({ page }) => {
  await openAudit(page, "?route=mistral-small&outcome=blocked");
  const empty = page.locator('[data-component="region-empty"]');
  await expect(empty).toContainText("No entries match: route = mistral-small, outcome = blocked.");
  await empty.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/audit$/);
  await expect(rows(page)).toHaveCount(50);
});

test("US4-5 a start after the end is refused next to the dates and nothing changes", async ({
  page,
}) => {
  await openAudit(page);
  await page
    .getByRole("button", { name: /Date range/ })
    .first()
    .click();
  const popover = page.getByRole("dialog");
  await popover.getByLabel("From").fill("2026-11-01T12:00");
  await popover.getByLabel("To").fill("2026-10-31T12:00");
  await popover.getByRole("button", { name: "Apply range" }).click();
  await expect(popover.getByText('"To" must be after "From".')).toBeVisible();
  await expect(popover.getByLabel("From")).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/audit$/);
});

test("US4-6 the table has headers, rows are reachable by keyboard and open the detail", async ({
  page,
}) => {
  await openAudit(page);
  await expect(page.locator("table[data-slot=table] thead th[scope=col]")).toHaveCount(6);
  const first = rows(page)
    .first()
    .getByRole("button", { name: /open details for request req-0000/ });
  await first.focus();
  await page.keyboard.press("Enter");
  const detail = page.getByRole("dialog", { name: /Request req-0000/ });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Tamiz never stores what was said.");
});
