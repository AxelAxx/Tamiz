"use client";

/**
 * Provider health (design `providers.html`; spec 008 US8): every target the policy declares,
 * idle ones included, with its circuit state now and its attempts, errors, error rate and
 * latency over a window of 5, 15 or 60 minutes. Refetched every 10 s; an open circuit's
 * cool-down counts down each second in between.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CircuitBadge, ResidencyBadge } from "@/features/shared/badges";
import { CARD } from "@/features/shared/card";
import { formatAgo, formatLatency, formatNumber } from "@/features/shared/format";
import { RegionEmpty, RegionError, StaleNote } from "@/features/shared/region-states";
import { useNow } from "@/features/shared/use-now";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  cooldownSeconds,
  DEFAULT_WINDOW,
  formatErrorRate,
  isHighErrorRate,
  isIdle,
  REFRESH_MS,
  type TargetHealth,
  WINDOWS,
  type WindowMinutes,
} from "./model";

function Figure({
  label,
  value,
  danger = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly danger?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("tabular text-sm font-semibold", danger && "text-danger")}>{value}</dd>
    </div>
  );
}

function TargetCard({
  target,
  receivedAt,
  now,
}: {
  readonly target: TargetHealth;
  readonly receivedAt: number;
  readonly now: number;
}) {
  const { window } = target;
  const open = target.circuit === "open";
  const idle = isIdle(target);
  const seconds =
    open && target.cooldownRemainingMs !== undefined
      ? cooldownSeconds(target.cooldownRemainingMs, receivedAt, now)
      : undefined;
  return (
    <section
      data-component="provider-card"
      data-target={target.targetId}
      data-circuit={target.circuit}
      aria-labelledby={`target-${target.targetId}`}
      className={cn(
        CARD,
        "flex min-w-0 flex-col gap-3 p-4",
        open && "border-danger/40 ring-1 ring-danger/20",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={`target-${target.targetId}`} className="truncate font-mono text-sm font-semibold">
            {target.targetId}
          </h2>
          <p className="truncate text-xs text-muted-foreground" title={target.model}>
            {target.provider} · <span className="font-mono">{target.model}</span>
          </p>
        </div>
        <ResidencyBadge residency={target.residency} />
      </header>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CircuitBadge
          state={target.circuit}
          {...(seconds !== undefined && { cooldownSeconds: seconds })}
        />
        {idle && !open ? (
          <span className="text-xs text-muted-foreground">idle: no attempts in this window</span>
        ) : null}
      </div>
      {open ? (
        <p className="text-xs text-muted-foreground">
          requests skip this target; fallbacks take over
        </p>
      ) : null}
      {target.circuit === "half_open" ? (
        <p className="text-xs text-muted-foreground">
          the next request is a trial: success closes the circuit
        </p>
      ) : null}
      <dl className="grid grid-cols-3 gap-x-4 gap-y-3 border-t pt-3">
        <Figure label="Attempts" value={formatNumber(window.requests)} />
        <Figure label="Errors" value={formatNumber(window.errors)} danger={window.errors > 0} />
        <Figure
          label="Error rate"
          value={formatErrorRate(target)}
          danger={isHighErrorRate(target)}
        />
        <Figure label="Latency p50" value={formatLatency(window.latencyP50Ms ?? undefined)} />
        <Figure label="Latency p95" value={formatLatency(window.latencyP95Ms ?? undefined)} />
      </dl>
    </section>
  );
}

function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {Array.from({ length: 4 }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholder cards
        <Skeleton key={index} className="h-56 rounded-xl" />
      ))}
    </div>
  );
}

export function ProviderHealth() {
  const [windowMinutes, setWindowMinutes] = useState<WindowMinutes>(DEFAULT_WINDOW);
  const now = useNow();
  const query = useQuery({
    queryKey: ["providers", windowMinutes],
    queryFn: () => api.providers({ windowMinutes }),
    refetchInterval: REFRESH_MS,
    placeholderData: keepPreviousData,
  });
  const report = query.data;
  const receivedAt = query.dataUpdatedAt;

  // A cool-down that reached zero means the circuit is half-open now: ask again at once
  // rather than wait for the next 10-second refresh.
  const expired =
    report?.targets.some(
      (t) =>
        t.circuit === "open" &&
        t.cooldownRemainingMs !== undefined &&
        cooldownSeconds(t.cooldownRemainingMs, receivedAt, now) === 0,
    ) ?? false;
  const { isFetching, refetch } = query;
  useEffect(() => {
    if (expired && !isFetching && now - receivedAt > 1000) void refetch();
  }, [expired, isFetching, now, receivedAt, refetch]);

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span id="provider-window-l" className="sr-only">
          Window
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-labelledby="provider-window-l"
          value={String(windowMinutes)}
          onValueChange={(value) => {
            if (value !== "") setWindowMinutes(Number(value) as WindowMinutes);
          }}
        >
          {WINDOWS.map((minutes) => (
            <ToggleGroupItem key={minutes} value={String(minutes)} className="px-3">
              {minutes} min
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {report === undefined ? null : (
          <p data-component="provider-window" className="text-xs text-muted-foreground">
            Last <span className="tabular">{report.windowMinutes}</span> min · updated{" "}
            <span className="tabular">{formatAgo((now - receivedAt) / 1000)}</span>
          </p>
        )}
        {query.isError && report !== undefined ? (
          <StaleNote updatedAt={report.generatedAt} />
        ) : null}
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError && report === undefined ? (
        <div className={CARD}>
          <RegionError error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : report === undefined || report.targets.length === 0 ? (
        <div className={CARD}>
          <RegionEmpty>The active policy declares no targets.</RegionEmpty>
        </div>
      ) : (
        <div
          data-component="provider-grid"
          aria-busy={query.isPlaceholderData}
          className={cn(
            "grid gap-4 sm:grid-cols-2 xl:grid-cols-4",
            query.isPlaceholderData && "opacity-60 transition-opacity",
          )}
        >
          {report.targets.map((target) => (
            <TargetCard key={target.targetId} target={target} receivedAt={receivedAt} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}
