import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Fails on any `serious` or `critical` axe violation (spec 008 US9-1, tasks.md T017), WCAG
 * 2.x A and AA rules. Lists rule, impact and target selectors, never page text.
 */
export async function expectNoSeriousViolations(page: Page, context: string): Promise<void> {
  // Contrast is measured on the final frame: wait for every finite animation (fades) to end.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) =>
          a.playState !== "running" ||
          a.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
      ),
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(serious, context).toEqual([]);
}
