"use client";

/**
 * The audit log's filter bar (`design/components.md` "Filter bar"; spec 008 US4-1, US4-3,
 * US4-5): a date range (presets or a custom range in UTC), one select per filter with a
 * visible label, the active filters as removable chips, and "Clear all". On phone it
 * collapses into a "Filters (N)" button that opens a bottom sheet with the same controls.
 */
import {
  AuditOutcomeSchema,
  PrivacyActionSchema,
  PrivacyEntityKindSchema,
  SensitivityLevelSchema,
} from "@tamiz/contracts";
import { Calendar, CircleX, ListFilter, X } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { type AuditFilters, FILTER_LABELS, type FilterKey, rangeError } from "./filters";

type SelectKey = Exclude<FilterKey, "from" | "to">;

export interface FilterOptions {
  readonly route: ReadonlyArray<string> | undefined;
  readonly rule: ReadonlyArray<string> | undefined;
}

const FIXED_OPTIONS: Readonly<Record<Exclude<SelectKey, "route" | "rule">, readonly string[]>> = {
  // From the contract, levels first and `unknown` last.
  sensitivity: [...SensitivityLevelSchema.options, "unknown"],
  action: PrivacyActionSchema.options,
  entity: PrivacyEntityKindSchema.options,
  outcome: AuditOutcomeSchema.options,
};

const SELECT_KEYS: ReadonlyArray<SelectKey> = [
  "route",
  "rule",
  "sensitivity",
  "action",
  "entity",
  "outcome",
];

/** How a value reads in the UI: `restrict_to_local` is "local only" everywhere. */
export function optionName(key: FilterKey, value: string): string {
  return key === "action" && value === "restrict_to_local" ? "local only" : value;
}

const PRESETS: ReadonlyArray<readonly [string, number]> = [
  ["Last hour", 3_600_000],
  ["Last 24 hours", 86_400_000],
  ["Last 7 days", 7 * 86_400_000],
  ["Last 30 days", 30 * 86_400_000],
];

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-surface px-2.5 text-sm shadow-xs disabled:opacity-50";

