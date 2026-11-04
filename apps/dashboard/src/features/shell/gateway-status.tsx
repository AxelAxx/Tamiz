"use client";

/**
 * Gateway status in the top bar (`design/components.md` "Gateway status pill"; spec 008
 * FR-020): Connected, Disconnected (retrying) or Credentials rejected, from
 * `/api/gateway-health`. A pill with text on tablet and desktop; on phone a 44 px icon
 * button whose popover carries the same text, so the status is never colour only.
 */
import { useQuery } from "@tanstack/react-query";
import {
  CircleCheck,
  KeyRound,
  LoaderCircle,
  type LucideIcon,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAgo, formatUtcTime } from "@/features/shared/format";
import { api, BffRequestError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const REFRESH_MS = 30_000;

interface StatusLook {
  readonly label: string;
  readonly sub: string;
  readonly icon: LucideIcon;
  readonly tone: string;
  readonly dot: string;
  readonly spin?: boolean;
}

/** Re-renders every few seconds so "updated N s ago" stays true. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function credentialsRejected(error: unknown): boolean {
  return error instanceof BffRequestError && error.body?.error.type === "gateway_credentials";
}

export function GatewayStatus() {
  const health = useQuery({
    queryKey: ["gateway-health"],
    queryFn: api.gatewayHealth,
    refetchInterval: REFRESH_MS,
  });
  const now = useNow(5_000);
  const updatedAt = health.dataUpdatedAt === 0 ? undefined : new Date(health.dataUpdatedAt);
  const lastUpdate =
    updatedAt === undefined
      ? "never connected"
      : `last update ${formatUtcTime(updatedAt.toISOString())}`;

  const look: StatusLook = health.isPending
    ? {
        label: "Connecting",
        sub: "checking the gateway",
        icon: LoaderCircle,
        tone: "border-border bg-muted text-muted-foreground",
        dot: "text-muted-foreground",
        spin: true,
      }
    : health.isError && credentialsRejected(health.error)
      ? {
          label: "Credentials rejected",
          sub: "check the gateway token",
          icon: KeyRound,
          tone: "border-danger/25 bg-danger-soft text-danger",
          dot: "text-danger",
        }
      : health.isError
        ? {
            label: "Disconnected, retrying",
            sub: lastUpdate,
            icon: RefreshCw,
            tone: "border-warning/30 bg-warning-soft text-warning",
            dot: "text-warning",
          }
        : health.data?.status === "degraded"
          ? {
              label: "Degraded",
              sub: (health.data.checks ?? [])
                .filter((check) => check.status !== "ok")
                .map((check) => `${check.name} ${check.status}`)
                .join(", "),
              icon: TriangleAlert,
              tone: "border-warning/30 bg-warning-soft text-warning",
              dot: "text-warning",
            }
          : {
              label: "Connected",
              sub: `updated ${formatAgo((now - (updatedAt?.getTime() ?? now)) / 1000)}`,
              icon: CircleCheck,
              tone: "border-success/25 bg-success-soft text-success",
              dot: "text-success",
            };
  const version = health.data?.version ?? "unknown";
  const detail = `Gateway ${version} · ${lastUpdate}${updatedAt === undefined ? "" : " UTC"}`;
  const Icon = look.icon;
  const iconClass = cn(look.spin && "animate-spin motion-reduce:animate-none");

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-component="gateway-status"
            className={cn(
              "hidden h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium md:inline-flex",
              look.tone,
            )}
          >
            <Icon aria-hidden="true" className={cn("size-3.5", iconClass)} />
            {look.label}
            <span className="font-normal">· {look.sub}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>{detail}</TooltipContent>
      </Tooltip>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-component="gateway-status"
            aria-label={`Gateway status: ${look.label}`}
            className={cn(
              "inline-flex size-11 items-center justify-center rounded-md hover:bg-accent md:hidden",
              look.dot,
            )}
          >
            <Icon aria-hidden="true" className={cn("size-5", iconClass)} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <Icon aria-hidden="true" className="size-4" />
            {look.label}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {look.sub} · Gateway {version}
          </p>
        </PopoverContent>
      </Popover>
    </>
  );
}
