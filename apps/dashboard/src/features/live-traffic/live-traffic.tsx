"use client";

/**
 * The live traffic screen (design `live.html`; spec 008 US2, US9-3, US9-4): stream header,
 * summary of where the shown requests went, the rows, and the entry detail.
 */
import type { AuditEntryDto } from "@tamiz/contracts";
import {
  ArrowRight,
  Ban,
  CirclePause,
  FlaskConical,
  Globe,
  House,
  LoaderCircle,
  LockKeyhole,
  type LucideIcon,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { BADGE, TONE, type Tone } from "@/features/shared/badges";
import { EntryDetailSheet } from "@/features/shared/entry-detail";
import { formatUtcTime } from "@/features/shared/format";
import { CRITICAL_KINDS, sortedEntities } from "@/features/shared/privacy";
import { RegionEmpty, RegionError, RegionLoading } from "@/features/shared/region-states";
import { TrafficList } from "@/features/shared/traffic-list";
import { cn } from "@/lib/utils";
import { type LiveStatus, useLiveTraffic } from "./use-live-traffic";

const CARD = "rounded-xl border bg-card text-card-foreground shadow-xs";

const clock = (ms: number | undefined) =>
  ms === undefined ? "" : formatUtcTime(new Date(ms).toISOString());

function StreamStatus({
  status,
  failingSince,
}: {
  readonly status: LiveStatus;
  readonly failingSince: number | undefined;
}) {
  const looks: Record<LiveStatus, { tone: Tone; label: string; icon?: LucideIcon }> = {
    live: { tone: "success", label: "Live" },
    paused: { tone: "neutral", label: "Paused", icon: CirclePause },
    retrying: {
      tone: "warning",
      label: `Retrying since ${clock(failingSince)}`,
      icon: RefreshCw,
    },
    connecting: { tone: "neutral", label: "Connecting…", icon: LoaderCircle },
    error: { tone: "danger", label: "Disconnected", icon: WifiOff },
  };
  const look = looks[status];
  const Icon = look.icon;
  return (
    <span data-slot="badge" data-component="stream-status" className={cn(BADGE, TONE[look.tone])}>
      {Icon === undefined ? (
        <span className="relative mx-0.5 flex size-2" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
      ) : (
        <Icon
          aria-hidden="true"
          className={cn(
            "size-3.5",
            status === "connecting" && "animate-spin motion-reduce:animate-none",
          )}
        />
      )}
      {look.label}
    </span>
  );
}

function Summary({ rows }: { readonly rows: ReadonlyArray<AuditEntryDto> }) {
  const residency = (e: AuditEntryDto) =>
    e.target !== undefined && e.outcome === "answered" ? e.target.residency : undefined;
  const count = (test: (e: AuditEntryDto) => boolean) => rows.filter(test).length;
  const shares: ReadonlyArray<readonly [string, LucideIcon, string, string, number]> = [
    ["Local", House, "text-local", "bg-local", count((e) => residency(e) === "local")],
    ["EU", ShieldCheck, "text-eu", "bg-eu", count((e) => residency(e) === "eu")],
    [
      "External",
      Globe,
      "text-external",
      "bg-external",
      count((e) => residency(e) === "us" || residency(e) === "global"),
    ],
    [
      "Blocked or failed",
      Ban,
      "text-danger",
      "bg-danger",
      count((e) => e.outcome === "blocked" || e.outcome === "failed"),
    ],
  ];
  const total = shares.reduce((n, share) => n + share[4], 0) || 1;
  const critical = count((e) => sortedEntities(e.entities).some(([k]) => CRITICAL_KINDS.has(k)));
  return (
    <section aria-labelledby="summary-h" data-slot="card" className={CARD}>
      <h2 id="summary-h" className="sr-only">
        Where the shown requests went
      </h2>
      <dl className="grid grid-cols-2 md:grid-cols-5">
        {shares.map(([label, Icon, colour, , n]) => (
          <div key={label} className="flex flex-col gap-1 px-4 pt-3 pb-2">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon aria-hidden="true" className={cn("size-3.5", colour)} />
              {label}
            </dt>
            <dd className="tabular text-2xl font-medium tracking-tight">{n}</dd>
          </div>
        ))}
        <div className="flex flex-col gap-1 px-4 pt-3 pb-2">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LockKeyhole aria-hidden="true" className="size-3.5" />
            With critical entities
          </dt>
          <dd className="tabular text-2xl font-medium tracking-tight">{critical}</dd>
        </div>
      </dl>
      <div className="px-4 pb-3.5">
        <div
          className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`Share of shown requests: ${shares.map((s) => `${s[0]} ${s[4]}`).join(", ")}`}
        >
          {shares
            .filter((share) => share[4] > 0)
            .map(([label, , , fill, n]) => (
              <span
                key={label}
                className={cn("h-full", fill)}
                style={{ width: `${((n / total) * 100).toFixed(1)}%` }}
              />
            ))}
        </div>
      </div>
    </section>
  );
}

