"use client";

/**
 * The audit log (design `audit.html`; spec 008 US4, research R-07): the entries newest
 * first, filtered by the URL's search params, paged with the gateway's keyset cursor ("Load
 * older"; the gateway does not count, so there are no page numbers). Activating a row opens
 * the same detail as live traffic.
 */
import type { AuditEntryDto } from "@tamiz/contracts";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronsDown, CircleX, LoaderCircle, SearchX, TriangleAlert } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EntryDetailSheet } from "@/features/shared/entry-detail";
import { RegionEmpty, RegionError, RegionLoading } from "@/features/shared/region-states";
import { TrafficList } from "@/features/shared/traffic-list";
import { api } from "@/lib/api-client";
import { FilterBar, optionName } from "./filter-bar";
import {
  type AuditFilters,
  FILTER_KEYS,
  FILTER_LABELS,
  filtersFromParams,
  paramsFromFilters,
} from "./filters";

const CARD = "rounded-xl border bg-card text-card-foreground shadow-xs";
const PAGE_SIZE = 50;

/** Rules of the active policy, `default` included, for the rule picker. */
function useRuleOptions(): ReadonlyArray<string> | undefined {
  const policy = useQuery({ queryKey: ["policy"], queryFn: api.policy, staleTime: 60_000 });
  if (policy.data === undefined) return policy.isError ? ["default"] : undefined;
  return [...policy.data.policy.rules.map((rule) => rule.id), "default"];
}

function useRouteOptions(): ReadonlyArray<string> | undefined {
  const providers = useQuery({
    queryKey: ["providers", 15],
    queryFn: () => api.providers({ windowMinutes: 15 }),
    staleTime: 60_000,
  });
  if (providers.data === undefined) return providers.isError ? [] : undefined;
  return providers.data.targets.map((target) => target.targetId);
}

export function AuditLog() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { filters, dropped } = useMemo(
    () => filtersFromParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const setFilters = (next: AuditFilters) => {
    const query = paramsFromFilters(next).toString();
    router.replace(query === "" ? pathname : `${pathname}?${query}`, { scroll: false });
  };
  const options = { route: useRouteOptions(), rule: useRuleOptions() };

  const pages = useInfiniteQuery({
    queryKey: ["audit", filters],
    queryFn: ({ pageParam }) =>
      api.audit({
        ...filters,
        limit: PAGE_SIZE,
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = useMemo(() => pages.data?.pages.flatMap((page) => page.entries) ?? [], [pages.data]);
  const [selected, setSelected] = useState<AuditEntryDto | undefined>();

  const active = FILTER_KEYS.filter((key) => filters[key] !== undefined);
  let region: ReactNode;
  if (pages.isPending) {
    region = <RegionLoading rows={8} />;
  } else if (pages.isError && rows.length === 0) {
    region = <RegionError error={pages.error} onRetry={() => void pages.refetch()} />;
  } else if (rows.length === 0) {
    region =
      active.length === 0 ? (
        <RegionEmpty icon={SearchX}>No audit entries yet.</RegionEmpty>
      ) : (
        <RegionEmpty
          icon={SearchX}
          action={
            <Button variant="outline" size="sm" onClick={() => setFilters({})}>
              Clear filters
            </Button>
          }
        >
          No entries match:{" "}
          {active.map((key, i) => (
            <span key={key}>
              {i > 0 ? ", " : ""}
              {FILTER_LABELS[key].toLowerCase()} ={" "}
              <span className="font-mono text-foreground">
                {optionName(key, filters[key] ?? "")}
              </span>
            </span>
          ))}
          .
        </RegionEmpty>
      );
  } else {
    region = (
      <TrafficList variant="audit" rows={rows} selectedId={selected?.id} onOpen={setSelected} />
    );
  }

  let more: ReactNode = null;
  if (pages.isFetchNextPageError) {
    more = (
      <p className="flex items-center gap-2 text-sm text-danger">
        <CircleX aria-hidden="true" className="size-3.5" />
        Could not load older entries.
        <Button variant="outline" size="sm" onClick={() => void pages.fetchNextPage()}>
          Retry
        </Button>
      </p>
    );
  } else if (pages.isFetchingNextPage) {
    more = (
      <Button variant="outline" size="sm" disabled>
        <LoaderCircle aria-hidden="true" className="animate-spin" />
        Loading older…
      </Button>
    );
  } else if (pages.hasNextPage) {
    more = (
      <Button variant="outline" size="sm" onClick={() => void pages.fetchNextPage()}>
        <ChevronsDown aria-hidden="true" />
        Load older
      </Button>
    );
  } else {
    more = (
      <Button variant="outline" size="sm" disabled>
        No older entries
      </Button>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 p-4 md:p-6">
      {dropped.length > 0 ? (
        <div
          data-slot="alert"
          role="status"
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            Ignored {dropped.length === 1 ? "an invalid filter" : "invalid filters"} in the address:{" "}
            {dropped.map((key) => FILTER_LABELS[key].toLowerCase()).join(", ")}.
          </p>
        </div>
      ) : null}
      <FilterBar filters={filters} options={options} onChange={setFilters} />
      <section aria-labelledby="audit-h" data-slot="card" className={CARD}>
        <h2 id="audit-h" className="sr-only">
          Audit entries
        </h2>
        {region}
        {rows.length > 0 ? (
          <div className="flex flex-col items-center gap-2 border-t px-4 py-3 md:flex-row md:justify-between">
            <p className="tabular text-sm text-muted-foreground">
              {rows.length} {rows.length === 1 ? "entry" : "entries"} loaded
            </p>
            {more}
          </div>
        ) : null}
      </section>
      <EntryDetailSheet
        state={selected === undefined ? undefined : { kind: "entry", entry: selected }}
        onClose={() => setSelected(undefined)}
      />
    </div>
  );
}
