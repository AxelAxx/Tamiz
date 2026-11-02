import { expect, type Page, test } from "@playwright/test";
import type { ActivePolicyDto } from "@tamiz/contracts";
import { policyToYaml } from "../src/features/policy-editor/editor/policy-yaml";
import { ADMIN_KEY, DASHBOARD_URL, GATEWAY_URL } from "./support/fixtures";
import { gateway, signIn } from "./support/gateway";

// Spec 008 US5-1 … US5-5 and US5-7 (tasks.md T042), against the E2E gateway, whose policy
// store is in memory (`persistent: false`); a reset restores the default policy (v3).

async function activePolicy(): Promise<ActivePolicyDto> {
  const response = await fetch(`${GATEWAY_URL}/v1/admin/policy`, {
    headers: { authorization: `Bearer ${ADMIN_KEY}` },
  });
  return (await response.json()) as ActivePolicyDto;
}

/** Replaces the editor's whole text, as a paste would (no auto-indent). */
async function setYaml(page: Page, text: string) {
  const editor = page.getByTestId("policy-yaml");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
}

async function openEditor(page: Page): Promise<string> {
  const text = policyToYaml((await activePolicy()).policy);
  await signIn(page);
  await page.goto("/policy");
  await expect(page.getByRole("heading", { level: 1, name: "Policy" })).toBeVisible();
  await expect(page.getByTestId("policy-yaml")).toContainText("id: default");
  return text;
}

const saveButton = (page: Page) => page.getByRole("button", { name: /^Save as version/ });
const issues = (page: Page) => page.locator('[data-component="policy-issues"] li');

test.beforeEach(async () => {
  await gateway.reset();
});

test("US5-1 / US5-7 the editor shows the policy, where it came from, and that saves are not persisted", async ({
  page,
}) => {
  await openEditor(page);
  const header = page.locator('[data-component="policy-header"]');
  await expect(header.getByRole("heading", { name: "default" })).toBeVisible();
  await expect(page.getByTestId("policy-version")).toHaveText("version 3");
  await expect(page.getByTestId("policy-source")).toContainText("the policy file at boot");
  await expect(page.locator('[data-component="not-persistent"]')).toContainText(
    "Saves are lost when the gateway restarts",
  );
  await expect(page.getByText("Valid. No issues.")).toBeVisible();
  await expect(page.getByTestId("draft-state")).toHaveText("No changes");
  await expect(saveButton(page)).toBeDisabled();
});

test("US5-2 a shape error is listed with its path within a second and saving is disabled", async ({
  page,
}) => {
  const text = await openEditor(page);
  await setYaml(page, text.replace("onDetectorError: restrict_to_local", "onDetectorError: allow"));
  await expect(issues(page)).toHaveCount(1, { timeout: 1_000 });
  await expect(issues(page).getByTestId("issue-path")).toHaveText("privacy.onDetectorError");
  await expect(page.getByText("Checked in the browser · fix before saving")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Issues (1)" })).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();
  await expect(page.locator(".cm-lintRange-error")).toHaveCount(1);

  // An unknown key is named in the path.
  await setYaml(page, text.replace("maxAttempts: 2", "maxAttempts: 2\n  retries: 3"));
  await expect(issues(page).getByTestId("issue-path")).toHaveText("resilience.retries", {
    timeout: 1_000,
  });
});

test("US5-3 cross-field issues come back from the gateway with their paths and nothing changes", async ({
  page,
}) => {
  const text = await openEditor(page);
  await setYaml(
    page,
    text.replace("route: [ollama-llama]", "route: [ollama-llama, mistral-large]"),
  );
  await expect(page.getByText("Valid. No issues.")).toBeVisible();
  await saveButton(page).click();
  await expect(page.getByText("Refused by the gateway on save")).toBeVisible();
  await expect(issues(page).getByTestId("issue-path").first()).toHaveText(/^rules\.0\.route/);
  await expect(issues(page).first()).toContainText("mistral-large");
  await expect(
    issues(page)
      .first()
      .getByRole("button", { name: /^line \d+$/ }),
  ).toBeVisible();
  expect((await activePolicy()).policy.version).toBe(3);
});

test("US5-4 a valid save becomes version N+1 and the simulator uses it at once", async ({
  page,
}) => {
  const text = await openEditor(page);
  await setYaml(page, text.replace("timeoutMs: 20000", "timeoutMs: 25000"));
  await expect(page.getByTestId("draft-state")).toHaveText("Unsaved changes");
  await expect(saveButton(page)).toHaveText("Save as version 4");
  await saveButton(page).click();
  await expect(page.getByText("Saved as version 4")).toBeVisible();
  await expect(page.getByTestId("policy-version")).toHaveText("version 4");
  await expect(page.getByTestId("draft-state")).toHaveText("No changes");
  await expect(page.getByTestId("policy-source")).toContainText("Saved version · saved");
  const saved = await activePolicy();
  expect(saved.policy.version).toBe(4);
  expect(saved.policy.rules.find((r) => r.id === "cheap-short-tasks")?.timeoutMs).toBe(25_000);

  await page.getByRole("link", { name: "Try in simulator" }).click();
  await page.getByLabel("User message", { exact: true }).fill("Traduce esta frase al inglés.");
  await page.getByRole("button", { name: "Simulate" }).click();
  await expect(page.locator('[data-component="verdict"]')).toBeVisible();
  await expect(page.getByText(/Policy\s+default\s+·\s+version\s+4/)).toBeVisible();
});

test("US5-5 a save based on an older version is refused as a conflict and offers a reload", async ({
  page,
}) => {
  const text = await openEditor(page);
  await setYaml(page, text.replace("timeoutMs: 20000", "timeoutMs: 21000"));
  // Another operator saves first.
  await gateway.editPolicy((policy) => ({ ...policy, defaultTimeoutMs: 31_000 }));
  await saveButton(page).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "The policy changed" })).toBeVisible();
  expect((await activePolicy()).policy.defaultTimeoutMs).toBe(31_000);

  await dialog.getByRole("button", { name: "Reload (lose my changes)" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("policy-version")).toHaveText("version 4");
  await expect(page.getByTestId("policy-yaml")).toContainText("defaultTimeoutMs: 31000");
  await expect(page.getByTestId("draft-state")).toHaveText("No changes");
});

test("leaving with unsaved changes asks first; discarding restores the loaded text", async ({
  page,
}) => {
  const text = await openEditor(page);
  await setYaml(page, text.replace("timeoutMs: 20000", "timeoutMs: 22000"));
  await expect(page.getByTestId("draft-state")).toHaveText("Unsaved changes");

  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("link", { name: "Cost" }).first().click();
  await expect(page).toHaveURL(/\/policy$/);

  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByTestId("draft-state")).toHaveText("No changes");
  await expect(page.getByTestId("policy-yaml")).toContainText("timeoutMs: 20000");
});

test("a cross-origin save is refused before the gateway is called (US1-5)", async ({ page }) => {
  await signIn(page);
  const response = await page.request.put(`${DASHBOARD_URL}/api/policy`, {
    headers: { origin: "https://evil.example", "content-type": "application/json" },
    data: { baseVersion: 3, policy: (await activePolicy()).policy },
  });
  expect(response.status()).toBe(403);
  expect((await activePolicy()).policy.version).toBe(3);
});
