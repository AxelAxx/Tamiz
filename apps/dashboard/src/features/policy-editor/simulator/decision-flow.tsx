/**
 * The five steps of a decision, revealed one after another (`design/components.md`
 * "Decision flow"; spec 008 US3-7, research R-06): inspection → classification → rule →
 * privacy action → route. For a block, the step that decided is marked from `blockReason`
 * and the steps after it are not evaluated.
 */
import type { SimulateResponse } from "@tamiz/contracts";
import {
  Ban,
  Info,
  type LucideIcon,
  Route,
  ScanSearch,
  Shield,
  Signpost,
  Tags,
} from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PrivacyActionBadge, ResidencyBadge } from "@/features/shared/badges";
import { SensitivityIndicator } from "@/features/shared/privacy";
import { cn } from "@/lib/utils";

type BlockReason = NonNullable<SimulateResponse["blockReason"]>;

/** The step a block reason points at (R-06). */
export const DECIDING_STEP: Readonly<Record<BlockReason, number>> = {
  detector_unavailable: 1,
  action: 4,
  no_target: 5,
};

export const BLOCK_WORDS: Readonly<Record<BlockReason, string>> = {
  detector_unavailable: "inspection failed, gateway fails closed",
  action: "policy blocks this sensitivity",
  no_target: "no allowed target",
};

type StepState = "pending" | "resolved" | "deciding" | "skipped";

const NODE: Readonly<Record<StepState, string>> = {
  pending: "border-dashed border-input bg-surface text-muted-foreground",
  resolved: "border-foreground/20 bg-foreground text-background",
  deciding: "border-danger bg-danger-soft text-danger",
  skipped: "border-border bg-muted text-muted-foreground opacity-60",
};
const WORD: Readonly<Record<StepState, string>> = {
  pending: "Pending",
  resolved: "Done",
  deciding: "Blocked",
  skipped: "Skipped",
};

/** State of step `index` (1-based) once `revealed` steps have resolved. */
export function stepState(
  index: number,
  revealed: number,
  response: SimulateResponse | undefined,
): StepState {
  if (response === undefined) return "pending";
  const blockAt = response.blockReason === undefined ? 0 : DECIDING_STEP[response.blockReason];
  if (blockAt > 0 && index > blockAt) return revealed >= blockAt ? "skipped" : "pending";
  if (revealed < index) return "pending";
  return blockAt === index ? "deciding" : "resolved";
}

function BlockedHere({ children }: { readonly children: ReactNode }) {
  return (
    <p className="mt-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
      <span className="font-semibold">Blocked here:</span> {children}
    </p>
  );
}

function Step({
  index,
  title,
  icon: Icon,
  state,
  last = false,
  children,
}: {
  readonly index: number;
  readonly title: string;
  readonly icon: LucideIcon;
  readonly state: StepState;
  readonly last?: boolean;
  readonly children: ReactNode;
}) {
  const NodeIcon = state === "deciding" ? Ban : Icon;
  return (
    <li
      data-component="decision-step"
      data-state={state}
      className={cn("relative flex gap-3", !last && "pb-5")}
    >
      {last ? null : (
        <span className="absolute top-9 bottom-0 left-4 w-px bg-border" aria-hidden="true" />
      )}
      <span
        className={cn(
          "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border",
          NODE[state],
        )}
      >
        <NodeIcon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3
            className={cn("text-sm font-semibold", state === "skipped" && "text-muted-foreground")}
          >
            {index} · {title}
          </h3>
          <span
            className={cn(
              "text-xs",
              state === "deciding" ? "font-semibold text-danger" : "text-muted-foreground",
            )}
          >
            {WORD[state]}
          </span>
        </div>
        {state === "pending" ? (
          <Skeleton className={cn("mt-2 h-5", index === 5 ? "w-full" : "w-40")} />
        ) : state === "skipped" ? (
          <p className="mt-1 text-sm text-muted-foreground">Not evaluated</p>
        ) : (
          <div className="animate-step-in">{children}</div>
        )}
      </div>
    </li>
  );
}

