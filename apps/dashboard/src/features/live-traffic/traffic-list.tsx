"use client";

/**
 * The live traffic rows (design `live.html` `trafficTable` / `trafficCards`; spec 008
 * US2-1 … US2-3, US2-7). Desktop and tablet: a fixed five-column table with two lines per
 * cell, so it never scrolls sideways. Phone: one stacked card per entry. Each row opens the
 * entry detail. Nothing here can show content: an entry has none.
 */
import type { AuditEntryDto } from "@tamiz/contracts";
import { useEffect, useState } from "react";
import { OutcomeBadge, PrivacyActionBadge, ResidencyBadge } from "@/features/shared/badges";
import { BLOCK_REASONS } from "@/features/shared/entry-detail";
import { formatAgo, formatLatency, formatUsd, formatUtc } from "@/features/shared/format";
import {
  EntityChips,
  FallbackMarker,
  SensitivityIndicator,
  TargetLabel,
} from "@/features/shared/privacy";
import { cn } from "@/lib/utils";

/** Re-renders every second so "12 s ago" stays true. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Routed rows show where the request went; blocked and failed rows say so instead. */
function routedTarget(entry: AuditEntryDto) {
  return entry.target !== undefined &&
    (entry.outcome === "answered" || entry.outcome === "cancelled")
    ? entry.target
    : undefined;
}

/** Why a request did not go anywhere, in words (US2-3). */
export function notRoutedReason(entry: AuditEntryDto): string {
  if (entry.blockReason !== undefined) return BLOCK_REASONS[entry.blockReason];
  if (entry.outcome === "failed") {
    return entry.errorType === undefined ? "all targets failed" : `failed: ${entry.errorType}`;
  }
  return "";
}

function RouteLine({
  entry,
  interactiveFallback = true,
}: {
  readonly entry: AuditEntryDto;
  readonly interactiveFallback?: boolean;
}) {
  const target = routedTarget(entry);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {target === undefined ? (
        <OutcomeBadge outcome={entry.outcome} />
      ) : (
        <>
          <ResidencyBadge residency={target.residency} />
          <TargetLabel target={target} />
        </>
      )}
      <FallbackMarker abandoned={entry.abandoned} interactive={interactiveFallback} />
    </div>
  );
}

const age = (entry: AuditEntryDto, now: number) => (now - Date.parse(entry.startedAt)) / 1000;

export function TrafficList({
  rows,
  highlighted,
  selectedId,
  onOpen,
}: {
  readonly rows: ReadonlyArray<AuditEntryDto>;
  readonly highlighted: ReadonlySet<string>;
  readonly selectedId: string | undefined;
  readonly onOpen: (entry: AuditEntryDto) => void;
}) {
  const now = useNow();
  return (
    <>
      <div className="hidden md:block">
        <table data-slot="table" className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">
            Requests, newest first. Activate a row to see its details.
          </caption>
          <thead data-slot="table-header">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th scope="col" className="h-9 w-[29%] pr-3 pl-4 font-medium">
                Request
              </th>
              <th scope="col" className="h-9 w-[18%] px-3 font-medium">
                Rule
              </th>
              <th scope="col" className="h-9 w-[17%] px-3 font-medium">
                Privacy
              </th>
              <th scope="col" className="h-9 px-3 font-medium">
                Entities
              </th>
              <th scope="col" className="h-9 w-[13%] pr-4 pl-2 text-right font-medium xl:w-[11%]">
                Cost
              </th>
            </tr>
          </thead>
          <tbody data-slot="table-body">
            {rows.map((entry) => {
              const routed = routedTarget(entry) !== undefined;
              return (
                <tr
                  key={entry.id}
                  data-slot="table-row"
                  data-request-id={entry.requestId}
                  onClick={() => onOpen(entry)}
                  className={cn(
                    "cursor-pointer border-b transition-colors last:border-b-0 hover:bg-accent/60",
                    highlighted.has(entry.id) && "animate-row-in",
                    selectedId === entry.id && "bg-accent",
                  )}
                >
                  <td className="py-2.5 pr-3 pl-4 align-top">
                    <RouteLine entry={entry} />
                    <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                      <button
                        type="button"
                        className="tabular shrink-0 rounded-sm hover:text-foreground"
                        title={formatUtc(entry.startedAt)}
                        aria-label={`${formatAgo(age(entry, now))}, open details for request ${entry.requestId}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen(entry);
                        }}
                      >
                        {formatAgo(age(entry, now))}
                      </button>
                      {routed ? (
                        <span className="hidden truncate xl:inline">
                          · client <span className="font-mono">{entry.clientId}</span>
                        </span>
                      ) : (
                        <span className="truncate">· {notRoutedReason(entry)}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="truncate font-mono text-xs leading-5" title={entry.ruleId}>
                      {entry.ruleId}
                    </div>
                    <div className="mt-1 hidden truncate text-xs text-muted-foreground xl:block">
                      {entry.taskType} · {entry.size}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="flex h-5 items-center">
                      <SensitivityIndicator level={entry.sensitivity} />
                    </div>
                    <div className="mt-1">
                      <PrivacyActionBadge action={entry.privacyAction} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <EntityChips entities={entry.entities} />
                  </td>
                  <td className="py-2.5 pr-4 pl-2 text-right align-top">
                    <div className="tabular leading-5">{formatUsd(entry.costUsd)}</div>
                    <div className="tabular mt-1 hidden text-xs text-muted-foreground xl:block">
                      {formatLatency(entry.latencyMs)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="divide-y md:hidden" aria-label="Requests, newest first">
        {rows.map((entry) => {
          const target = routedTarget(entry);
          return (
            <li
              key={entry.id}
              className={cn(
                "hover:bg-accent/60",
                highlighted.has(entry.id) && "animate-row-in",
                selectedId === entry.id && "bg-accent",
              )}
            >
              <button
                type="button"
                className="flex w-full flex-col gap-2 px-4 py-3 text-left"
                aria-label={`Open details for request ${entry.requestId}`}
                onClick={() => onOpen(entry)}
              >
                <span className="flex w-full items-center gap-1.5">
                  {target === undefined ? (
                    <>
                      <OutcomeBadge outcome={entry.outcome} />
                      <span className="truncate text-xs text-muted-foreground">
                        {notRoutedReason(entry)}
                      </span>
                    </>
                  ) : (
                    <>
                      <ResidencyBadge residency={target.residency} />
                      <span className="truncate font-mono text-xs">{target.id}</span>
                    </>
                  )}
                  <FallbackMarker abandoned={entry.abandoned} interactive={false} />
                  <span className="tabular ml-auto shrink-0 text-xs text-muted-foreground">
                    {formatAgo(age(entry, now))}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1">
                  <EntityChips entities={entry.entities} emptyLabel="No personal data" />
                </span>
                <span className="flex w-full items-center gap-2">
                  <PrivacyActionBadge action={entry.privacyAction} />
                  <span className="text-xs text-muted-foreground">{entry.sensitivity}</span>
                  <span className="tabular ml-auto text-sm">{formatUsd(entry.costUsd)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
