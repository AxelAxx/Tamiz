/**
 * The run report (spec 010 data-model section 3): one `key: value` line per field in a
 * fixed order, then a blank line and the answer. The writer refuses any text containing a
 * key, so a bug can never print one (FR-009, US1-5). The prompt is never a field; the
 * marker tests of US3-3 check that it stays out of the report.
 */

export const REPORT_FIELDS = [
  "status",
  "request_id",
  "route",
  "rule",
  "fallback",
  "sensitivity",
  "privacy",
  "retry_after",
  "error_type",
  "retryable",
  "attempts",
  "model",
  "finish_reason",
  "usage",
  "audit",
  "audit_error",
] as const;
export type ReportField = (typeof REPORT_FIELDS)[number];

export type RunReport = Partial<Record<ReportField, string>> & { readonly answer?: string };

/** Renders the fields that are set, in `REPORT_FIELDS` order, then the answer. */
export function renderReport(report: RunReport): string {
  const lines: string[] = [];
  for (const field of REPORT_FIELDS) {
    const value = report[field];
    if (value !== undefined) lines.push(`${field}: ${value}`);
  }
  const head = `${lines.join("\n")}\n`;
  return report.answer === undefined ? head : `${head}\n${report.answer}\n`;
}

export type Write = (text: string) => void;

/** Wraps a writer so the keys never leave the process. */
export function guardedWriter(
  write: Write,
  secrets: ReadonlyArray<string>,
): (report: RunReport) => void {
  return (report) => {
    const text = renderReport(report);
    if (secrets.some((secret) => secret !== "" && text.includes(secret))) {
      throw new Error("refusing to print a key");
    }
    write(text);
  };
}
