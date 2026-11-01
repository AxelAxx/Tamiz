/**
 * Status badges of the design (`design/components.md`): residency, outcome, privacy action,
 * circuit state and the eval pass/fail mark. Every one pairs a lucide icon (`aria-hidden`)
 * with a word, so no meaning rests on colour alone (spec 008 FR-021, design-brief §6).
 */
import type { AuditOutcomeDto, EvalStatus, PrivacyActionDto, ResidencyDto } from "@tamiz/contracts";
import {
  ArrowUpRight,
  Ban,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleOff,
  CircleX,
  Globe,
  House,
  LockKeyhole,
  type LucideIcon,
  ShieldCheck,
  SkipForward,
  TriangleAlert,
  VenetianMask,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The design's shared badge base. */
export const BADGE =
  "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium";

export const TONE = {
  local: "border-local/25 bg-local-soft text-local",
  eu: "border-eu/25 bg-eu-soft text-eu",
  external: "border-external/25 bg-external-soft text-external",
  success: "border-success/25 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/25 bg-danger-soft text-danger",
  info: "border-info/30 bg-info-soft text-info",
  neutral: "border-border bg-muted text-muted-foreground",
} as const;

export type Tone = keyof typeof TONE;

/** Outline variant: "what we did" stays visually secondary to "where it went". */
const OUTLINE = {
  neutral: "border-border bg-transparent text-muted-foreground",
  info: "border-info/40 bg-transparent text-info",
  local: "border-local/40 bg-transparent text-local",
  danger: "border-danger/40 bg-transparent text-danger",
} as const;

interface Look<T extends string> {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly tone: T;
}

export function StatusBadge({
  icon: Icon,
  className,
  children,
  iconClassName = "size-3.5",
  ...data
}: {
  readonly icon: LucideIcon;
  readonly className: string;
  readonly children: ReactNode;
  readonly iconClassName?: string;
} & Readonly<Record<`data-${string}`, string>>) {
  return (
    <span data-slot="badge" className={cn(BADGE, className)} {...data}>
      <Icon aria-hidden="true" className={iconClassName} />
      {children}
    </span>
  );
}

export const RESIDENCY: Readonly<Record<ResidencyDto, Look<Tone>>> = {
  local: { label: "Local", icon: House, tone: "local" },
  eu: { label: "EU", icon: ShieldCheck, tone: "eu" },
  us: { label: "US", icon: Globe, tone: "external" },
  global: { label: "Global", icon: Globe, tone: "external" },
};

export function ResidencyBadge({
  residency,
  size = "default",
}: {
  readonly residency: ResidencyDto;
  readonly size?: "default" | "sm";
}) {
  const look = RESIDENCY[residency];
  return (
    <StatusBadge
      icon={look.icon}
      className={cn(TONE[look.tone], size === "sm" && "px-1 py-0")}
      iconClassName={size === "sm" ? "size-3" : "size-3.5"}
      data-component="residency-badge"
      data-residency={residency}
    >
      {look.label}
    </StatusBadge>
  );
}

const OUTCOME: Readonly<Record<AuditOutcomeDto, Look<Tone>>> = {
  answered: { label: "Answered", icon: CircleCheck, tone: "success" },
  failed: { label: "Failed", icon: CircleX, tone: "danger" },
  blocked: { label: "Blocked", icon: Ban, tone: "danger" },
  cancelled: { label: "Cancelled", icon: CircleMinus, tone: "neutral" },
};

export function OutcomeBadge({ outcome }: { readonly outcome: AuditOutcomeDto }) {
  const look = OUTCOME[outcome];
  return (
    <StatusBadge
      icon={look.icon}
      className={TONE[look.tone]}
      data-component="outcome-badge"
      data-outcome={outcome}
    >
      {look.label}
    </StatusBadge>
  );
}

const ACTION: Readonly<Record<PrivacyActionDto, Look<keyof typeof OUTLINE>>> = {
  allow: { label: "allow", icon: ArrowUpRight, tone: "neutral" },
  anonymize: { label: "anonymize", icon: VenetianMask, tone: "info" },
  restrict_to_local: { label: "local only", icon: LockKeyhole, tone: "local" },
  block: { label: "block", icon: Ban, tone: "danger" },
};

export function PrivacyActionBadge({ action }: { readonly action: PrivacyActionDto }) {
  const look = ACTION[action];
  return (
    <StatusBadge
      icon={look.icon}
      className={OUTLINE[look.tone]}
      data-component="privacy-action-badge"
      data-action-value={action}
    >
      {look.label}
    </StatusBadge>
  );
}

export type CircuitStateValue = "closed" | "open" | "half_open";

const CIRCUIT: Readonly<Record<CircuitStateValue, Look<Tone>>> = {
  closed: { label: "closed", icon: CircleCheck, tone: "success" },
  open: { label: "open", icon: CircleOff, tone: "danger" },
  half_open: { label: "half open", icon: CircleDashed, tone: "warning" },
};

/** `cooldownSeconds` is shown for an open circuit only ("· retry in 12 s"). */
export function CircuitBadge({
  state,
  cooldownSeconds,
}: {
  readonly state: CircuitStateValue;
  readonly cooldownSeconds?: number;
}) {
  const look = CIRCUIT[state];
  return (
    <StatusBadge
      icon={look.icon}
      className={TONE[look.tone]}
      data-component="circuit-badge"
      data-state={state}
    >
      {look.label}
      {state === "open" && cooldownSeconds !== undefined ? (
        <span className="tabular font-normal">· retry in {cooldownSeconds} s</span>
      ) : null}
    </StatusBadge>
  );
}

const PASS_FAIL: Readonly<Record<EvalStatus, { icon: LucideIcon; className: string }>> = {
  pass: { icon: CircleCheck, className: "text-success" },
  fail: { icon: CircleX, className: "text-danger" },
  error: { icon: TriangleAlert, className: "text-warning" },
  skipped: { icon: SkipForward, className: "text-muted-foreground" },
};

export function PassFailMark({
  status,
  size = "sm",
}: {
  readonly status: EvalStatus;
  readonly size?: "sm" | "lg";
}) {
  const { icon: Icon, className } = PASS_FAIL[status];
  const large = size === "lg";
  return (
    <span
      data-component="pass-fail-mark"
      data-status={status}
      className={cn(
        "inline-flex items-center",
        large ? "gap-2 text-2xl font-semibold tracking-tight" : "gap-1 text-sm font-medium",
        className,
      )}
    >
      <Icon aria-hidden="true" className={large ? "size-7" : "size-4"} />
      {large ? status.charAt(0).toUpperCase() + status.slice(1) : status}
    </span>
  );
}
