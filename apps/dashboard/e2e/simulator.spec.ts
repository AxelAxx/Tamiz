import { expect, type Page, test } from "@playwright/test";
import { gateway, signIn } from "./support/gateway";

// Spec 008 US3-1 … US3-7 (tasks.md T027). The E2E gateway's scripted detector finds
// synthetic markers (`12345678Z` DNI, `Ana García` PERSON, `ana.garcia@example.com` EMAIL);
// its default policy is the shipped one. No text here is real data.

const DNI_TEXT = "Resume el expediente de 12345678Z para el comité.";
const NAME_TEXT = "Resume el informe de Ana García (ana.garcia@example.com) para el comité.";

async function open(page: Page) {
  await signIn(page);
  await page.goto("/simulator");
  await expect(page.getByRole("heading", { level: 1, name: "Simulator" })).toBeVisible();
}

async function simulate(page: Page, text: string, model?: string) {
  await page.getByLabel("User message", { exact: true }).fill(text);
  if (model !== undefined) await page.getByLabel("Requested model").fill(model);
  await page.getByRole("button", { name: "Simulate" }).click();
}

const flow = (page: Page) => page.locator('[data-component="decision-flow"]');
const verdict = (page: Page) => page.locator('[data-component="verdict"]');

test.beforeEach(async () => {
  await gateway.reset();
});

test("US3-1 a DNI is highlighted, critical, local only, with a local-only chain", async ({
  page,
}) => {
  await open(page);
  await simulate(page, DNI_TEXT);
  await expect(verdict(page)).toHaveText("Routed local");
  const mark = page.locator('[data-component="entity-highlight"]');
  await expect(mark).toHaveCount(1);
  await expect(mark).toHaveAttribute("data-kind", "DNI");
  await expect(mark).toContainText("12345678Z");
  await expect(flow(page).locator('[data-component="sensitivity-indicator"]')).toHaveAttribute(
    "data-level",
    "critical",
  );
  await expect(flow(page).locator('[data-component="privacy-action-badge"]')).toHaveText(
    "local only",
  );
  const chain = page.getByRole("list", { name: "Fallback chain, in order" });
  const residencies = chain.locator('[data-component="residency-badge"]');
  await expect(residencies.first()).toBeVisible();
  for (const badge of await residencies.all()) await expect(badge).toHaveText("Local");
  await expect(flow(page).locator("..")).toContainText("Policy default · version");
  await expect(flow(page).locator("..")).toContainText("No model was called");
});

test("US3-2 a name and an email are anonymized; the provider panel shows the placeholders", async ({
  page,
}) => {
  await open(page);
  await simulate(page, NAME_TEXT);
  await expect(verdict(page)).toHaveText("Anonymized, then routed");
  await expect(page.locator('[data-component="entity-highlight"]')).toHaveCount(2);
  const provider = page.getByRole("region", { name: "Provider receives" });
  await expect(provider).toBeVisible();
  await expect(provider).toContainText("<PERSON_1>");
  await expect(provider).toContainText("<EMAIL_1>");
  await expect(provider).not.toContainText("Ana García");
  await expect(provider).toContainText("Anonymization notice");
});

test("US3-3 a block says why in words, with an empty chain", async ({ page }) => {
  await open(page);
  // `tamiz-frontier` routes only to US targets; high data may go to Local or EU only.
  await simulate(page, NAME_TEXT, "tamiz-frontier");
  await expect(verdict(page)).toHaveText("Blocked");
  const route = page.locator('[data-component="decision-step"]').nth(4);
  await expect(route).toHaveAttribute("data-state", "deciding");
  await expect(route).toContainText("Blocked here: no allowed target.");
  await expect(route).toContainText("Chain empty");
});

test("US3-3 a detector outage with onDetectorError block fails closed at inspection", async ({
  page,
}) => {
  await gateway.editPolicy((policy) => ({
    ...policy,
    privacy: { ...policy.privacy, onDetectorError: "block" },
  }));
  await gateway.detector(true);
  await open(page);
  await simulate(page, DNI_TEXT);
  await expect(verdict(page)).toHaveText("Blocked");
  const steps = page.locator('[data-component="decision-step"]');
  await expect(steps.nth(0)).toHaveAttribute("data-state", "deciding");
  await expect(steps.nth(0)).toContainText("inspection failed, gateway fails closed");
  await expect(steps.nth(4)).toHaveAttribute("data-state", "skipped");
  await expect(page.getByText("Inspection failed: no highlights available")).toBeVisible();
});

