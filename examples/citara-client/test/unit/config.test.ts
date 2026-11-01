import { describe, expect, it } from "vitest";
import { CONFIG_VARIABLES, loadConfig } from "../../src/config.js";

const BASE = {
  TAMIZ_BASE_URL: "http://127.0.0.1:3210/v1",
  TAMIZ_API_KEY: "tmz_unit-test-key",
  TAMIZ_PROMPT: "hello",
};

describe("loadConfig (spec 010 data-model section 1)", () => {
  it("applies the defaults", () => {
    const result = loadConfig(BASE);
    expect(result).toEqual({
      ok: true,
      config: {
        baseUrl: BASE.TAMIZ_BASE_URL,
        apiKey: BASE.TAMIZ_API_KEY,
        model: "tamiz-auto",
        prompt: "hello",
        stream: false,
        timeoutMs: 70_000,
        auditWaitMs: 5_000,
      },
    });
  });

  it("edge: the default client timeout is above the default policy's 60 s deadline", () => {
    const result = loadConfig(BASE);
    expect(result.ok && result.config.timeoutMs).toBeGreaterThan(60_000);
  });

  it("reads every optional variable", () => {
    const result = loadConfig({
      ...BASE,
      TAMIZ_MODEL: "tamiz-local",
      TAMIZ_STREAM: "true",
      TAMIZ_REQUEST_ID: "citara-req_1",
      TAMIZ_TIMEOUT_MS: "1000",
      TAMIZ_ADMIN_KEY: "tmz_unit-admin",
      TAMIZ_AUDIT_WAIT_MS: "0",
    });
    expect(result.ok && result.config).toMatchObject({
      model: "tamiz-local",
      stream: true,
      requestId: "citara-req_1",
      timeoutMs: 1000,
      adminKey: "tmz_unit-admin",
      auditWaitMs: 0,
    });
  });

  it("takes the prompt from the first CLI argument, skipping a `--` separator", () => {
    expect(loadConfig(BASE, ["from argv"]).ok && loadConfig(BASE, ["from argv"])).toMatchObject({
      config: { prompt: "from argv" },
    });
    const { TAMIZ_PROMPT: _, ...noPrompt } = BASE;
    expect(loadConfig(noPrompt, ["--", "after separator"])).toMatchObject({
      ok: true,
      config: { prompt: "after separator" },
    });
  });

  it("names invalid variables and never their values (exit 2 in main)", () => {
    const result = loadConfig({
      TAMIZ_BASE_URL: "not a url secret-value",
      TAMIZ_API_KEY: "tmz_secret",
      TAMIZ_PROMPT: "x",
      TAMIZ_TIMEOUT_MS: "999",
      TAMIZ_STREAM: "yes",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("TAMIZ_BASE_URL");
    expect(result.message).toContain("TAMIZ_TIMEOUT_MS");
    expect(result.message).toContain("TAMIZ_STREAM");
    expect(result.message).not.toContain("secret");
  });

  it("requires the base URL, key and prompt; empty strings count as unset", () => {
    const result = loadConfig({ TAMIZ_BASE_URL: "", TAMIZ_API_KEY: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    for (const name of ["TAMIZ_BASE_URL", "TAMIZ_API_KEY", "TAMIZ_PROMPT"]) {
      expect(result.message).toContain(name);
    }
  });

  it("edge: rejects a correlation id outside [A-Za-z0-9_-]{1,128}", () => {
    expect(loadConfig({ ...BASE, TAMIZ_REQUEST_ID: "has space" }).ok).toBe(false);
    expect(loadConfig({ ...BASE, TAMIZ_REQUEST_ID: "a".repeat(129) }).ok).toBe(false);
  });

  it("lists the nine variables of the data model", () => {
    expect(CONFIG_VARIABLES).toHaveLength(9);
  });
});
