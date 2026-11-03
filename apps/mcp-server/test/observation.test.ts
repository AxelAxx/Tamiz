import type { CostReportDto } from "@tamiz/contracts";
import { describe, expect, it } from "vitest";
import { createObservationFormatter } from "../src/agent/observation.js";

// Spec 009 agent-eval addendum FR-030: how a cost report reads to the agent's model.

function report(from: string, to: string, rows: [string, number][]): CostReportDto {
  const row = (key: string, costUsd: number) => ({
    key,
    requests: 10,
    inputTokens: 4_000,
    outputTokens: 1_000,
    costUsd,
    baselineCostUsd: 0.027,
  });
  return {
    from,
    to,
    groupBy: "route",
    baseline: { targetId: "anthropic-sonnet", inputUsdPerMillion: 3, outputUsdPerMillion: 15 },
    rows: rows.map(([key, cost]) => row(key, cost)),
    notServed: { requests: 0, blocked: 0, failed: 0 },
    totals: {
      ...row(
        "total",
        rows.reduce((sum, [, cost]) => sum + cost, 0),
      ),
      requests: 10 * rows.length,
    },
  };
}

const DAY_BEFORE = report("2026-11-01T00:00:00Z", "2026-11-02T00:00:00Z", [
  ["ollama-llama", 0],
  ["anthropic-sonnet", 0.31],
  ["mistral-small", 0.11],
]);
const YESTERDAY = report("2026-11-02T00:00:00Z", "2026-11-03T00:00:00Z", [
  ["ollama-llama", 0],
  ["anthropic-sonnet", 0.732],
  ["mistral-small", 0.11],
]);

describe("observation formatter", () => {
  it("FR-030: a cost report reads as spent per row, the total, and the baseline set apart", () => {
    const text = createObservationFormatter()("get_cost_report", YESTERDAY);
    expect(text.split("\n")).toEqual([
      "Cost report from 2026-11-02 (inclusive) to 2026-11-03 (exclusive), UTC, by route:",
      "- anthropic-sonnet: spent $0.7320 on 10 requests",
      "- mistral-small: spent $0.1100 on 10 requests",
      "- ollama-llama: spent $0.0000 on 10 requests",
      "Total spent: $0.8420 on 30 requests.",
      "(Not money spent: the same requests on anthropic-sonnet would have cost $0.0270.)",
    ]);
  });

  it("FR-030: a second report by route adds the change per route, earlier day first, largest first", () => {
    const format = createObservationFormatter();
    format("get_cost_report", YESTERDAY);
    const text = format("get_cost_report", DAY_BEFORE);
    expect(text).toContain(
      [
        "Change per route, 2026-11-01 → 2026-11-02, largest first:",
        "- anthropic-sonnet: $0.3100 → $0.7320 (+$0.4220)",
        "- ollama-llama: $0.0000 → $0.0000 (+$0.0000)",
        "- mistral-small: $0.1100 → $0.1100 (+$0.0000)",
        "Total spent: $0.4200 → $0.8420 (+$0.4220).",
      ].join("\n"),
    );
  });

  it("FR-030: the same period twice adds no change; other tools stay JSON", () => {
    const format = createObservationFormatter();
    format("get_cost_report", YESTERDAY);
    expect(format("get_cost_report", YESTERDAY)).not.toContain("Change per");
    expect(format("get_provider_health", { targets: [] })).toBe('{"targets":[]}');
  });
});
