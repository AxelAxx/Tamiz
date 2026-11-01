import { ErrorTypeSchema } from "@tamiz/contracts";
import { describe, expect, it } from "vitest";
import { classifyError, ERROR_CLASSES, retryAfterMs } from "../../src/classify.js";

describe("classifyError (spec 010 data-model section 2)", () => {
  it.each([
    ["invalid_request", 400, "fix_request"],
    ["unauthorized", 401, "fix_request"],
    ["forbidden", 403, "fix_request"],
    ["policy_blocked", 451, "never"],
    ["provider_error", 502, "never"],
    ["provider_timeout", 504, "never"],
    ["internal", 500, "never"],
    ["provider_unavailable", 503, "later"],
    ["privacy_unavailable", 503, "later"],
    ["rate_limited", 429, "later"],
  ])("%s (%i) → %s", (type, status, errorClass) => {
    expect(classifyError(status, type)).toEqual({ errorType: type, errorClass });
  });

  it("classifies every contract error type", () => {
    expect(Object.keys(ERROR_CLASSES).sort()).toEqual([...ErrorTypeSchema.options].sort());
  });

  it("falls back to the status when the body is not an error envelope", () => {
    expect(classifyError(503, undefined)).toEqual({ errorType: "http_503", errorClass: "later" });
    expect(classifyError(429, 42)).toEqual({ errorType: "http_429", errorClass: "later" });
    expect(classifyError(502, "gateway")).toEqual({ errorType: "http_502", errorClass: "never" });
    expect(classifyError(404, null)).toEqual({ errorType: "http_404", errorClass: "fix_request" });
  });
});

describe("retryAfterMs", () => {
  it("reads seconds, defaults to 1 s and caps at 30 s", () => {
    expect(retryAfterMs("2")).toBe(2_000);
    expect(retryAfterMs(null)).toBe(1_000);
    expect(retryAfterMs(undefined)).toBe(1_000);
    expect(retryAfterMs("soon")).toBe(1_000);
    expect(retryAfterMs("-3")).toBe(1_000);
    expect(retryAfterMs("120")).toBe(30_000);
  });
});