export function LiveTraffic() {
  const live = useLiveTraffic();
  const [selected, setSelected] = useState<AuditEntryDto | undefined>();
  const hasRows = live.rows.length > 0;

  let region: ReactNode;
  if (!live.loaded && live.status === "error") {
    region = <RegionError error={live.error} onRetry={live.retry} />;
  } else if (!live.loaded) {
    region = <RegionLoading rows={8} />;
  } else if (!hasRows) {
    region = (
      <RegionEmpty
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/simulator">
              <FlaskConical aria-hidden="true" />
              Open simulator
            </Link>
          </Button>
        }
      >
        No requests in the last 5 minutes. Send one to the gateway or try the simulator.
      </RegionEmpty>
    );
  } else {
    region = (
      <TrafficList
        rows={live.rows}
        highlighted={live.highlighted}
        selectedId={selected?.id}
        onOpen={setSelected}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 p-4 md:p-6">
      <div className="sr-only" aria-live="polite" data-testid="live-announcement">
        {live.announcement}
      </div>
      <section aria-labelledby="stream-h" className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="stream-h" className="sr-only">
          Stream
        </h2>
        <StreamStatus status={live.status} failingSince={live.failingSince} />
        <p className="text-sm text-muted-foreground">
          <span className="tabular">
            {live.loaded ? `Showing ${live.rows.length}` : "Waiting for data"}
          </span>
          <span className="hidden md:inline"> · newest first · max 100</span>
        </p>
        <div className="ml-auto flex items-center gap-2">
          {live.paused ? (
            <Button
              size="sm"
              className="bg-info-soft text-info ring-1 ring-info/30 hover:bg-info-soft hover:ring-info/60"
              onClick={live.resume}
            >
              <span className="tabular">{live.pendingCount} new</span>
              <span className="hidden md:inline">· resume</span>
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={!live.loaded}
            onClick={live.paused ? live.resume : live.pause}
          >
            {live.paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {live.paused ? "Resume" : "Pause"}
          </Button>
          <Button variant="link" size="sm" className="hidden h-8 px-2 md:inline-flex" asChild>
            <Link href="/audit">
              Audit log
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          </Button>
        </div>
      </section>
      {live.loaded ? <Summary rows={live.rows} /> : null}
      {live.status === "retrying" ? (
        <div
          data-slot="alert"
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning"
        >
          <WifiOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Live updates interrupted</p>
            <p className="text-foreground/80">
              Rows below are kept. Retrying since {clock(live.failingSince)} UTC; last update{" "}
              {clock(live.successAt)} UTC.
            </p>
          </div>
        </div>
      ) : null}
      <section aria-labelledby="traffic-h" data-slot="card" className={CARD}>
        <h2 id="traffic-h" className="sr-only">
          Requests
        </h2>
        {region}
      </section>
      <EntryDetailSheet
        state={selected === undefined ? undefined : { kind: "entry", entry: selected }}
        onClose={() => setSelected(undefined)}
      />
    </div>
  );
}