test("US3-4 empty text, blank model and an oversized text are refused inline; nothing is sent", async ({
  page,
}) => {
  await open(page);
  await gateway.reset();
  await page.getByLabel("Requested model").fill("");
  await page.getByRole("button", { name: "Simulate" }).click();
  await expect(page.getByText("Enter a message to simulate.")).toBeVisible();
  await expect(page.getByText("Enter a model name, for example tamiz-auto.")).toBeVisible();
  await expect(page.getByLabel("User message", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );

  await page.getByLabel("Requested model").fill("tamiz-auto");
  await page.getByLabel("User message", { exact: true }).fill("x".repeat(1_100_000));
  await page.getByRole("button", { name: "Simulate" }).click();
  await expect(page.getByText(/Too long: the gateway reads at most 1,048,576 bytes/)).toBeVisible();

  const simulations = (await gateway.requests()).filter((r) => r.path === "/v1/simulate");
  expect(simulations).toEqual([]);
});

test("US3-5 several messages: each entity is marked in its own message, accents and emoji included", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Add system message" }).click();
  await page.getByLabel("System message").fill("Atiende a Ana García 👋🏽 con cuidado.");
  await page.getByRole("button", { name: "Add message" }).click();
  await page.getByLabel("User message 2").fill("Coméntalo 🙂 en Valladolid.");
  await simulate(page, "Mi DNI es 12345678Z, ¿vale?");
  await expect(verdict(page)).toBeVisible();

  const blocks = page.locator('[data-component="highlighted-text"]');
  await expect(blocks).toHaveCount(3);
  await expect(blocks.nth(0).locator("mark")).toHaveAttribute("data-kind", "PERSON");
  await expect(blocks.nth(0).locator("mark")).toContainText("Ana García");
  await expect(blocks.nth(1).locator("mark")).toHaveAttribute("data-kind", "DNI");
  await expect(blocks.nth(1).locator("mark")).toContainText("12345678Z");
  await expect(blocks.nth(2).locator("mark")).toHaveAttribute("data-kind", "LOCATION");
  await expect(blocks.nth(2).locator("mark")).toContainText("Valladolid");
  // The text around the marks is unchanged.
  await expect(blocks.nth(0)).toContainText("👋🏽 con cuidado.");
  await expect(blocks.nth(2)).toContainText("Coméntalo 🙂 en");
});

test("US3-6 the text is gone after a reload and never reaches the URL or storage", async ({
  page,
}) => {
  await open(page);
  await simulate(page, DNI_TEXT);
  await expect(verdict(page)).toBeVisible();
  expect(page.url()).not.toContain("12345678Z");
  const stored = await page.evaluate(
    () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
  );
  expect(stored).not.toContain("12345678Z");

  await page.reload();
  await expect(page.getByLabel("User message", { exact: true })).toHaveValue("");
  expect(await page.content()).not.toContain("12345678Z");
});

test("US3-7 the steps read in order and a block marks its deciding step", async ({ page }) => {
  await open(page);
  await simulate(page, DNI_TEXT);
  await expect(verdict(page)).toBeVisible();
  await expect(page.locator('[data-component="decision-step"] h3')).toHaveText([
    "1 · Inspection",
    "2 · Classification",
    "3 · Rule",
    "4 · Privacy action",
    "5 · Route",
  ]);
  for (const step of await page.locator('[data-component="decision-step"]').all()) {
    await expect(step).toHaveAttribute("data-state", "resolved");
  }
});

test.describe("README frame", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("at 1280×800 the text, its highlight and all five steps fit without scrolling", async ({
    page,
  }) => {
    await open(page);
    await simulate(page, DNI_TEXT);
    await expect(verdict(page)).toBeVisible();
    for (const locator of [
      page.locator('[data-component="entity-highlight"]'),
      page.locator('[data-component="decision-step"]').last(),
    ]) {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(800);
    }
  });
});

test("Ctrl+Enter submits from the text", async ({ page }) => {
  await open(page);
  await page.getByLabel("User message", { exact: true }).fill(DNI_TEXT);
  await page.getByLabel("User message", { exact: true }).press("Control+Enter");
  await expect(verdict(page)).toHaveText("Routed local");
});
