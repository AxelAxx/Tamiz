/**
 * What the evals screen shows of a report (spec 008 US6, design `screens/evals.html`):
 * metric names in words, values and bounds in the metric's unit, the run's three headline
 * figures, and the history grouped by policy version. Pure functions over the report; the
 * pass marks are always the report's own, never recomputed.
 */
import type { EvalMetric, EvalReport, EvalResult } from "@tamiz/contracts";
import { formatNumber, formatUsd, MISSING } from "@/features/shared/format";
import type { EvalsList } from "@/lib/schemas";

export type ReportFile = EvalsList["reports"][number];

export const EVAL_LABEL: Readonly<Record<EvalResult["id"], string>> = {
  leak: "Leak",
  detection: "Detection",
  routing: "Routing",
  quality: "Quality",
  cost: "Cost",
  agent: "Agent",
};

const NAMED: Readonly<Record<string, string>> = {
  route_accuracy: "Routing accuracy",
  task_type_accuracy: "Task-type accuracy",
  relative_score: "Relative quality",
  answer_accuracy: "Answer accuracy",
  model_calls_mean: "Model calls per question",
  "mean_score.routed": "Mean score, routed",
  "mean_score.comparison": "Mean score, frontier",
  judge_errors: "Judge errors",
  "tokens.routed_output": "Routed output tokens",
  saving: "Saving vs baseline",
  "cost.routed_estimate": "Routed cost (estimate)",
  "cost.baseline_estimate": "Baseline cost (estimate)",
  cases: "Cases",
};

const PER_KIND: Readonly<Record<string, string>> = {
  leak_rate: "leak rate",
  recall: "recall",
  precision: "precision",
  support: "support",
  values: "values",
};

/** `leak_rate.DNI` → "DNI leak rate"; unknown names are shown as they are. */
export function metricLabel(name: string): string {
  const named = NAMED[name];
  if (named !== undefined) return named;
  const dot = name.indexOf(".");
  const kind = dot === -1 ? undefined : PER_KIND[name.slice(0, dot)];
  if (kind === undefined) return name;
  const subject = name.slice(dot + 1).replaceAll("_", " ");
  return `${subject === "tool messages" ? "Tool-message" : subject} ${kind}`;
}

function ratio(value: number, digits: number): string {
  return `${(value * 100).toFixed(digits)} %`;
}

function plain(value: number, unit: EvalMetric["unit"]): string {
  switch (unit) {
    case "ratio":
      return ratio(value, 1);
    case "usd":
      return formatUsd(value);
    case "score":
      return value.toFixed(2);
    default:
      return Number.isInteger(value) ? formatNumber(value) : value.toFixed(2);
  }
}

/**
 * The metric's value in its unit. When rounding would make a value look equal to its bound
 * while it is not (94.96 % against ≥ 95 %), one more decimal is shown, so the mark and the
 * numbers never seem to disagree.
 */
export function formatMetricValue(
  metric: Pick<EvalMetric, "value" | "unit" | "threshold">,
): string {
  const shown = plain(metric.value, metric.unit);
  const { threshold } = metric;
  if (
    metric.unit === "ratio" &&
    threshold !== undefined &&
    metric.value !== threshold.bound &&
    shown === plain(threshold.bound, metric.unit)
  ) {
    return ratio(metric.value, 2);
  }
  return shown;
}

const OPERATOR = { eq: "=", lt: "<", lte: "≤", gte: "≥" } as const;

/** "≥ 95.0 %", or "reported" for a metric without a threshold. */
export function formatBound(metric: Pick<EvalMetric, "unit" | "threshold">): string {
  if (metric.threshold === undefined) return "reported";
  const { comparison, bound } = metric.threshold;
  return `${OPERATOR[comparison]} ${plain(bound, metric.unit)}`;
}

/** Reported metrics worth showing next to the gated ones (as in the README table). */
const FEATURED = new Set(["saving", "cost.routed_estimate", "cost.baseline_estimate"]);

/** Gated and featured metrics first; the rest sit behind "more metrics". */
export function splitMetrics(result: EvalResult): {
  readonly shown: ReadonlyArray<EvalMetric>;
  readonly more: ReadonlyArray<EvalMetric>;
} {
  const isShown = (m: EvalMetric) => m.threshold !== undefined || FEATURED.has(m.name);
  return { shown: result.metrics.filter(isShown), more: result.metrics.filter((m) => !isShown(m)) };
}

