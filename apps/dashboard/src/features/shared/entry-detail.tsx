"use client";

/**
 * Every field of one audit entry in a right-side sheet (`design/components.md` "Entry
 * detail drawer"; spec 008 US2-8, US4-6). It says plainly that no content exists: an entry
 * holds kinds, counts, routes and costs only (spec 008 FR-019).
 */
import type { AuditEntryDto } from "@tamiz/contracts";
import { ArrowRight, Copy, CornerDownRight, EyeOff, SearchX } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { BADGE, OutcomeBadge, PrivacyActionBadge, ResidencyBadge, TONE } from "./badges";
import { formatLatency, formatNumber, formatUsd, formatUtc, MISSING } from "./format";
import { EntityChips, SensitivityIndicator } from "./privacy";
import { RegionEmpty } from "./region-states";

export const BLOCK_REASONS: Readonly<Record<NonNullable<AuditEntryDto["blockReason"]>, string>> = {
  action: "policy blocks this sensitivity",
  no_target: "no allowed target",
  detector_unavailable: "inspection failed, gateway fails closed",
  residency: "residency not allowed",
};

/** What the sheet shows: an entry, a load in progress, or an id that matched nothing. */
export type EntryDetailState =
  | { readonly kind: "entry"; readonly entry: AuditEntryDto }
  | { readonly kind: "loading" }
  | { readonly kind: "not-found"; readonly id: string };

const Mono = ({ children }: { readonly children: ReactNode }) => (
  <span className="font-mono text-xs leading-5">{children}</span>
);

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section>
      <h3 className="mt-6 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <dl className="mt-2 grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        {children}
      </dl>
    </section>
  );
}

