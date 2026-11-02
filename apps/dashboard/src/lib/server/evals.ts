/**
 * Eval reports from a folder (spec 008 US6, research R-09): every `*.json` file in
 * `TAMIZ_DASHBOARD_EVALS_DIR` is parsed with `EvalReportSchema`. Valid reports come back
 * newest first; any other file is listed as unreadable with a short issue, never with its
 * content. A missing folder is an empty one.
 */
import "server-only";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { EvalReportSchema } from "@tamiz/contracts";
import type { EvalsList } from "../schemas";

const SCHEMA_ISSUE = "does not match the report schema";

async function jsonFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

type Parsed =
  | { readonly ok: true; readonly report: EvalsList["reports"][number]["report"] }
  | { readonly ok: false; readonly issue: string };

function parse(text: string): Parsed {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, issue: "is not valid JSON" };
  }
  const result = EvalReportSchema.safeParse(json);
  if (result.success) return { ok: true, report: result.data };
  // Paths only: a Zod message can quote an enum value, never the file's text, but the
  // path alone is enough to find the problem.
  const paths = [...new Set(result.error.issues.map((i) => i.path.join(".") || "(root)"))];
  const shown = paths.slice(0, 3).join(", ");
  const more = paths.length > 3 ? ` and ${paths.length - 3} more` : "";
  return { ok: false, issue: `${SCHEMA_ISSUE} (at ${shown}${more})` };
}

export async function readEvalReports(dir: string): Promise<EvalsList> {
  const reports: EvalsList["reports"] = [];
  const unreadable: EvalsList["unreadable"] = [];
  for (const file of await jsonFiles(dir)) {
    let text: string;
    try {
      text = await readFile(join(dir, file), "utf8");
    } catch {
      unreadable.push({ file, issue: "could not be read" });
      continue;
    }
    const parsed = parse(text);
    if (parsed.ok) reports.push({ file, report: parsed.report });
    else unreadable.push({ file, issue: parsed.issue });
  }
  reports.sort(
    (a, b) =>
      b.report.run.startedAt.localeCompare(a.report.run.startedAt) || a.file.localeCompare(b.file),
  );
  return { reports, unreadable };
}
