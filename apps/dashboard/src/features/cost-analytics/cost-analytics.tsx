"use client";

/**
 * Cost analytics (design `cost.html`; spec 008 US7, research R-08): actual spend against
 * "everything to the most expensive target" for a UTC range, grouped by day, route or model.
 * Key figures, a chart, and the breakdown table that carries the same numbers (US7-6).
 */
import type { CostReportDto } from "@tamiz/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownUp,
  Ban,
  Calendar,
  CalendarX,
  CircleCheck,
  CircleX,
  Coins,
  Info,
  type LucideIcon,
  Scale,
  TrendingDown,
} from "lucide-react";
import { type FormEvent, type ReactNode, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatNumber, formatPercent, formatUsd, MISSING } from "@/features/shared/format";
import { RegionEmpty, RegionError, RegionLoading } from "@/features/shared/region-states";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { CostChart } from "./cost-chart";
import {
  type CostRange,
  costView,
  customRange,
  PRESET_LABELS,
  presetRange,
  type RangePreset,
} from "./cost-view";

const CARD = "rounded-xl border bg-card text-card-foreground shadow-xs";
type GroupBy = CostReportDto["groupBy"];
const KEY_LABEL: Readonly<Record<GroupBy, string>> = {
  day: "Day (UTC)",
  route: "Route",
  model: "Model",
};

function Kpi({
  label,
  icon: Icon,
  value,
  sub,
}: {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly value: ReactNode;
  readonly sub: string;
}) {
  return (
    <div data-slot="card" data-component="kpi" className={cn(CARD, "flex flex-col gap-1 p-4")}>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </span>
      <span className="tabular text-2xl font-medium tracking-tight">{value}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
  );
}

const NotAvailable = () => (
  <span className="text-base font-normal text-muted-foreground">Not available</span>
);

function Kpis({ report }: { readonly report: CostReportDto }) {
  const view = costView(report);
  const baselineTarget = report.baseline?.targetId;
  return (
    <>
      <Kpi
        label="Actual cost"
        icon={Coins}
        value={formatUsd(view.actual)}
        sub="what the routed targets cost"
      />
      <Kpi
        label="Baseline cost"
        icon={Scale}
        value={view.baseline === undefined ? <NotAvailable /> : formatUsd(view.baseline)}
        sub={
          baselineTarget === undefined
            ? "No priced target in the policy"
            : `everything to ${baselineTarget}`
        }
      />
      <Kpi
        label="Saving"
        icon={TrendingDown}
        value={
          view.saving === undefined ? (
            <NotAvailable />
          ) : (
            <>
              {formatUsd(view.saving)}{" "}
              {view.savingRatio === undefined ? null : (
                <span className="text-base text-success">{formatPercent(view.savingRatio)}</span>
              )}
            </>
          )
        }
        sub={view.saving === undefined ? "needs a baseline" : "baseline minus actual"}
      />
      <Kpi
        label="Requests served"
        icon={CircleCheck}
        value={formatNumber(view.requests)}
        sub="answered by a target"
      />
      <Kpi
        label="Tokens in · out"
        icon={ArrowDownUp}
        value={
          <>
            {formatNumber(view.inputTokens)} <span className="text-muted-foreground">·</span>{" "}
            {formatNumber(view.outputTokens)}
          </>
        }
        sub="reported by providers"
      />
      <Kpi
        label="Not served"
        icon={Ban}
        value={formatNumber(view.notServed.requests)}
        sub={`${view.notServed.blocked} blocked · ${view.notServed.failed} failed`}
      />
    </>
  );
}