function EntryBody({ entry }: { readonly entry: AuditEntryDto }) {
  const target = entry.target;
  const copyHash = () => {
    void navigator.clipboard
      .writeText(entry.requestHash)
      .then(() => toast.success("Request hash copied"))
      .catch(() => toast.error("Could not copy the request hash"));
  };
  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6 md:px-5">
        <p className="flex items-start gap-2 rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <EyeOff aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span>
            <span className="font-medium text-foreground">Tamiz never stores what was said.</span>{" "}
            This entry holds kinds, counts, routes and costs only.
          </span>
        </p>
        <Section title="Route">
          <Row label="Target">
            {target === undefined ? (
              <span className="text-muted-foreground">No target answered</span>
            ) : (
              <Mono>{target.id}</Mono>
            )}
          </Row>
          <Row label="Provider · model">
            {target === undefined ? (
              MISSING
            ) : (
              <>
                {target.provider} · <Mono>{target.model}</Mono>
              </>
            )}
          </Row>
          <Row label="Residency">
            {target === undefined ? MISSING : <ResidencyBadge residency={target.residency} />}
          </Row>
          <Row label="Abandoned">
            {entry.abandoned.length === 0 ? (
              <span className="text-muted-foreground">None</span>
            ) : (
              <ul className="flex flex-col gap-1">
                {entry.abandoned.map((a) => (
                  <li key={`${a.targetId}-${a.reason}`} className="flex items-center gap-1.5">
                    <CornerDownRight aria-hidden="true" className="size-3.5 text-warning" />
                    <Mono>{a.targetId}</Mono>
                    <span className="text-muted-foreground">· {a.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </Row>
        </Section>
        <Section title="Privacy">
          <Row label="Sensitivity">{<SensitivityIndicator level={entry.sensitivity} />}</Row>
          <Row label="Entities">
            {<EntityChips entities={entry.entities} max={99} emptyLabel="None found" />}
          </Row>
          <Row label="Action">{<PrivacyActionBadge action={entry.privacyAction} />}</Row>
          <Row label="Notice version">{<Mono>{entry.noticeVersion ?? MISSING}</Mono>}</Row>
          <Row label="Block reason">
            {entry.blockReason === undefined ? (
              MISSING
            ) : (
              <>
                {BLOCK_REASONS[entry.blockReason]} <Mono>({entry.blockReason})</Mono>
              </>
            )}
          </Row>
        </Section>
        <Section title="Request">
          <Row label="Request id">{<Mono>{entry.requestId}</Mono>}</Row>
          <Row label="Request hash">
            {
              <span className="flex items-center gap-1">
                <Mono>{entry.requestHash.slice(0, 12)}…</Mono>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copy request hash"
                  onClick={copyHash}
                >
                  <Copy aria-hidden="true" />
                </Button>
              </span>
            }
          </Row>
          <Row label="Client">{<Mono>{entry.clientId}</Mono>}</Row>
          <Row label="Started">{<span className="tabular">{formatUtc(entry.startedAt)}</span>}</Row>
          <Row label="Ended">{<span className="tabular">{formatUtc(entry.endedAt)}</span>}</Row>
          <Row label="Latency">
            {<span className="tabular">{formatLatency(entry.latencyMs)}</span>}
          </Row>
          <Row label="Streamed">{entry.streamed ? "Yes" : "No"}</Row>
          <Row label="Policy">
            {
              <>
                <Mono>{entry.policyId}</Mono> · version {entry.policyVersion}
              </>
            }
          </Row>
          <Row label="Rule">{<Mono>{entry.ruleId}</Mono>}</Row>
          <Row label="Task · size">{`${entry.taskType} · ${entry.size}`}</Row>
          <Row label="Outcome">{<OutcomeBadge outcome={entry.outcome} />}</Row>
          <Row label="Error type">{<Mono>{entry.errorType ?? MISSING}</Mono>}</Row>
        </Section>
        <Section title="Usage and cost">
          <Row label="Tokens in · out">
            {entry.usage === undefined ? (
              MISSING
            ) : (
              <>
                <span className="tabular">
                  {formatNumber(entry.usage.inputTokens)} · {formatNumber(entry.usage.outputTokens)}
                </span>
                {entry.usage.estimated ? (
                  <span data-slot="badge" className={`${BADGE} ${TONE.neutral} ml-1.5`}>
                    estimated
                  </span>
                ) : null}
              </>
            )}
          </Row>
          <Row label="Cost">
            {<span className="tabular font-medium">{formatUsd(entry.costUsd)}</span>}
          </Row>
          <Row label="Baseline cost">
            {entry.baselineCostUsd === undefined ? (
              MISSING
            ) : (
              <>
                <span className="tabular">{formatUsd(entry.baselineCostUsd)}</span>
                {entry.baselineTargetId === undefined ? null : (
                  <>
                    {" "}
                    <span className="text-muted-foreground">on</span>{" "}
                    <Mono>{entry.baselineTargetId}</Mono>
                  </>
                )}
              </>
            )}
          </Row>
        </Section>
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-4 py-3 md:px-5">
        <Button variant="link" className="h-9 px-0" asChild>
          <Link href={`/audit?rule=${encodeURIComponent(entry.ruleId)}`}>
            See requests with this rule
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </Button>
        <span className="text-xs text-muted-foreground">Times in UTC</span>
      </div>
    </>
  );
}

function Header({ state }: { readonly state: EntryDetailState }) {
  if (state.kind !== "entry") {
    return <SheetTitle className="text-base font-semibold">Request</SheetTitle>;
  }
  const { entry } = state;
  return (
    <>
      <SheetTitle className="text-base font-semibold">
        Request <span className="font-mono">{entry.requestId}</span>
      </SheetTitle>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {entry.target === undefined || entry.outcome === "blocked" ? null : (
          <>
            <ResidencyBadge residency={entry.target.residency} />
            <span className="font-mono text-xs">{entry.target.id}</span>
          </>
        )}
        <OutcomeBadge outcome={entry.outcome} />
      </div>
    </>
  );
}

export function EntryDetailSheet({
  state,
  onClose,
}: {
  readonly state: EntryDetailState | undefined;
  readonly onClose: () => void;
}) {
  return (
    <Sheet open={state !== undefined} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent side="right" className="md:w-110" closeLabel="Close details">
        {state === undefined ? null : (
          <>
            <div
              data-slot="sheet-header"
              className="flex items-start gap-3 border-b px-4 py-3 pr-14 md:px-5"
            >
              <div className="min-w-0 flex-1">
                <Header state={state} />
                <SheetDescription className="sr-only">
                  Every field of this audit entry. No message content is stored.
                </SheetDescription>
              </div>
            </div>
            {state.kind === "entry" ? <EntryBody entry={state.entry} /> : null}
            {state.kind === "loading" ? (
              <div className="flex flex-col gap-3 p-5" aria-busy="true">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : null}
            {state.kind === "not-found" ? (
              <RegionEmpty icon={SearchX}>
                No audit entry with id <span className="font-mono text-foreground">{state.id}</span>
                . It may be older than the retention window.
              </RegionEmpty>
            ) : null}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
