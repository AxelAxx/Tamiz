// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EvalMetric, EvalReport } from "@tamiz/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  formatBound,
  formatDuration,
  formatFields,
  formatMetricValue,
  groupByPolicy,
  headlines,
  metricLabel,
  orderEvals,
  splitMetrics,
} from "@/features/eval-results/model";
import { readEvalReports } from "@/lib/server/evals";

// Spec 008 US6-4, US6-5 (tasks.md T044): the reports folder and what the screen derives.

function report(startedAt: string, policyVersion?: number, status: EvalReport["status"] = "pass") {
  return {
    schemaVersion: 1,
    run: {
      startedAt,
      durationMs: 1000,
      selection: ["routing"],
      datasets: [],
      ...(policyVersion !== undefined && { policy: { id: "default", version: policyVersion } }),
      services: {},
      models: {},
    },
    status,
    evals: [],
  } satisfies EvalReport;
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "tamiz-evals-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const put = (name: string, content: unknown) =>
  writeFile(join(dir, name), typeof content === "string" ? content : JSON.stringify(content));

describe("readEvalReports", () => {
  it("parses every *.json report and sorts them by run.startedAt, newest first (US6-4)", async () => {
    await put("a.json", report("2026-10-29T06:00:00.000Z", 2));
    await put("b.json", report("2026-11-01T06:00:00.000Z", 3));
    await put("c.JSON", report("2026-10-30T06:00:00.000Z", 2));
    await put("notes.md", "not a report and not .json");
    const list = await readEvalReports(dir);
    expect(list.reports.map((r) => r.file)).toEqual(["b.json", "c.JSON", "a.json"]);
    expect(list.unreadable).toEqual([]);
  });

  it("lists invalid files by name with an issue summary and keeps the valid ones (US6-5)", async () => {
    await put("good.json", report("2026-11-01T06:00:00.000Z", 3));
    await put("bad-json.json", "{ not json");
    await put("bad-shape.json", { schemaVersion: 2, secret: "Ana García 12345678Z" });
    const list = await readEvalReports(dir);
    expect(list.reports.map((r) => r.file)).toEqual(["good.json"]);
    expect(list.unreadable).toEqual([
      { file: "bad-json.json", issue: "is not valid JSON" },
      {
        file: "bad-shape.json",
        issue: expect.stringMatching(/^does not match the report schema \(at .+\)$/),
      },
    ]);
    // Paths only: nothing from the file's content is echoed.
    expect(JSON.stringify(list.unreadable)).not.toContain("12345678Z");
  });

  it("treats a missing folder as an empty one (US6-6)", async () => {
    expect(await readEvalReports(join(dir, "missing"))).toEqual({ reports: [], unreadable: [] });
  });
});

describe("groupByPolicy", () => {
  it("groups runs by policy version, newest group first, unknown policy apart (US6-4)", () => {
    const groups = groupByPolicy([
      { file: "old.json", report: report("2026-10-28T06:00:00.000Z") },
      { file: "v2a.json", report: report("2026-10-29T06:00:00.000Z", 2) },
      { file: "v3.json", report: report("2026-11-01T06:00:00.000Z", 3) },
      { file: "v2b.json", report: report("2026-10-30T06:00:00.000Z", 2) },
    ]);
    expect(groups.map((g) => [g.label, g.runs.map((r) => r.file)])).toEqual([
      ["policy default v3", ["v3.json"]],
      ["policy default v2", ["v2b.json", "v2a.json"]],
      ["unknown policy", ["old.json"]],
    ]);
  });
});

const metric = (m: Partial<EvalMetric> & Pick<EvalMetric, "name" | "value">): EvalMetric => m;

describe("metric display", () => {
  it("names metrics in words", () => {
    expect(metricLabel("leak_rate.DNI")).toBe("DNI leak rate");
    expect(metricLabel("recall.CREDIT_CARD")).toBe("CREDIT CARD recall");
    expect(metricLabel("route_accuracy")).toBe("Routing accuracy");
    expect(metricLabel("values.tool_messages")).toBe("Tool-message values");
    expect(metricLabel("something_new")).toBe("something_new");
  });

  it("formats values and bounds in the metric's unit", () => {
    const accuracy = metric({
      name: "route_accuracy",
      value: 0.932,
      unit: "ratio",
      threshold: { comparison: "gte", bound: 0.95 },
    });
    expect(formatMetricValue(accuracy)).toBe("93.2 %");
    expect(formatBound(accuracy)).toBe("≥ 95.0 %");
    expect(formatBound(metric({ name: "saving", value: 0.87, unit: "ratio" }))).toBe("reported");
    expect(formatMetricValue(metric({ name: "x", value: 0.875, unit: "score" }))).toBe("0.88");
    expect(formatMetricValue(metric({ name: "x", value: 0.0376, unit: "usd" }))).toBe("$0.0376");
    expect(formatMetricValue(metric({ name: "x", value: 1600, unit: "count" }))).toBe("1,600");
  });

  it("shows one more decimal when rounding would hide a miss", () => {
    const close = metric({
      name: "recall.DNI",
      value: 0.9496,
      unit: "ratio",
      threshold: { comparison: "gte", bound: 0.95 },
    });
    expect(formatMetricValue(close)).toBe("94.96 %");
  });

  it("keeps gated and featured metrics in view and the rest behind 'more'", () => {
    const { shown, more } = splitMetrics({
      id: "cost",
      status: "pass",
      durationMs: 1,
      failing: [],
      failingCount: 0,
      metrics: [
        metric({ name: "saving", value: 0.8, unit: "ratio" }),
        metric({ name: "cases", value: 44, unit: "count" }),
      ],
    });
    expect(shown.map((m) => m.name)).toEqual(["saving"]);
    expect(more.map((m) => m.name)).toEqual(["cases"]);
  });

  it("formats durations and case fields", () => {
    expect(formatDuration(79)).toBe("79 ms");
    expect(formatDuration(38_000)).toBe("38 s");
    expect(formatDuration(199_096)).toBe("3 min 19 s");
    expect(formatFields({ route: "mistral-small", start: 12 })).toBe(
      "route mistral-small · start 12",
    );
    expect(formatFields(undefined)).toBe("—");
  });
});

describe("headlines and order", () => {
  const gated = (name: string, value: number, comparison: "eq" | "gte", bound: number) =>
    metric({
      name,
      value,
      unit: "ratio",
      threshold: { comparison, bound },
      pass: comparison === "eq" ? value === bound : value >= bound,
    });

  const full: EvalReport = {
    ...report("2026-11-01T06:00:00.000Z", 3, "fail"),
    evals: [
      {
        id: "leak",
        status: "pass",
        durationMs: 1,
        failing: [],
        failingCount: 0,
        metrics: [
          gated("leak_rate.DNI", 0, "eq", 0),
          metric({ name: "leak_rate.CIF", value: 0.5, unit: "ratio" }),
        ],
      },
      {
        id: "detection",
        status: "pass",
        durationMs: 1,
        failing: [],
        failingCount: 0,
        metrics: [
          gated("recall.DNI", 1, "gte", 0.95),
          gated("recall.IBAN", 0.96, "gte", 0.95),
          gated("recall.PERSON", 0.81, "gte", 0.8),
        ],
      },
      {
        id: "routing",
        status: "fail",
        durationMs: 1,
        failing: [],
        failingCount: 0,
        metrics: [gated("route_accuracy", 0.9, "gte", 0.95)],
      },
    ],
  };

  it("takes the worst gated value of each promise, ignoring ungated and lower-bound metrics", () => {
    const [leak, recall, routing] = headlines(full);
    expect(leak?.metric?.name).toBe("leak_rate.DNI");
    expect(recall?.metric?.name).toBe("recall.IBAN");
    expect(recall?.pass).toBe(true);
    expect(routing?.pass).toBe(false);
  });

  it("has no headline value when the eval did not run", () => {
    const [, , routing] = headlines({ ...full, evals: [] });
    expect(routing?.metric).toBeUndefined();
  });

  it("puts failing evals first", () => {
    expect(orderEvals(full.evals).map((e) => e.id)).toEqual(["routing", "leak", "detection"]);
  });
});
