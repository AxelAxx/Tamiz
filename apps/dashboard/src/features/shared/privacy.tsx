/**
 * The privacy pieces of a row (`design/components.md`): sensitivity indicator, entity chips,
 * target label and fallback marker. They show kinds, counts and routes; never content.
 */
import type { AuditEntryDto, PrivacyEntityKindDto } from "@tamiz/contracts";
import { CircleHelp, CornerDownRight } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type SensitivityValue = AuditEntryDto["sensitivity"];

/** Filled bars out of four and their colour; `unknown` (inspection failed) is dashed. */
const SENSITIVITY: Readonly<Record<SensitivityValue, readonly [number, string]>> = {
  none: [0, ""],
  low: [1, "bg-muted-foreground"],
  high: [3, "bg-warning"],
  critical: [4, "bg-danger"],
  unknown: [-1, ""],
};
const BAR_HEIGHTS = ["h-1.5", "h-2", "h-2.5", "h-3"] as const;

export function SensitivityIndicator({
  level,
  suffix,
}: {
  readonly level: SensitivityValue;
  readonly suffix?: ReactNode;
}) {
  const [filled, colour] = SENSITIVITY[level];
  return (
    <span
      data-component="sensitivity-indicator"
      data-level={level}
      className="inline-flex items-center gap-1.5"
    >
      <span className="flex items-end gap-0.5" aria-hidden="true">
        {BAR_HEIGHTS.map((height, index) => (
          <span
            key={height}
            className={cn(
              height,
              "w-1 rounded-xs",
              filled < 0
                ? "border border-dashed border-muted-foreground"
                : index < filled
                  ? colour
                  : "bg-border",
            )}
          />
        ))}
      </span>
      {filled < 0 ? (
        <CircleHelp aria-hidden="true" className="size-3.5 text-muted-foreground" />
      ) : null}
      <span
        className={cn(
          level === "critical" && "font-semibold",
          (level === "none" || level === "unknown") && "text-muted-foreground",
        )}
      >
        {level}
      </span>
      {suffix}
    </span>
  );
}

export const ENTITY_NAMES: Readonly<Record<PrivacyEntityKindDto, string>> = {
  DNI: "Spanish national ID",
  NIE: "Foreigner ID",
  CIF: "Company tax ID",
  IBAN: "Bank account",
  NSS: "Social security number",
  PHONE: "Phone number",
  EMAIL: "Email address",
  CREDIT_CARD: "Credit card",
  PERSON: "Person name",
  LOCATION: "Location",
};

/** The kinds the default policy treats as critical (spec 004, design-brief §4). */
export const CRITICAL_KINDS: ReadonlySet<PrivacyEntityKindDto> = new Set([
  "DNI",
  "NIE",
  "NSS",
  "IBAN",
  "CREDIT_CARD",
]);

export function EntityChip({
  kind,
  count,
}: {
  readonly kind: PrivacyEntityKindDto;
  readonly count: number;
}) {
  const critical = CRITICAL_KINDS.has(kind);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-component="entity-chip"
          data-critical={critical}
          className={cn(
            "inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-mono text-xs",
            critical
              ? "border-foreground/25 bg-surface font-semibold"
              : "border-transparent bg-muted",
          )}
        >
          {critical ? (
            <>
              <span className="size-1.5 rounded-xs bg-danger" aria-hidden="true" />
              <span className="sr-only">critical</span>
            </>
          ) : null}
          {kind}
          <span className="font-normal text-muted-foreground">×{count}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {ENTITY_NAMES[kind]}
        {critical ? " · critical" : ""}
      </TooltipContent>
    </Tooltip>
  );
}

type EntityCounts = AuditEntryDto["entities"];

/** Critical kinds first, then the rest, each with its count. */
export function sortedEntities(entities: EntityCounts): Array<[PrivacyEntityKindDto, number]> {
  return (Object.entries(entities) as Array<[PrivacyEntityKindDto, number | undefined]>)
    .filter((pair): pair is [PrivacyEntityKindDto, number] => pair[1] !== undefined)
    .sort(([a], [b]) => Number(CRITICAL_KINDS.has(b)) - Number(CRITICAL_KINDS.has(a)));
}

/** At most `max` chips, then "+N" whose tooltip lists the hidden kinds. */
export function EntityChips({
  entities,
  max = 3,
  emptyLabel = "none",
}: {
  readonly entities: EntityCounts;
  readonly max?: number;
  readonly emptyLabel?: string;
}) {
  const all = sortedEntities(entities);
  if (all.length === 0) {
    return <span className="text-xs leading-5 text-muted-foreground">{emptyLabel}</span>;
  }
  const shown = all.slice(0, max);
  const hidden = all.slice(max);
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map(([kind, count]) => (
        <EntityChip key={kind} kind={kind} count={count} />
      ))}
      {hidden.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center rounded-sm border border-dashed px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              +{hidden.length}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {hidden.map(([kind, count]) => `${kind} ×${count}`).join(", ")}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}

/** The target id in mono; provider and model on hover. */
export function TargetLabel({
  target,
}: {
  readonly target: Pick<NonNullable<AuditEntryDto["target"]>, "id" | "provider" | "model">;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span data-component="target-label" className="min-w-0 truncate font-mono text-xs">
          {target.id}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {target.provider} · {target.model}
      </TooltipContent>
    </Tooltip>
  );
}

type Abandoned = AuditEntryDto["abandoned"];

export function fallbackLabel(abandoned: Abandoned): string {
  const times = abandoned.length === 1 ? "1 time" : `${abandoned.length} times`;
  return `Fell back ${times}: ${abandoned.map((a) => `${a.targetId} ${a.reason}`).join(", ")}`;
}

/**
 * The count of abandoned targets. Interactive (a button with a tooltip) in tables; static
 * on phone cards, which are a single button themselves. Nothing when there was no fallback.
 */
export function FallbackMarker({
  abandoned,
  interactive = true,
}: {
  readonly abandoned: Abandoned;
  readonly interactive?: boolean;
}) {
  if (abandoned.length === 0) return null;
  const label = fallbackLabel(abandoned);
  if (!interactive) {
    return (
      <span
        data-component="fallback-marker"
        className="inline-flex items-center gap-0.5 text-xs font-medium text-warning"
      >
        <CornerDownRight aria-hidden="true" className="size-3.5" />
        {abandoned.length}
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-component="fallback-marker"
          aria-label={label}
          className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-sm px-1 text-xs font-medium text-warning hover:bg-warning-soft"
        >
          <CornerDownRight aria-hidden="true" className="size-3.5" />
          <span className="tabular">{abandoned.length}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <span className="mb-1 block font-medium">Fell back from</span>
        {abandoned.map((a) => (
          <span key={`${a.targetId}-${a.reason}`} className="block">
            <span className="font-mono">{a.targetId}</span> · {a.reason}
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
