import { describe, expect, it } from "vitest";
import { filtersFromParams, paramsFromFilters, rangeError } from "@/features/audit-log/filters";

// Spec 008 US4-3, US4-5, research R-07 (tasks.md T031).

describe("filters in the URL", () => {
  it("round-trips every filter through search params", () => {
    const filters = {
      from: "2026-11-01T00:00:00.000Z",
      to: "2026-11-01T12:00:00.000Z",
      route: "mistral-small",
      rule: "default",
      sensitivity: "critical",
      action: "restrict_to_local",
      entity: "DNI",
      outcome: "answered",
    } as const;
    const params = paramsFromFilters(filters);
    expect(filtersFromParams(params)).toEqual({ filters, dropped: [] });
    expect(params.toString()).toBe(
      "from=2026-11-01T00%3A00%3A00.000Z&to=2026-11-01T12%3A00%3A00.000Z&route=mistral-small&rule=default&sensitivity=critical&action=restrict_to_local&entity=DNI&outcome=answered",
    );
  });

  it("drops invalid values with a notice and keeps the valid ones", () => {
    const parsed = filtersFromParams(
      new URLSearchParams("route=ollama-llama&sensitivity=extreme&entity=PASSPORT&from=yesterday"),
    );
    expect(parsed.filters).toEqual({ route: "ollama-llama" });
    expect([...parsed.dropped].sort()).toEqual(["entity", "from", "sensitivity"]);
  });

  it("never carries cursor, limit or unknown params", () => {
    const parsed = filtersFromParams(new URLSearchParams("cursor=abc&limit=10&text=hola&rule=x"));
    expect(parsed).toEqual({ filters: { rule: "x" }, dropped: [] });
    expect(paramsFromFilters({ rule: "x" }).toString()).toBe("rule=x");
  });

  it("leaves empty values out", () => {
    expect(paramsFromFilters({ route: "", rule: "default" }).toString()).toBe("rule=default");
    expect(filtersFromParams(new URLSearchParams("route=&rule=default")).filters).toEqual({
      rule: "default",
    });
  });
});

describe("rangeError (US4-5)", () => {
  it("refuses a start after or equal to the end", () => {
    expect(rangeError("2026-11-01T12:00:00.000Z", "2026-10-31T12:00:00.000Z")).toBe(
      '"To" must be after "From".',
    );
    expect(rangeError("2026-11-01T12:00:00.000Z", "2026-11-01T12:00:00.000Z")).toBeDefined();
  });

  it("accepts an ordered range or an open one", () => {
    expect(rangeError("2026-10-31T12:00:00.000Z", "2026-11-01T12:00:00.000Z")).toBeUndefined();
    expect(rangeError(undefined, "2026-11-01T12:00:00.000Z")).toBeUndefined();
    expect(rangeError("2026-11-01T12:00:00.000Z", undefined)).toBeUndefined();
  });
});
