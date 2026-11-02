/**
 * Eval report fixtures for `evals.spec.ts` (spec 008 US6, tasks.md T045): a passing run, a
 * failing run with more failing cases than the report lists, a run with an eval in `error`
 * and one `skipped`, and two files that are not reports. Each test writes the ones it needs
 * into the dashboard's reports folder (`EVALS_DIR`), which the dashboard reads per request.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  EVAL_FAILING_CAP,
  type EvalMetric,
  type EvalReport,
  type EvalResult,
} from "@tamiz/contracts";
import { EVALS_DIR } from "../support/fixtures";

const gated = (
  name: string,
  value: number,
  comparison: "eq" | "lt" | "gte",
  bound: number,
  pass = true,
): EvalMetric => ({ name, value, unit: "ratio", threshold: { comparison, bound }, pass });

const evalResult = (
  id: EvalResult["id"],
  durationMs: number,
  metrics: EvalMetric[],
  extra: Partial<EvalResult> = {},
): EvalResult => ({
  id,
  status: "pass",
  durationMs,
  metrics,
  failing: [],
  failingCount: 0,
  ...extra,
});

function report(
  startedAt: string,
  gitSha: string,
  policyVersion: number | undefined,
  evals: EvalResult[],
  status: EvalReport["status"] = "pass",
): EvalReport {
  return {
    schemaVersion: 1,
    run: {
      startedAt,
      durationMs: 252_000,
      gitSha,
      selection: ["leak", "detection", "routing", "quality", "cost"],
      datasets: [
        { name: "pii-leak-es", version: 1, cases: 160 },
        { name: "pii-detection-es", version: 1, cases: 160 },
        { name: "routing", version: 1, cases: 44 },
        { name: "quality-es", version: 1, cases: 24 },
      ],
      ...(policyVersion !== undefined && { policy: { id: "default", version: policyVersion } }),
      services: { gateway: "0.1.0" },
      models: { answer: "qwen2.5:1.5b", judge: "qwen2.5:3b" },
    },
    status,
    evals,
  };
}

const leak = evalResult("leak", 65_000, [
  gated("leak_rate.DNI", 0, "eq", 0),
  gated("leak_rate.IBAN", 0, "eq", 0),
  gated("leak_rate.PERSON", 0.01, "lt", 0.02),
  { name: "leak_rate.LOCATION", value: 0.25, unit: "ratio" },
  { name: "cases", value: 160, unit: "count" },
]);
const detection = evalResult("detection", 38_000, [
  gated("recall.DNI", 1, "gte", 0.95),
  gated("recall.IBAN", 0.97, "gte", 0.95),
  gated("recall.PERSON", 0.891, "gte", 0.8),
  { name: "precision.PERSON", value: 1, unit: "ratio" },
]);
const routing = evalResult("routing", 12_000, [gated("route_accuracy", 1, "gte", 0.95)]);
const quality = evalResult("quality", 121_000, [
  {
    name: "relative_score",
    value: 1,
    unit: "ratio",
    threshold: { comparison: "gte", bound: 0.95 },
    pass: true,
  },
  { name: "mean_score.routed", value: 0.875, unit: "score" },
]);
const cost = evalResult("cost", 79, [
  { name: "saving", value: 0.871, unit: "ratio" },
  { name: "cost.routed_estimate", value: 0.0376, unit: "usd" },
]);

export const PASSING = report(
  "2026-11-01T06:12:00.000Z",
  "a3f91c2b0000000000000000000000000000beef",
  3,
  [leak, detection, routing, quality, cost],
);

/** Routing below its threshold, with 63 failing cases of which the report lists 50. */
export const FAILING_TOTAL = 63;
export const FAILING = report(
  "2026-10-30T06:11:00.000Z",
  "4c22f18000000000000000000000000000000000",
  2,
  [
    leak,
    detection,
    evalResult("routing", 12_000, [gated("route_accuracy", 0.932, "gte", 0.95, false)], {
      status: "fail",
      failing: Array.from({ length: EVAL_FAILING_CAP }, (_, i) => ({
        id: `rt-${String(i + 1).padStart(3, "0")}`,
        reason: "wrong target",
        expected: { route: "ollama-llama" },
        actual: { route: "mistral-small" },
      })),
      failingCount: FAILING_TOTAL,
    }),
    quality,
    cost,
  ],
  "fail",
);

/** Quality did not finish; cost was skipped because it compares against quality. */
export const ERRORED = report(
  "2026-10-29T06:09:00.000Z",
  "07ad3e5000000000000000000000000000000000",
  undefined,
  [
    leak,
    detection,
    routing,
    evalResult("quality", 121_000, [], {
      status: "error",
      error: { type: "provider_timeout", service: "judge" },
    }),
    evalResult("cost", 0, [], {
      status: "skipped",
      skipReason: "quality did not finish; cost compares against it",
    }),
  ],
  "error",
);

/** Writes exactly these files into the reports folder (objects as JSON, strings as is). */
export async function useReports(files: Readonly<Record<string, unknown>>): Promise<void> {
  await rm(EVALS_DIR, { recursive: true, force: true });
  await mkdir(EVALS_DIR, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const text = typeof content === "string" ? content : JSON.stringify(content, null, 2);
    await writeFile(join(EVALS_DIR, name), text, "utf8");
  }
}
