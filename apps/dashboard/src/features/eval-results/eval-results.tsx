"use client";

/**
 * Eval results (design `evals.html`; spec 008 US6, research R-09): the selected run's status
 * and provenance, its three headline promises, one card per eval with metrics against
 * thresholds and failing cases, the run history by policy version, and the files that could
 * not be read. Reports come from a folder; nothing here calls the gateway.
 */
import type { EvalMetric, EvalReport, EvalResult } from "@tamiz/contracts";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FileSearch, FileWarning, TriangleAlert } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PassFailMark } from "@/features/shared/badges";
import { CARD } from "@/features/shared/card";
import { MISSING } from "@/features/shared/format";
import { RegionError } from "@/features/shared/region-states";
import { api } from "@/lib/api-client";
import type { EvalsList } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import {
  EVAL_LABEL,
  formatBound,
  formatDuration,
  formatFields,
  formatMetricValue,
  formatRunTime,
  groupByPolicy,
  type Headline,
  headlines,
  metricLabel,
  orderEvals,
  type ReportFile,
  shortSha,
  splitMetrics,
} from "./model";

const CODE = "font-mono text-foreground";
const DOWNLOAD = "gh run download <run-id> --name evals-report --dir <reports folder>";

function Provenance({ report, file }: { readonly report: EvalReport; readonly file: string }) {
  const { run } = report;
  const roles: ReadonlyArray<[string, string | undefined]> = [
    ["Answer model", run.models.answer],
    ["Judge", run.models.judge],
    ["Frontier", run.models.frontier],
    ["Gateway", run.services.gateway],
    ["Privacy service", run.services.privacy],
  ];
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 aria-label={`Run status: ${report.status}`}>
          <PassFailMark status={report.status} size="lg" />
        </h2>
        <p className="text-sm text-muted-foreground">
          Started <span className="tabular">{formatRunTime(run.startedAt)}</span> ·{" "}
          {formatDuration(run.durationMs)} · commit{" "}
          <span className={CODE}>{shortSha(run.gitSha)}</span> ·{" "}
          {run.policy === undefined ? (
            "unknown policy"
          ) : (
            <>
              policy <span className={CODE}>{run.policy.id}</span> v{run.policy.version}
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          File <span className="font-mono">{file}</span>
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-x-6 gap-y-3 text-xs md:flex md:flex-wrap md:justify-end">
        {roles
          .filter((role): role is [string, string] => role[1] !== undefined)
          .map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-words font-mono text-sm">{value}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

function HeadlineFigure({ item }: { readonly item: Headline }) {
  const { metric } = item;
  return (
    <div data-component="eval-headline" className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{item.label}</dt>
      <dd
        className={cn(
          "tabular text-2xl font-medium tracking-tight",
          item.pass === false && "text-danger",
        )}
      >
        {metric === undefined ? MISSING : formatMetricValue(metric)}
        {item.pass === false ? <span className="sr-only"> (fails its threshold)</span> : null}
      </dd>
      <dd className="text-xs text-muted-foreground">
        {metric === undefined ? "not measured in this run" : `target ${formatBound(metric)}`}
      </dd>
    </div>
  );
}

function RunHeader({ entry }: { readonly entry: ReportFile }) {
  const { report } = entry;
  return (
    <section data-component="run-header" aria-label="Selected run" className={cn(CARD, "p-6")}>
      <Provenance report={report} file={entry.file} />
      <dl className="mt-5 grid gap-4 border-t pt-5 sm:grid-cols-3">
        {headlines(report).map((item) => (
          <HeadlineFigure key={item.label} item={item} />
        ))}
      </dl>
      <p className="mt-4 text-xs text-muted-foreground">
        Datasets:{" "}
        {report.run.datasets.length === 0
          ? MISSING
          : report.run.datasets.map((d, index) => (
              <Fragment key={d.name}>
                {index > 0 ? " · " : null}
                <span className="font-mono">{d.name}</span> v{d.version} ({d.cases} cases)
              </Fragment>
            ))}
      </p>
    </section>
  );
}

function MetricRows({ metrics }: { readonly metrics: ReadonlyArray<EvalMetric> }) {
  return metrics.map((metric) => (
    <tr key={metric.name} data-metric={metric.name} className="border-b last:border-b-0">
      <th scope="row" className="py-2.5 pr-3 text-left font-normal text-muted-foreground">
        {metricLabel(metric.name)}
      </th>
      <td
        className={cn(
          "tabular py-2.5 pr-3 text-right font-medium",
          metric.pass === false && "text-danger",
        )}
      >
        {formatMetricValue(metric)}
      </td>
      <td className="tabular py-2.5 pr-3 text-right text-xs text-muted-foreground">
        {formatBound(metric)}
      </td>
      <td className="py-2.5 text-right">
        {metric.pass === undefined ? (
          <span className="sr-only">not gated</span>
        ) : (
          <PassFailMark status={metric.pass ? "pass" : "fail"} />
        )}
      </td>
    </tr>
  ));
}

function MetricTable({
  label,
  metrics,
}: {
  readonly label: string;
  readonly metrics: ReadonlyArray<EvalMetric>;
}) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{label}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Metric</th>
          <th scope="col">Value</th>
          <th scope="col">Threshold</th>
          <th scope="col">Result</th>
        </tr>
      </thead>
      <tbody>
        <MetricRows metrics={metrics} />
      </tbody>
    </table>
  );
}

function Disclosure({
  summary,
  open,
  children,
}: {
  readonly summary: ReactNode;
  readonly open?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <details open={open} className="group">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-90"
        />
        {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function FailingCases({ result }: { readonly result: EvalResult }) {
  const shown = result.failing.length;
  return (
    <Disclosure
      open={result.status === "fail"}
      summary={
        <>
          <span className="font-medium">Failing cases</span>
          <span className="text-muted-foreground">
            showing {shown} of {result.failingCount}
          </span>
        </>
      }
    >
      {/* Up to 50 rows: the list scrolls inside the card, so it can take keyboard focus. */}
      <section
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable
        tabIndex={0}
        aria-label={`${EVAL_LABEL[result.id]} failing cases`}
        className="max-h-96 overflow-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-ring"
      >
        <table data-component="failing-cases" className="w-full text-sm">
          <caption className="sr-only">
            {EVAL_LABEL[result.id]} failing cases, {shown} of {result.failingCount}
          </caption>
          <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
            <tr>
              {["Case", "Reason", "Expected", "Actual"].map((label) => (
                <th key={label} scope="col" className="px-3 py-2 text-left font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.failing.map((item) => (
              <tr key={item.id} className="border-t">
                <th scope="row" className="px-3 py-2 text-left font-mono font-normal">
                  {item.id}
                </th>
                <td className="px-3 py-2">{item.reason}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {formatFields(item.expected)}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-danger">
                  {formatFields(item.actual)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {shown < result.failingCount ? (
        <p className="mt-2 text-xs text-muted-foreground">
          The report lists the first {shown}; {result.failingCount - shown} more failed. The CI
          artifact's <span className="font-mono">evals.md</span> has the same list.
        </p>
      ) : null}
    </Disclosure>
  );
}

function EvalCard({ result }: { readonly result: EvalResult }) {
  const { shown, more } = splitMetrics(result);
  const label = EVAL_LABEL[result.id];
  const failed = result.status === "fail";
  return (
    <section
      data-component="eval-card"
      data-eval={result.id}
      data-status={result.status}
      aria-labelledby={`eval-${result.id}`}
      className={cn(
        CARD,
        "flex flex-col gap-3 p-4",
        failed && "border-danger/40 ring-1 ring-danger/20 md:col-span-2 xl:col-span-3",
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <h3 id={`eval-${result.id}`} className="text-sm font-semibold">
          {label}
        </h3>
        <span className="flex items-center gap-3">
          <span className="tabular text-xs text-muted-foreground">
            {formatDuration(result.durationMs)}
          </span>
          <PassFailMark status={result.status} />
        </span>
      </header>
      {result.status === "error" ? (
        <div className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
          <p className="font-medium">Eval did not finish</p>
          <p>
            <span className="font-mono">{result.error?.type ?? "unknown"}</span>
            {result.error?.service === undefined ? null : <> from {result.error.service}</>}
          </p>
        </div>
      ) : null}
      {result.status === "skipped" ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Skipped: {result.skipReason ?? "no reason given"}.
        </p>
      ) : null}
      {shown.length > 0 ? <MetricTable label={`${label} metrics`} metrics={shown} /> : null}
      {more.length > 0 ? (
        <Disclosure
          summary={
            <span className="text-muted-foreground">
              {more.length} more reported metric{more.length === 1 ? "" : "s"}
            </span>
          }
        >
          <MetricTable label={`${label}, more reported metrics`} metrics={more} />
        </Disclosure>
      ) : null}
      {result.failingCount > 0 ? <FailingCases result={result} /> : null}
    </section>
  );
}

function History({
  reports,
  selected,
  onSelect,
}: {
  readonly reports: ReadonlyArray<ReportFile>;
  readonly selected: string;
  readonly onSelect: (file: string) => void;
}) {
  return (
    <section data-component="run-history" aria-labelledby="run-history" className={CARD}>
      <h2 id="run-history" className="border-b px-4 py-3 text-sm font-semibold">
        Run history
      </h2>
      {groupByPolicy(reports).map((group) => (
        <div key={group.key} data-component="history-group" className="border-b last:border-b-0">
          <h3 className="bg-muted/40 px-4 py-1.5 text-xs font-medium text-muted-foreground">
            {group.label}
          </h3>
          <ul>
            {group.runs.map(({ file, report }) => {
              const current = file === selected;
              return (
                <li key={file} className="border-t first:border-t-0">
                  <button
                    type="button"
                    data-file={file}
                    aria-current={current ? "true" : undefined}
                    onClick={() => onSelect(file)}
                    className={cn(
                      "flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                      current && "bg-muted",
                    )}
                  >
                    <PassFailMark status={report.status} />
                    <span className="tabular">{formatRunTime(report.run.startedAt)}</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {shortSha(report.run.gitSha)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Unreadable({ files }: { readonly files: EvalsList["unreadable"] }) {
  const count = files.length;
  return (
    <section
      data-component="unreadable-reports"
      aria-labelledby="unreadable-reports"
      className="h-fit rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning"
    >
      <h2 id="unreadable-reports" className="flex items-center gap-2 font-medium">
        <FileWarning aria-hidden="true" className="size-4 shrink-0" />
        {count} file{count === 1 ? "" : "s"} could not be read
      </h2>
      <ul className="mt-1.5 flex flex-col gap-1 pl-6">
        {files.map((item) => (
          <li key={item.file}>
            <span className="break-all font-mono">{item.file}</span> {item.issue}.
          </li>
        ))}
      </ul>
    </section>
  );
}

function NoReports() {
  return (
    <section
      data-component="region-empty"
      aria-label="No eval reports"
      className={cn(CARD, "flex flex-col items-center gap-3 px-6 py-16 text-center")}
    >
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <FileSearch aria-hidden="true" className="size-5" />
      </span>
      <p className="max-w-md text-sm text-muted-foreground">
        No eval reports yet. Reports come from the CI artifact{" "}
        <span className={CODE}>evals-report</span> of the <span className={CODE}>evals</span> job.
        Download one into the reports folder (
        <span className={CODE}>TAMIZ_DASHBOARD_EVALS_DIR</span>) and reload:
      </p>
      <code className="max-w-full overflow-x-auto rounded-md border bg-muted px-3 py-2 text-left font-mono text-xs">
        {DOWNLOAD}
      </code>
    </section>
  );
}

function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="flex flex-col gap-4">
      <Skeleton className="h-56 rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
    </div>
  );
}

export function EvalResults() {
  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 p-4 md:p-6">
      <Content />
    </div>
  );
}

function Content() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = useQuery({ queryKey: ["evals"], queryFn: api.evals });

  if (query.isPending) return <Loading />;
  if (query.isError) {
    return (
      <div className={CARD}>
        <RegionError error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  const { reports, unreadable } = query.data;
  const wanted = searchParams.get("run");
  const entry = reports.find((r) => r.file === wanted) ?? reports[0];
  const select = (file: string) =>
    router.replace(`${pathname}?${new URLSearchParams({ run: file })}`, { scroll: false });

  return (
    <div data-component="eval-results" className="flex flex-col gap-4">
      {entry === undefined ? (
        <NoReports />
      ) : (
        <>
          {wanted !== null && wanted !== entry.file ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <TriangleAlert aria-hidden="true" className="size-4 text-warning" />
              No report named <span className="font-mono">{wanted}</span>; showing the latest run.
            </p>
          ) : null}
          <RunHeader entry={entry} />
          <h2 className="sr-only">Evals of this run</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {orderEvals(entry.report.evals).map((result) => (
              <EvalCard key={result.id} result={result} />
            ))}
          </div>
        </>
      )}
      {entry === undefined && unreadable.length === 0 ? null : (
        <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
          {entry === undefined ? null : (
            <History reports={reports} selected={entry.file} onSelect={select} />
          )}
          {unreadable.length > 0 ? <Unreadable files={unreadable} /> : null}
        </div>
      )}
    </div>
  );
}
