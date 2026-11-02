/**
 * What the cost screen shows, derived from a cost report (spec 008 US7, research R-08).
 *
 * Totals come from the report's `totals` and are never recomputed (US7-1). Saving is
 * baseline minus actual, and its share of the baseline. Without a priced target
 * (`baseline: null`) the baseline and the saving are unavailable, never zero (US7-4).
 * Ranges are UTC days, as the gateway groups them.
 */
import type { CostReportDto } from "@tamiz/contracts";

export interface CostView {
  readonly actual: number;
  /** Undefined when the policy has no priced target. */
  readonly baseline: number | undefined;
  readonly saving: number | undefined;
  /** Saving over baseline, 0…1; undefined without a baseline or when it is zero. */
  readonly savingRatio: number | undefined;
  readonly requests: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly notServed: CostReportDto["notServed"];
}

export function costView(report: CostReportDto): CostView {
  const { totals } = report;
  const priced = report.baseline !== null;
  const baseline = priced ? totals.baselineCostUsd : undefined;
  const saving = baseline === undefined ? undefined : baseline - totals.costUsd;
  return {
    actual: totals.costUsd,
    baseline,
    saving,
    savingRatio:
      saving === undefined || baseline === undefined || baseline === 0
        ? undefined
        : saving / baseline,
    requests: totals.requests,
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    notServed: report.notServed,
  };
}

export type RangePreset = "7d" | "30d" | "month";

export const PRESET_LABELS: Readonly<Record<RangePreset, string>> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
};

export interface CostRange {
  readonly from: string;
  readonly to: string;
}

const DAY_MS = 86_400_000;

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** A preset ending now: whole UTC days back from today, or the UTC month so far. */
export function presetRange(preset: RangePreset, now: Date): CostRange {
  const t = now.getTime();
  const from =
    preset === "month"
      ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
      : startOfUtcDay(t) - (preset === "7d" ? 6 : 29) * DAY_MS;
  return { from: new Date(from).toISOString(), to: now.toISOString() };
}

/**
 * Two UTC dates (`2026-10-01`, inclusive) as a range ending at the start of the day after
 * `end`; an error message when they are missing or out of order.
 */
export function customRange(start: string, end: string): CostRange | { readonly error: string } {
  const from = Date.parse(`${start}T00:00:00.000Z`);
  const last = Date.parse(`${end}T00:00:00.000Z`);
  if (Number.isNaN(from) || Number.isNaN(last)) return { error: "Enter a start and an end date." };
  if (last < from) return { error: "The end date must be after the start date." };
  return { from: new Date(from).toISOString(), to: new Date(last + DAY_MS).toISOString() };
}
