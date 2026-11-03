import { expect, test } from "@playwright/test";
import { DASHBOARD_URL, NO_VISITOR_DASHBOARD_URL } from "./support/fixtures";
import { gateway, signIn } from "./support/gateway";

// Spec 008 research R-03, amendment T-OPS-04: a session is a signed cookie, so any dashboard
// process with the same session secret accepts it. The E2E run has two such processes
// (ports 3100 and 3102, same build and secret); cookies are not port-bound, so the browser
// sends the cookie to both, as a load balancer would spread one user over instances.

test.beforeEach(async () => {
  await gateway.reset();
});

test("T-OPS-04 a session from one dashboard process is accepted by another with the same secret", async ({
  page,
}) => {
  await signIn(page);
  const elsewhere = await page.request.get(`${NO_VISITOR_DASHBOARD_URL}/api/session`);
  expect(elsewhere.status()).toBe(200);
  expect(await elsewhere.json()).toEqual({ role: "operator" });
  await page.goto(`${NO_VISITOR_DASHBOARD_URL}/live`);
  await expect(page.getByRole("heading", { level: 1, name: "Live traffic" })).toBeVisible();
});

test("T-OPS-04 sign-out clears the cookie; a copied cookie is refused by the process that signed it out only", async ({
  page,
  browser,
}) => {
  await signIn(page);
  const cookies = await page.context().cookies();
  await page.getByRole("button", { name: "Operator menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await page.request.get(`${NO_VISITOR_DASHBOARD_URL}/api/session`)).status()).toBe(401);

  // The documented limit of stateless sessions (docs/deploy.md): another process still
  // accepts a copy of the cookie until it expires.
  const replay = await browser.newContext();
  await replay.addCookies(cookies);
  expect((await replay.request.get(`${DASHBOARD_URL}/api/session`)).status()).toBe(401);
  expect((await replay.request.get(`${NO_VISITOR_DASHBOARD_URL}/api/session`)).status()).toBe(200);
  await replay.close();
});