/** `2026-11-01T12:00` (a datetime-local value) read as UTC; undefined when empty or invalid. */
function fromLocalInput(value: string): string | undefined {
  if (value === "") return undefined;
  const ms = Date.parse(`${value}:00.000Z`);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

const toLocalInput = (iso: string | undefined) => (iso === undefined ? "" : iso.slice(0, 16));

function rangeLabel(filters: AuditFilters): string {
  const { from, to } = filters;
  if (from === undefined && to === undefined) return "Any time";
  const short = (iso: string) => iso.slice(0, 16).replace("T", " ");
  return `${from === undefined ? "…" : short(from)} → ${to === undefined ? "now" : short(to)}`;
}

function DateRange({
  filters,
  onChange,
}: {
  readonly filters: AuditFilters;
  readonly onChange: (next: Pick<AuditFilters, "from" | "to">) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(toLocalInput(filters.from));
  const [to, setTo] = useState(toLocalInput(filters.to));
  const [error, setError] = useState<string | undefined>();

  const preset = (ms: number) => {
    const now = Date.now();
    onChange({ from: new Date(now - ms).toISOString(), to: undefined });
    setError(undefined);
    setOpen(false);
  };
  const apply = (event: FormEvent) => {
    event.preventDefault();
    const range = { from: fromLocalInput(from), to: fromLocalInput(to) };
    const problem = rangeError(range.from, range.to);
    setError(problem);
    if (problem !== undefined) return; // nothing is sent (US4-5)
    onChange(range);
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-xs font-medium text-muted-foreground">
        Date range
      </span>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setFrom(toLocalInput(filters.from));
            setTo(toLocalInput(filters.to));
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            aria-labelledby={`${id}-label ${id}-value`}
            className={cn(
              "h-9 justify-start bg-surface px-3 font-normal",
              error !== undefined && "border-danger text-danger",
            )}
          >
            <Calendar aria-hidden="true" />
            <span id={`${id}-value`}>{rangeLabel(filters)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-3">
          <div className="grid grid-cols-2 gap-1">
            {PRESETS.map(([label, ms]) => (
              <button
                key={label}
                type="button"
                className="h-8 rounded-md px-2 text-left text-sm hover:bg-accent"
                onClick={() => preset(ms)}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className="h-8 rounded-md px-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                onChange({ from: undefined, to: undefined });
                setError(undefined);
                setOpen(false);
              }}
            >
              Any time
            </button>
          </div>
          <hr className="my-3 border-border" />
          <form onSubmit={apply} noValidate>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Custom range (UTC)</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["From", from, setFrom],
                  ["To", to, setTo],
                ] as const
              ).map(([label, value, set]) => (
                <div key={label} className="flex flex-col gap-1.5">
                  <label htmlFor={`${id}-${label}`} className="text-xs text-muted-foreground">
                    {label}
                  </label>
                  <Input
                    id={`${id}-${label}`}
                    type="datetime-local"
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
    </div>
  );
}

function Selects({
  filters,
  options,
  onChange,
  stacked,
}: {
  readonly filters: AuditFilters;
  readonly options: FilterOptions;
  readonly onChange: (key: SelectKey, value: string | undefined) => void;
  readonly stacked: boolean;
}) {
  const id = useId();
  return (
    <>
      {SELECT_KEYS.map((key) => {
        const values = key === "route" || key === "rule" ? options[key] : FIXED_OPTIONS[key];
        const current = filters[key];
        // A value from the URL that the pickers do not list yet still shows as selected.
        const listed =
          values === undefined || current === undefined || values.includes(current)
            ? values
            : [...values, current];
        return (
          <div key={key} className={cn("flex flex-col gap-1.5", !stacked && "w-full md:w-40")}>
            <label htmlFor={`${id}-${key}`} className="text-xs font-medium text-muted-foreground">
              {FILTER_LABELS[key]}
            </label>
            {listed === undefined ? (
              <Skeleton
                className="h-9 w-full"
                aria-label={`${FILTER_LABELS[key]} options loading`}
              />
            ) : (
              <select
                id={`${id}-${key}`}
                className={SELECT_CLASS}
                value={current ?? ""}
                onChange={(event) => onChange(key, event.target.value || undefined)}
              >
                <option value="">Any</option>
                {listed.map((value) => (
                  <option key={value} value={value}>
                    {optionName(key, value)}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}
    </>
  );
}

export function FilterBar({
  filters,
  options,
  onChange,
}: {
  readonly filters: AuditFilters;
  readonly options: FilterOptions;
  readonly onChange: (next: AuditFilters) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const set = (key: SelectKey, value: string | undefined) => onChange({ ...filters, [key]: value });
  const setRange = (range: Pick<AuditFilters, "from" | "to">) => onChange({ ...filters, ...range });
  const active = SELECT_KEYS.filter((key) => filters[key] !== undefined);
  const count = active.length + (filters.from !== undefined || filters.to !== undefined ? 1 : 0);

  return (
    <section
      aria-labelledby="filters-bar-h"
      data-component="filter-bar"
      className="flex flex-col gap-3"
    >
      <h2 id="filters-bar-h" className="sr-only">
        Filters
      </h2>
      <div className="hidden flex-wrap items-end gap-3 md:flex">
        <DateRange filters={filters} onChange={setRange} />
        <Selects filters={filters} options={options} onChange={set} stacked={false} />
      </div>
      <div className="flex items-center gap-2 md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="h-11">
              <ListFilter aria-hidden="true" />
              Filters ({count})
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[85svh] rounded-t-xl"
            closeLabel="Close filters"
            aria-describedby={undefined}
          >
            <div className="flex items-center border-b py-3 pr-14 pl-4">
              <SheetTitle className="text-base font-semibold">Filters</SheetTitle>
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto p-4">
              <DateRange filters={filters} onChange={setRange} />
              <Selects filters={filters} options={options} onChange={set} stacked />
            </div>
            <div className="flex gap-2 border-t p-4">
              <Button variant="outline" size="lg" className="flex-1" onClick={() => onChange({})}>
                Clear all
              </Button>
              <Button size="lg" className="flex-1" onClick={() => setSheetOpen(false)}>
                Show results
              </Button>
            </div>
          </SheetContent>
        </Sheet>
        <span className="text-sm text-muted-foreground">{rangeLabel(filters)}</span>
      </div>
      {active.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {active.map((key) => (
            <span
              key={key}
              data-slot="badge"
              className="inline-flex h-7 items-center gap-1 rounded-full border bg-surface pr-1 pl-2.5 text-xs"
            >
              <span className="text-muted-foreground">{FILTER_LABELS[key].toLowerCase()} =</span>
              <span className="font-mono">{optionName(key, filters[key] ?? "")}</span>
              <button
                type="button"
                className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={`Remove filter ${FILTER_LABELS[key]}`}
                onClick={() => set(key, undefined)}
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          ))}
          <Button variant="ghost" size="sm" onClick={() => onChange({})}>
            Clear all
          </Button>
        </div>
      ) : null}
    </section>
  );
}
