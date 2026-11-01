/**
 * Loading, empty, error and stale states of every data region (`design/components.md`
 * "Region states"; spec 008 FR-020). No whole-page spinners: loading is a skeleton shaped
 * like the final layout.
 */
import { Clock, Inbox, type LucideIcon, RefreshCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BffRequestError } from "@/lib/api-client";
import { formatUtcTime } from "./format";

/** Skeleton rows shaped like a traffic or audit table. */
export function RegionLoading({ rows = 6 }: { readonly rows?: number }) {
  return (
    <div
      data-component="region-loading"
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className="flex flex-col divide-y"
    >
      {Array.from({ length: rows }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholder rows
        <div key={index} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="hidden h-3 w-24 md:block" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="hidden h-5 w-24 md:block" />
          <Skeleton className="ml-auto h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

export function RegionEmpty({
  icon: Icon = Inbox,
  children,
  action,
}: {
  readonly icon?: LucideIcon;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <div
      data-component="region-empty"
      className="flex flex-col items-center gap-3 px-6 py-16 text-center"
    >
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <p className="max-w-md text-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}

/** What failed, in the words of the design, from the BFF error type. */
export function describeError(error: unknown): {
  readonly title: string;
  readonly text: string;
  readonly requestId?: string;
} {
  const body = error instanceof BffRequestError ? error.body?.error : undefined;
  switch (body?.type) {
    case "gateway_unreachable":
      return {
        title: "Gateway unreachable",
        text: "The dashboard could not reach the gateway. It may be restarting.",
      };
    case "gateway_credentials":
      return {
        title: "Credentials rejected",
        text: "The gateway refused the dashboard's admin key. Check TAMIZ_DASHBOARD_ADMIN_KEY.",
      };
    case "contract":
      return {
        title: "Unexpected answer",
        text: "The gateway answered with data this dashboard does not understand.",
      };
    case "gateway": {
      const requestId = body.gatewayError?.requestId;
      return {
        title: "The gateway refused the request",
        text: body.gatewayError?.message ?? body.message,
        ...(requestId !== undefined && { requestId }),
      };
    }
    default:
      return { title: "Something went wrong", text: "The request failed. Try again." };
  }
}

export function RegionError({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
}) {
  const { title, text, requestId } = describeError(error);
  return (
    <div
      data-component="region-error"
      role="alert"
      className="flex flex-col items-center gap-3 px-6 py-16 text-center"
    >
      <span className="grid size-10 place-items-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert aria-hidden="true" className="size-5" />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      {requestId === undefined ? null : (
        <p className="text-xs text-muted-foreground">
          Gateway request id <span className="font-mono text-foreground">{requestId}</span>
        </p>
      )}
      <Button size="sm" onClick={onRetry}>
        <RefreshCw aria-hidden="true" />
        Retry
      </Button>
    </div>
  );
}

/** Data stays on screen; this quiet note says how old it is. */
export function StaleNote({ updatedAt }: { readonly updatedAt: string }) {
  return (
    <span
      data-component="region-stale"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
    >
      <Clock aria-hidden="true" className="size-3.5" />
      Last updated <span className="tabular">{formatUtcTime(updatedAt)}</span> UTC
    </span>
  );
}
