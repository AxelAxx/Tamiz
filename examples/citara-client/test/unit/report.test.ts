import { describe, expect, it } from "vitest";
import { guardedWriter, renderReport } from "../../src/report.js";

describe("renderReport (spec 010 data-model section 3)", () => {
  it("prints set fields in the fixed order, then a blank line and the answer", () => {
    const text = renderReport({
      attempts: "1",
      route: "ollama-llama",
      status: "200",
      request_id: "r-1",
      answer: "hello",
    });
    expect(text).toBe("status: 200\nrequest_id: r-1\nroute: ollama-llama\nattempts: 1\n\nhello\n");
  });

  it("omits the answer block when there is no answer", () => {
    expect(renderReport({ status: "451", error_type: "policy_blocked" })).toBe(
      "status: 451\nerror_type: policy_blocked\n",
    );
  });
});

describe("guardedWriter", () => {
  it("writes reports without secrets", () => {
    const out: string[] = [];
    guardedWriter((t) => out.push(t), ["tmz_key-1", ""])({ status: "200" });
    expect(out).toEqual(["status: 200\n"]);
  });

  it("refuses to print a key, in a field or in the answer", () => {
    const write = guardedWriter(() => {}, ["tmz_key-1", "tmz_admin-2"]);
    expect(() => write({ status: "200", answer: "echo tmz_admin-2" })).toThrow(/key/);
    expect(() => write({ audit_error: "tmz_key-1" })).toThrow(/key/);
  });
});