function Breakdown({ report }: { readonly report: CostReportDto }) {
  const priced = report.baseline !== null;
  const keyLabel = KEY_LABEL[report.groupBy];
  const t = report.totals;
  const baseline = (value: number) => (priced ? formatUsd(value) : MISSING);
  const saving = (b: number, a: number) => (priced ? formatUsd(b - a) : MISSING);
  return (
    <>
      <div className="hidden md:block">
        <table data-slot="table" className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Cost by {keyLabel.toLowerCase()}, the accessible alternative to the chart
          </caption>
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th scope="col" className="h-9 pr-3 pl-4 text-left font-medium">
                {keyLabel}
              </th>
              {["Requests", "Input tokens", "Output tokens", "Actual", "Baseline"].map((h) => (
                <th key={h} scope="col" className="px-3 text-right font-medium">
                  {h}
                </th>
              ))}
              <th scope="col" className="pr-4 pl-3 text-right font-medium">
                Saving
              </th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.key} className="border-b">
                <th scope="row" className="py-2 pr-3 pl-4 text-left font-mono text-xs font-normal">
                  {row.key}
                </th>
                <td className="tabular px-3 py-2 text-right">{formatNumber(row.requests)}</td>
                <td className="tabular px-3 py-2 text-right">{formatNumber(row.inputTokens)}</td>
                <td className="tabular px-3 py-2 text-right">{formatNumber(row.outputTokens)}</td>
                <td className="tabular px-3 py-2 text-right">{formatUsd(row.costUsd)}</td>
                <td className="tabular px-3 py-2 text-right">{baseline(row.baselineCostUsd)}</td>
                <td className="tabular py-2 pr-4 pl-3 text-right">
                  {saving(row.baselineCostUsd, row.costUsd)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-medium" data-testid="cost-totals">
              <th scope="row" className="py-2.5 pr-3 pl-4 text-left">
                Total
              </th>
              <td className="tabular px-3 text-right">{formatNumber(t.requests)}</td>
              <td className="tabular px-3 text-right">{formatNumber(t.inputTokens)}</td>
              <td className="tabular px-3 text-right">{formatNumber(t.outputTokens)}</td>
              <td className="tabular px-3 text-right">{formatUsd(t.costUsd)}</td>
              <td className="tabular px-3 text-right">{baseline(t.baselineCostUsd)}</td>
              <td className="tabular pr-4 pl-3 text-right">
                {saving(t.baselineCostUsd, t.costUsd)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <ul className="divide-y md:hidden" aria-label={`Cost by ${keyLabel.toLowerCase()}`}>
        {report.rows.map((row) => (
          <li key={row.key} className="flex flex-col gap-1.5 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs">{row.key}</span>
              <span className="tabular text-sm font-medium">{formatUsd(row.costUsd)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="tabular">
                {formatNumber(row.requests)} req · {formatNumber(row.inputTokens)} in ·{" "}
                {formatNumber(row.outputTokens)} out
              </span>
              {priced ? (
                <span className="tabular">baseline {formatUsd(row.baselineCostUsd)}</span>
              ) : null}
            </div>
          </li>
        ))}
        <li className="flex items-center justify-between px-4 py-3 font-medium">
          <span>Total</span>
          <span className="tabular">
            {formatUsd(t.costUsd)}
            {priced ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                of {formatUsd(t.baselineCostUsd)}
              </span>
            ) : null}
          </span>
        </li>
      </ul>
    </>
  );
}

function CustomRange({
  active,
  onApply,
}: {
  readonly active: CostRange | undefined;
  readonly onApply: (range: CostRange) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | undefined>();
  const apply = (event: FormEvent) => {
    event.preventDefault();
    const range = customRange(start, end);
    if ("error" in range) {
      setError(range.error);
      return;
    }
    setError(undefined);
    onApply(range);
    setOpen(false);
  };
  const label =
    active === undefined
      ? "Custom"
      : `${active.from.slice(0, 10)} → ${new Date(Date.parse(active.to) - 86_400_000).toISOString().slice(0, 10)}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(active !== undefined && "border-foreground/40 bg-accent")}
        >
          <Calendar aria-hidden="true" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-3">
        <form onSubmit={apply} noValidate>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Custom range (UTC days)</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["Start", start, setStart],
                ["End", end, setEnd],
              ] as const
            ).map(([name, value, set]) => (
              <div key={name} className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-${name}`} className="text-xs text-muted-foreground">
                  {name}
                </label>
                <Input
                  id={`${id}-${name}`}
                  type="date"
                  value={value}
                  onChange={(event) => set(event.target.value)}
                  className={cn(
                    "bg-surface px-2 text-xs",
                    error !== undefined && "border-danger ring-[3px] ring-danger/20",
                  )}
                  aria-invalid={error !== undefined}
                  {...(error !== undefined && { "aria-describedby": `${id}-err` })}
                />
              </div>
            ))}
          </div>
          {error === undefined ? null : (
            <p id={`${id}-err`} className="mt-2 flex items-center gap-1.5 text-sm text-danger">
              <CircleX aria-hidden="true" className="size-3.5" />
              {error}
            </p>
          )}
          <Button type="submit" size="sm" className="mt-3 w-full">
            Apply range
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function CostAnalytics() {
  const [preset, setPreset] = useState<RangePreset | undefined>("30d");
  const [custom, setCustom] = useState<CostRange | undefined>();
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  // The preset is resolved once per choice, so polling the same range does not move it.
  const range = useMemo(
    () => (preset === undefined ? custom : presetRange(preset, new Date())),
    [preset, custom],
  );
  const cost = useQuery({
    queryKey: ["cost", range, groupBy],
    queryFn: () => api.cost({ from: range?.from ?? "", to: range?.to ?? "", groupBy }),
    enabled: range !== undefined,
  });
  const report = cost.data;
  const empty = report !== undefined && report.rows.length === 0;
  const keyLabel = KEY_LABEL[groupBy].toLowerCase();
  const rangeText =
    range === undefined ? "" : `${range.from.slice(0, 10)} and ${range.to.slice(0, 10)}`;

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 p-4 md:p-6">
      <section aria-labelledby="cost-controls-h" className="flex flex-wrap items-end gap-3">
        <h2 id="cost-controls-h" className="sr-only">
          Controls
        </h2>
        <div className="flex flex-col gap-1.5">
          <span id="cost-range-l" className="text-xs font-medium text-muted-foreground">
            Range
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              aria-labelledby="cost-range-l"
              value={preset ?? ""}
              onValueChange={(value) => {
                if (value === "") return;
                setPreset(value as RangePreset);
                setCustom(undefined);
              }}
            >
              {(Object.keys(PRESET_LABELS) as RangePreset[]).map((key) => (
                <ToggleGroupItem key={key} value={key} className="px-3">
                  {PRESET_LABELS[key]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <CustomRange
              active={custom}
              onApply={(next) => {
                setCustom(next);
                setPreset(undefined);
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 md:ml-auto">
          <span id="cost-group-l" className="text-xs font-medium text-muted-foreground">
            Group by
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-labelledby="cost-group-l"
            value={groupBy}
            onValueChange={(value) => {
              if (value !== "") setGroupBy(value as GroupBy);
            }}
          >
            <ToggleGroupItem value="day" className="px-3">
              Day
            </ToggleGroupItem>
            <ToggleGroupItem value="route" className="px-3">
              Route
            </ToggleGroupItem>
            <ToggleGroupItem value="model" className="px-3">
              Model
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </section>

      {cost.isError ? (
        <section data-slot="card" className={CARD} aria-label="Cost report">
          <RegionError error={cost.error} onRetry={() => void cost.refetch()} />
        </section>
      ) : (
        <>
          <section aria-labelledby="kpi-h">
            <h2 id="kpi-h" className="sr-only">
              Key figures
            </h2>
            <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-3">
              {report === undefined ? (
                Array.from({ length: 6 }, (_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders
                  <div key={i} data-slot="card" className={cn(CARD, "flex flex-col gap-2 p-4")}>
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-7 w-28" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                ))
              ) : (
                <Kpis report={report} />
              )}
            </div>
          </section>
          <section aria-labelledby="chart-h" data-slot="card" className={cn(CARD, "p-4 md:p-6")}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="chart-h" className="text-sm font-semibold">
                Actual vs baseline by {keyLabel}
              </h2>
              <span className="text-xs text-muted-foreground">Days are UTC</span>
            </div>
            {report === undefined ? (
              <Skeleton className="h-64 w-full" />
            ) : empty ? (
              <RegionEmpty icon={CalendarX}>No requests between {rangeText} UTC.</RegionEmpty>
            ) : (
              <CostChart report={report} />
            )}
          </section>
          <section aria-labelledby="breakdown-h" data-slot="card" className={CARD}>
            <h2 id="breakdown-h" className="border-b px-4 py-3 text-sm font-semibold">
              Breakdown
            </h2>
            {report === undefined ? (
              <RegionLoading rows={4} />
            ) : empty ? (
              <RegionEmpty icon={CalendarX}>Nothing to break down in this range.</RegionEmpty>
            ) : (
              <Breakdown report={report} />
            )}
          </section>
          {report === undefined ? null : (
            <p
              data-component="baseline-note"
              className="flex items-start gap-1.5 text-xs text-muted-foreground"
            >
              <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              {report.baseline === null ? (
                "Baseline unavailable: no target in the policy has prices. Add pricing to a target to compare."
              ) : (
                <span>
                  Baseline: every request priced at{" "}
                  <span className="font-mono text-foreground">{report.baseline.targetId}</span>, $
                  {report.baseline.inputUsdPerMillion.toFixed(2)} per M input tokens and $
                  {report.baseline.outputUsdPerMillion.toFixed(2)} per M output tokens.
                </span>
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}