export function DecisionFlow({
  response,
  revealed,
}: {
  readonly response: SimulateResponse | undefined;
  readonly revealed: number;
}) {
  const state = (i: number) => stepState(i, revealed, response);
  const r = response;
  const kinds = r === undefined ? [] : [...new Set(r.entities.map((e) => e.kind))];
  return (
    <>
      <ol data-component="decision-flow" className="flex flex-col p-4" aria-label="Decision steps">
        <Step index={1} title="Inspection" icon={ScanSearch} state={state(1)}>
          {r === undefined ? null : (
            <>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                <SensitivityIndicator
                  level={r.sensitivity}
                  suffix={<span className="text-muted-foreground">sensitivity</span>}
                />
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {kinds.length === 0 ? "no entities" : kinds.join(", ")}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  Detector <span className="font-mono text-foreground">{r.detector}</span>
                </span>
              </div>
              {r.blockReason === "detector_unavailable" ? (
                <BlockedHere>{BLOCK_WORDS.detector_unavailable}.</BlockedHere>
              ) : null}
            </>
          )}
        </Step>
        <Step index={2} title="Classification" icon={Tags} state={state(2)}>
          <p className="mt-1.5 text-sm">
            <span className="text-muted-foreground">Task</span>{" "}
            <span className="font-mono">{r?.taskType}</span>{" "}
            <span className="text-muted-foreground">· size</span>{" "}
            <span className="font-mono">{r?.size}</span>
          </p>
        </Step>
        <Step index={3} title="Rule" icon={Signpost} state={state(3)}>
          <p className="mt-1.5 text-sm">
            <span className="rounded-sm border bg-muted px-1.5 py-0.5 font-mono text-xs">
              {r?.ruleId}
            </span>{" "}
            {r?.ruleId === "default" ? (
              <span className="text-muted-foreground">no other rule matched</span>
            ) : null}
          </p>
        </Step>
        <Step index={4} title="Privacy action" icon={Shield} state={state(4)}>
          {r === undefined ? null : (
            <>
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                <PrivacyActionBadge action={r.privacyAction} />
              </p>
              {r.blockReason === "action" ? <BlockedHere>{BLOCK_WORDS.action}.</BlockedHere> : null}
            </>
          )}
        </Step>
        <Step index={5} title="Route" icon={Route} state={state(5)} last>
          {r === undefined ? null : r.blockReason === "no_target" ? (
            <>
              <BlockedHere>{BLOCK_WORDS.no_target}.</BlockedHere>
              <p className="mt-2 text-xs text-muted-foreground">
                Chain empty · allowed residencies: none
              </p>
            </>
          ) : (
            <>
              <ol className="mt-2 flex flex-col gap-1.5" aria-label="Fallback chain, in order">
                {r.chain.map((target, i) => (
                  <li
                    key={target.id}
                    className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-sm"
                  >
                    <span className="tabular w-4 text-xs text-muted-foreground">{i + 1}</span>
                    <ResidencyBadge residency={target.residency} />
                    <span className="font-mono text-xs font-medium whitespace-nowrap">
                      {target.id}
                    </span>
                    <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
                      {target.provider} · {target.model}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                Allowed residencies
                {r.allowedResidencies.map((residency) => (
                  <ResidencyBadge key={residency} residency={residency} size="sm" />
                ))}
              </p>
            </>
          )}
        </Step>
      </ol>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-3 text-xs text-muted-foreground">
        {r?.policy === undefined ? null : (
          <span>
            Policy <span className="font-mono text-foreground">{r.policy.id}</span> · version{" "}
            {r.policy.version}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Info aria-hidden="true" className="size-3.5" />
          No model was called
        </span>
      </div>
    </>
  );
}