/** "79 ms", "38 s", "3 min 19 s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}

/** "2026-10-31 09:15 UTC". */
export function formatRunTime(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export const shortSha = (sha: string | undefined): string =>
  sha === undefined ? MISSING : sha.slice(0, 7);

/** `{ kind: "DNI", start: 12 }` → "kind DNI · start 12". */
export function formatFields(
  fields: Readonly<Record<string, string | number | boolean>> | undefined,
): string {
  if (fields === undefined) return MISSING;
  const parts = Object.entries(fields).map(([key, value]) => `${key} ${String(value)}`);
  return parts.length === 0 ? MISSING : parts.join(" · ");
}

export interface Headline {
  readonly label: string;
  /** The worst gated value of the group, or `undefined` when the eval produced none. */
  readonly metric?: EvalMetric;
  readonly pass?: boolean;
}

function worst(
  metrics: ReadonlyArray<EvalMetric>,
  pick: (a: EvalMetric, b: EvalMetric) => EvalMetric,
): EvalMetric | undefined {
  return metrics.length === 0 ? undefined : metrics.reduce(pick);
}

function headline(label: string, metrics: ReadonlyArray<EvalMetric>, high: boolean): Headline {
  const metric = worst(metrics, (a, b) =>
    high ? (b.value > a.value ? b : a) : b.value < a.value ? b : a,
  );
  if (metric === undefined) return { label };
  return { label, metric, pass: metrics.every((m) => m.pass === true) };
}

/**
 * The run's three promises (design `evals.html` header): the critical leak rate (the gated
 * leak metrics that must be exactly zero), the structured-identifier recall (the recall
 * metrics with the highest bound) and the routing accuracy. Each shows its worst value.
 */
export function headlines(report: EvalReport): ReadonlyArray<Headline> {
  const metricsOf = (id: EvalResult["id"]) =>
    report.evals.find((e) => e.id === id && e.status !== "skipped")?.metrics ?? [];
  const critical = metricsOf("leak").filter(
    (m) => m.name.startsWith("leak_rate.") && m.threshold?.comparison === "eq",
  );
  const recalls = metricsOf("detection").filter(
    (m) => m.name.startsWith("recall.") && m.threshold !== undefined,
  );
  const topBound = Math.max(...recalls.map((m) => m.threshold?.bound ?? 0));
  const structured = recalls.filter((m) => m.threshold?.bound === topBound);
  const routing = metricsOf("routing").filter((m) => m.name === "route_accuracy");
  return [
    headline("Critical leak rate", critical, true),
    headline("Structured-identifier recall", structured, false),
    headline("Routing accuracy", routing, false),
  ];
}

/** Failing evals first, then the report's order (design: failing cards move to the top). */
export function orderEvals(evals: ReadonlyArray<EvalResult>): ReadonlyArray<EvalResult> {
  return [...evals.filter((e) => e.status === "fail"), ...evals.filter((e) => e.status !== "fail")];
}

export interface PolicyGroup {
  readonly key: string;
  readonly label: string;
  readonly runs: ReadonlyArray<ReportFile>;
}

/**
 * Runs grouped by `run.policy` (research R-09), groups ordered by their newest run and runs
 * kept newest first; a report without a policy goes to "unknown policy".
 */
export function groupByPolicy(reports: ReadonlyArray<ReportFile>): ReadonlyArray<PolicyGroup> {
  const groups = new Map<string, { label: string; runs: ReportFile[] }>();
  const sorted = [...reports].sort((a, b) =>
    b.report.run.startedAt.localeCompare(a.report.run.startedAt),
  );
  for (const entry of sorted) {
    const { policy } = entry.report.run;
    const key = policy === undefined ? "" : `${policy.id}@${policy.version}`;
    const label =
      policy === undefined ? "unknown policy" : `policy ${policy.id} v${policy.version}`;
    const group = groups.get(key) ?? { label, runs: [] };
    group.runs.push(entry);
    groups.set(key, group);
  }
  return [...groups].map(([key, { label, runs }]) => ({ key, label, runs }));
}
