"use client";

/**
 * Actual vs baseline cost per key (`design/components.md` "Cost chart"; spec 008 US7-1,
 * US7-2, US7-6): two bars per UTC day, route or model. Actual is solid `--chart-1`, the
 * baseline is hatched `--chart-2`, so the series differ by more than colour; the legend
 * says so in words, and the breakdown table below carries the same numbers.
 */
import type { CostReportDto } from "@tamiz/contracts";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from "@/components/ui/chart";
import { formatNumber, formatUsd } from "@/features/shared/format";

const config = {
  actual: { label: "Actual (solid)", color: "var(--chart-1)" },
  baseline: { label: "Baseline (hatched)", color: "var(--chart-2)" },
} satisfies ChartConfig;

type Row = CostReportDto["rows"][number];

interface Point {
  readonly key: string;
  readonly actual: number;
  readonly baseline?: number;
  readonly row: Row;
}

function Tip({
  active,
  payload,
  showBaseline,
}: {
  readonly active?: boolean;
  readonly payload?: ReadonlyArray<{ readonly payload: Point }>;
  readonly showBaseline: boolean;
}) {
  const point = payload?.[0]?.payload;
  if (active !== true || point === undefined) return null;
  const { row } = point;
  return (
    <div className="grid min-w-44 gap-1 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      <p className="font-mono font-medium">{point.key}</p>
      <p className="flex justify-between gap-4">
        <span className="text-muted-foreground">Actual</span>
        <span className="tabular">{formatUsd(row.costUsd)}</span>
      </p>
      {showBaseline ? (
        <p className="flex justify-between gap-4">
          <span className="text-muted-foreground">Baseline</span>
          <span className="tabular">{formatUsd(row.baselineCostUsd)}</span>
        </p>
      ) : null}
      <p className="flex justify-between gap-4">
        <span className="text-muted-foreground">Requests</span>
        <span className="tabular">{formatNumber(row.requests)}</span>
      </p>
      <p className="flex justify-between gap-4">
        <span className="text-muted-foreground">Tokens in · out</span>
        <span className="tabular">
          {formatNumber(row.inputTokens)} · {formatNumber(row.outputTokens)}
        </span>
      </p>
    </div>
  );
}

export function CostChart({ report }: { readonly report: CostReportDto }) {
  const showBaseline = report.baseline !== null;
  const data: Point[] = report.rows.map((row) => ({
    key: row.key,
    actual: row.costUsd,
    ...(showBaseline && { baseline: row.baselineCostUsd }),
    row,
  }));
  return (
    <ChartContainer
      config={config}
      className="aspect-auto h-64 w-full md:h-72"
      aria-hidden="true"
      data-component="cost-chart"
    >
      {/* The breakdown table is the accessible version (US7-6): the chart is hidden from
          assistive tech, so it must not take keyboard focus either. */}
      <BarChart
        data={data}
        margin={{ left: 4, right: 4, top: 8 }}
        barGap={2}
        accessibilityLayer={false}
      >
        <defs>
          <pattern
            id="baseline-hatch"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(135)"
          >
            <rect width="6" height="6" fill="var(--color-baseline)" fillOpacity="0.25" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-baseline)" strokeWidth="3" />
          </pattern>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="key"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={report.groupBy === "day" ? 4 : 0}
          tickFormatter={(key: string) => (report.groupBy === "day" ? key.slice(5) : key)}
          className="font-mono"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(value: number) => formatUsd(value)}
        />
        <ChartTooltip
          cursor={{ fillOpacity: 0.08 }}
          content={<Tip showBaseline={showBaseline} />}
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="actual" fill="var(--color-actual)" radius={[3, 3, 0, 0]} />
        {showBaseline ? (
          <Bar
            dataKey="baseline"
            fill="url(#baseline-hatch)"
            stroke="var(--color-baseline)"
            strokeWidth={1}
            radius={[3, 3, 0, 0]}
          />
        ) : null}
      </BarChart>
    </ChartContainer>
  );
}
