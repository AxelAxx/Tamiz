/**
 * How a tool result reads to the agent's model (spec 009 agent-eval addendum, FR-030).
 *
 * A cost report is rendered as a few short lines: what was spent per row, the total, and
 * the frontier baseline set apart and named as "not money spent". Small local models
 * mistook the raw JSON's `baselineCostUsd` for a previous day's spend (`T-009-06`).
 *
 * When a run receives a second cost report grouped by route or model, the observation
 * also lists each key's change between the two, earlier period first, largest change
 * first. Subtracting across two results is where small models failed most; the agent does
 * that arithmetic and the model reads it. Any other result stays the JSON the tool
 * returned. The run record never holds either.
 */
import { type CostReportDto, CostReportSchema } from "@tamiz/contracts";

const usd = (value: number) => `$${value.toFixed(4)}`;
const signedUsd = (value: number) => `${value < 0 ? "-" : "+"}${usd(Math.abs(value))}`;
const day = (iso: string) => iso.slice(0, 10);
const range = (report: CostReportDto) =>
  `from ${day(report.from)} (inclusive) to ${day(report.to)} (exclusive)`;

function costReportLines(report: CostReportDto): string[] {
  const rows = [...report.rows].sort((a, b) => b.costUsd - a.costUsd);
  const lines = [
    `Cost report ${range(report)}, UTC, by ${report.groupBy}:`,
    ...(rows.length === 0
      ? ["- no requests"]
      : rows.map((row) => `- ${row.key}: spent ${usd(row.costUsd)} on ${row.requests} requests`)),
    `Total spent: ${usd(report.totals.costUsd)} on ${report.totals.requests} requests.`,
  ];
  if (report.baseline !== null) {
    lines.push(
      `(Not money spent: the same requests on ${report.baseline.targetId} would have cost ${usd(report.totals.baselineCostUsd)}.)`,
    );
  }
  return lines;
}

function changeLines(earlier: CostReportDto, later: CostReportDto): string[] {
  const before = new Map(earlier.rows.map((row) => [row.key, row.costUsd]));
  const after = new Map(later.rows.map((row) => [row.key, row.costUsd]));
  const changes = [...new Set([...before.keys(), ...after.keys()])]
    .map((key) => ({ key, before: before.get(key) ?? 0, after: after.get(key) ?? 0 }))
    .map((change) => ({ ...change, delta: change.after - change.before }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return [
    `Change per ${later.groupBy}, ${day(earlier.from)} → ${day(later.from)}, largest first:`,
    ...changes.map((c) => `- ${c.key}: ${usd(c.before)} → ${usd(c.after)} (${signedUsd(c.delta)})`),
    `Total spent: ${usd(earlier.totals.costUsd)} → ${usd(later.totals.costUsd)} (${signedUsd(later.totals.costUsd - earlier.totals.costUsd)}).`,
  ];
}

export type ObservationFormatter = (tool: string, structured: unknown) => string;

/** One formatter per run: it remembers the last cost report of each grouping. */
export function createObservationFormatter(): ObservationFormatter {
  const lastReport = new Map<string, CostReportDto>();
  return (tool, structured) => {
    if (tool !== "get_cost_report") return JSON.stringify(structured);
    const parsed = CostReportSchema.safeParse(structured);
    if (!parsed.success) return JSON.stringify(structured);
    const report = parsed.data;
    const lines = costReportLines(report);
    const previous = lastReport.get(report.groupBy);
    if (report.groupBy !== "day" && previous !== undefined && previous.from !== report.from) {
      const [earlier, later] =
        previous.from < report.from ? [previous, report] : [report, previous];
      lines.push("", ...changeLines(earlier, later));
    }
    lastReport.set(report.groupBy, report);
    return lines.join("\n");
  };
}
