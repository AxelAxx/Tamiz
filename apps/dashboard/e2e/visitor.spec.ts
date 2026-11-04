import { expect, type Page, test } from "@playwright/test";
import {
  DASHBOARD_URL,
  DATA_ENDPOINTS,
  NO_VISITOR_DASHBOARD_URL,
  PASSPHRASE,
} from "./support/fixtures";
import { gateway } from "./support/gateway";

// Spec 008 US10 (addendum, backlog T-OPS-03): the read-only visitor session of the public
// demo. Each test that counts uses its own X-Forwarded-For, so the per-address limits of
// one test never reach another.

const SAME_ORIGIN = { origin: DASHBOARD_URL };
const SCREENS = [
  { href: "/live", label: "Live traffic" },
  { href: "/simulator", label: "Simulator" },
  { href: "/audit", label: "Audit log" },
  { href: "/cost", label: "Cost" },
  { href: "/providers", label: "Providers" },
  { href: "/evals", label: "Evals" },
  { href: "/policy", label: "Policy" },
] as const;
const SIMULATION = DATA_ENDPOINTS.find((e) => e.path === "/api/simulate");
const SIMULATION_BODY = SIMULATION !== undefined && "body" in SIMULATION ? SIMULATION.body : {};

async function enterAsVisitor(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Explore as a visitor" }).click();
  await expect(page).toHaveURL(/\/live$/);
}

test.beforeEach(async () => {
  await gateway.reset();
});

test("US10-1 with visitor access off the sign-in page offers only the passphrase and no visitor session is created", async ({
  page,
}) => {
  await page.goto(`${NO_VISITOR_DASHBOARD_URL}/sign-in`);
  await expect(page.getByLabel("Passphrase", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Explore as a visitor" })).toHaveCount(0);

  const response = await page.request.post(`${NO_VISITOR_DASHBOARD_URL}/api/session/visitor`, {
    headers: { origin: NO_VISITOR_DASHBOARD_URL },
  });
  expect(response.status()).toBe(404);
  expect((await response.json()).error.type).toBe("not_found");
  expect(response.headers()["set-cookie"]).toBeUndefined();
});

test("US10-2 a visitor lands on live traffic, every screen loads and the menu says Visitor", async ({
  page,
}) => {
  await enterAsVisitor(page);
  const [cookie] = (await page.context().cookies()).filter((c) => c.name === "tamiz_session");
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/" });
  expect((cookie?.expires ?? 0) - Date.now() / 1000).toBeLessThanOrEqual(8 * 3600);

  await page.getByRole("button", { name: "Operator menu" }).click();
  await expect(page.getByTestId("session-role")).toHaveText("Visitor");
  await page.keyboard.press("Escape");

  for (const screen of SCREENS) {
    await page.goto(screen.href);
    await expect(page, screen.href).toHaveURL(new RegExp(`${screen.href}$`));
    await expect(page.getByRole("heading", { level: 1, name: screen.label })).toBeVisible();
  }
  for (const endpoint of DATA_ENDPOINTS.filter((e) => e.method === "GET")) {
    const response = await page.request.get(endpoint.path);
    expect(response.status(), endpoint.path).toBe(200);
  }
  expect(await (await page.request.get("/api/session")).json()).toEqual({ role: "visitor" });
});

test("an expired visitor session can be renewed as a visitor in place (code audit 2026-11-03, M16)", async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": "198.51.100.106" });
  await enterAsVisitor(page);

  await page.context().clearCookies();
  const dialog = page.getByRole("dialog", { name: "Your session ended" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Explore as a visitor" }).click();

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/live$/);
  expect((await page.request.get("/api/audit")).status()).toBe(200);
});

test("US10-3 a visitor cannot save the policy: 403, nothing reaches the gateway, the editor is read-only", async ({
  page,
}) => {
  await enterAsVisitor(page);
  await page.goto("/policy");
  await expect(page.getByTestId("policy-version")).toBeVisible();
  await expect(page.getByText("Saving needs the operator passphrase")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Save as version/ })).toHaveCount(0);
  await expect(page.getByTestId("policy-yaml")).toHaveAttribute("aria-readonly", "true");

  await gateway.reset();
  const active = await (await page.request.get("/api/policy")).json();
  const put = await page.request.put("/api/policy", {
    headers: SAME_ORIGIN,
    data: { baseVersion: active.policy.version, policy: active.policy },
  });
  expect(put.status()).toBe(403);
  expect((await put.json()).error.type).toBe("forbidden_role");
  const received = await gateway.requests();
  expect(received.filter((r) => r.method === "PUT")).toEqual([]);
});

test("US10-4 a visitor gets 10 simulations a minute; an operator has no such limit", async ({
  browser,
}) => {
  const visitor = await browser.newContext({ baseURL: DASHBOARD_URL });
  const headers = { ...SAME_ORIGIN, "x-forwarded-for": "198.51.100.104" };
  expect((await visitor.request.post("/api/session/visitor", { headers })).status()).toBe(200);
  for (let n = 1; n <= 10; n++) {
    const response = await visitor.request.post("/api/simulate", {
      headers,
      data: SIMULATION_BODY,
    });
    expect(response.status(), `simulation ${n}`).toBe(200);
  }
  await gateway.reset();
  const refused = await visitor.request.post("/api/simulate", { headers, data: SIMULATION_BODY });
  expect(refused.status()).toBe(429);
  expect(Number(refused.headers()["retry-after"])).toBeGreaterThan(0);
  expect((await refused.json()).error.type).toBe("rate_limited");
  expect(await gateway.requests()).toEqual([]);
  await visitor.close();

  const operator = await browser.newContext({ baseURL: DASHBOARD_URL });
  const signIn = await operator.request.post("/api/session", {
    headers,
    data: { passphrase: PASSPHRASE },
  });
  expect(signIn.status()).toBe(200);
  for (let n = 1; n <= 11; n++) {
    const response = await operator.request.post("/api/simulate", {
      headers,
      data: SIMULATION_BODY,
    });
    expect(response.status(), `operator simulation ${n}`).toBe(200);
  }
  await operator.close();
});

test("US10-5 more than 10 visitor sessions a minute from one address are refused", async ({
  request,
}) => {
  const headers = { ...SAME_ORIGIN, "x-forwarded-for": "198.51.100.105" };
  for (let n = 1; n <= 10; n++) {
    const response = await request.post("/api/session/visitor", { headers });
    expect(response.status(), `session ${n}`).toBe(200);
  }
  const refused = await request.post("/api/session/visitor", { headers });
  expect(refused.status()).toBe(429);
  expect(Number(refused.headers()["retry-after"])).toBeGreaterThan(0);
  expect((await refused.json()).error.type).toBe("rate_limited");
  // Another address is not affected.
  const other = await request.post("/api/session/visitor", {
    headers: { ...SAME_ORIGIN, "x-forwarded-for": "198.51.100.205" },
  });
  expect(other.status()).toBe(200);
});
