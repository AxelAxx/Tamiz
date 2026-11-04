import type { CostReportDto } from "@tamiz/contracts";
import { describe, expect, it } from "vitest";
import { costView, customRange, presetRange, rangeDays } from "@/features/cost-analytics/cost-view";

// Spec 008 US7-1, US7-4, research R-08 (tasks.md T049). Synthetic figures from the brief.

function report(overrides: Partial<CostReportDto> = {}): CostReportDto {
  return {
    from: "2026-10-02T00:00:00.000Z",
    to: "2026-11-01T00:00:00.000Z",
    groupBy: "day",
    baseline: { targetId: "anthropic-sonnet", inputUsdPerMillion: 3, outputUsdPerMillion: 15 },
    rows: [],
    notServed: { requests: 5, blocked: 3, failed: 2 },
    totals: {
      key: "total",
      requests: 120,
      inputTokens: 48_000,
      outputTokens: 9_800,
      costUsd: 0.0376,
      baselineCostUsd: 0.2913,
    },
    ...overrides,
  };
}

describe("costView", () => {
  it("takes the totals as they are and derives the saving and its share", () => {
    const view = costView(report());
    expect(view.actual).toBe(0.0376);
    expect(view.baseline).toBe(0.2913);
    expect(view.saving).toBeCloseTo(0.2537, 10);
    expect(view.savingRatio).toBeCloseTo(0.8709, 4);
    expect(view.requests).toBe(120);
    expect(view.notServed).toEqual({ requests: 5, blocked: 3, failed: 2 });
  });

  it("US7-4 without a priced target the baseline and saving are unavailable, never zero", () => {
    const view = costView(report({ baseline: null }));
    expect(view.baseline).toBeUndefined();
    expect(view.saving).toBeUndefined();
    expect(view.savingRatio).toBeUndefined();
    expect(view.actual).toBe(0.0376);
  });

  it("a zero baseline has no saving share", () => {
    const view = costView(
      report({
        totals: { ...report().totals, costUsd: 0, baselineCostUsd: 0 },
      }),
    );
    expect(view.saving).toBe(0);
    expect(view.savingRatio).toBeUndefined();
  });
});

describe("ranges in UTC", () => {
  // 00:30 on 1 November in Madrid (UTC+1) is 23:30 on 31 October UTC: "today" is the 31st.
  const now = new Date("2026-10-31T23:30:00.000Z");

  it("last 7 and 30 days start at UTC midnight, today included", () => {
    expect(presetRange("7d", now)).toEqual({
      from: "2026-10-25T00:00:00.000Z",
      to: "2026-10-31T23:30:00.000Z",
    });
    expect(presetRange("30d", now).from).toBe("2026-10-02T00:00:00.000Z");
  });

  it("this month starts on the first UTC day of the month", () => {
    expect(presetRange("month", now).from).toBe("2026-10-01T00:00:00.000Z");
    expect(presetRange("month", new Date("2026-11-01T00:10:00.000Z")).from).toBe(
      "2026-11-01T00:00:00.000Z",
    );
  });

  it("a custom range includes its end day and refuses an end before the start", () => {
    expect(customRange("2026-10-01", "2026-10-07")).toEqual({
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-08T00:00:00.000Z",
    });
    expect(customRange("2026-11-01", "2026-10-01")).toEqual({
      error: "The end date must be after the start date.",
    });
    expect(customRange("", "2026-10-01")).toEqual({ error: "Enter a start and an end date." });
  });
});

describe("rangeDays (code audit 2026-11-03, L13)", () => {
  it("a custom range ends on its last day, a preset today", () => {
    const custom = customRange("2026-10-01", "2026-10-07");
    if ("error" in custom) throw new Error("a valid range");
    expect(rangeDays(custom)).toEqual({ first: "2026-10-01", last: "2026-10-07" });
    const preset = presetRange("7d", new Date("2026-11-03T15:00:00Z"));
    expect(rangeDays(preset)).toEqual({ first: "2026-10-28", last: "2026-11-03" });
  });
});
