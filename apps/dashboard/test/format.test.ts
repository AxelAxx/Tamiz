import { describe, expect, it } from "vitest";
import {
  formatAgo,
  formatLatency,
  formatNumber,
  formatPercent,
  formatUsd,
  formatUtc,
  formatUtcDay,
  formatUtcTime,
  MISSING,
} from "@/features/shared/format";

// Spec 008 design-brief §7, tasks.md T021.

describe("formatUsd", () => {
  it.each([
    [0, "$0.0000"],
    [0.00004, "<$0.0001"],
    [0.0000071, "<$0.0001"],
    [0.00027, "$0.0003"],
    [0.0376, "$0.0376"],
    [0.2913, "$0.2913"],
    [1, "$1.00"],
    [1234.5, "$1,234.50"],
  ])("%d → %s", (value, text) => {
    expect(formatUsd(value)).toBe(text);
  });

  it("shows a missing value as a dash, never $0", () => {
    expect(formatUsd(undefined)).toBe(MISSING);
  });
});

describe("numbers and percentages", () => {
  it("groups thousands", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(40)).toBe("40");
  });

  it("percentages keep one decimal", () => {
    expect(formatPercent(0.871)).toBe("87.1%");
    expect(formatPercent(1)).toBe("100.0%");
    expect(formatPercent(0)).toBe("0.0%");
  });
});

describe("formatLatency", () => {
  it.each([
    [0, "0 ms"],
    [840, "840 ms"],
    [999, "999 ms"],
    [1000, "1 s"],
    [1360, "1.36 s"],
    [1250, "1.25 s"],
    [12_500, "12.5 s"],
    [60_000, "60 s"],
  ])("%d ms → %s", (ms, text) => {
    expect(formatLatency(ms)).toBe(text);
  });
});

describe("times", () => {
  it("relative times", () => {
    expect(formatAgo(2)).toBe("just now");
    expect(formatAgo(12)).toBe("12 s ago");
    expect(formatAgo(185)).toBe("3 min ago");
    expect(formatAgo(7300)).toBe("2 h ago");
    expect(formatAgo(-3)).toBe("just now");
  });

  it("absolute times are UTC and say so; days are UTC days", () => {
    expect(formatUtc("2026-10-30T10:15:02.120Z")).toBe("2026-10-30 10:15:02.120 UTC");
    expect(formatUtcTime("2026-10-30T10:15:02.120Z")).toBe("10:15:02");
    // 23:30 at UTC-2 is already the next UTC day.
    expect(formatUtcDay("2026-10-30T23:30:00-02:00")).toBe("2026-10-31");
  });
});
