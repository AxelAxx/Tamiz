"use client";

/** The editor's header: the version on screen, where it came from, who saved it and when. */
import type { ActivePolicyDto } from "@tamiz/contracts";
import { CircleDot, Database, FlaskConical, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BADGE, TONE } from "@/features/shared/badges";
import { CARD } from "@/features/shared/card";
import { cn } from "@/lib/utils";

function formatSaved(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function PolicyHeader({
  active,
  dirty,
}: {
  readonly active: ActivePolicyDto;
  readonly dirty: boolean;
}) {
  const { policy, meta } = active;
  return (
    <section
      data-component="policy-header"
      aria-label="Active policy"
      className={cn(CARD, "flex flex-col gap-3 p-5")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-base font-semibold">{policy.id}</h2>
            <span data-testid="policy-version" className={cn(BADGE, TONE.neutral, "font-normal")}>
              version {policy.version}
            </span>
            {dirty ? (
              <span className={cn(BADGE, TONE.info)}>
                <CircleDot aria-hidden="true" className="size-3.5" />
                Unsaved changes
              </span>
            ) : null}
          </div>
          <p data-testid="policy-source" className="text-sm text-muted-foreground">
            {meta.source === "file"
              ? "Source: the policy file at boot · not saved from the dashboard yet"
              : `Saved version · saved ${meta.savedAt === null ? "at an unknown time" : formatSaved(meta.savedAt)} by ${meta.savedBy ?? "an unknown admin"}`}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/simulator">
            <FlaskConical aria-hidden="true" />
            Try in simulator
          </Link>
        </Button>
      </div>
      {meta.persistent ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Database aria-hidden="true" className="size-3.5" />
          Saves are stored in the database and survive restarts.
        </p>
      ) : (
        <div
          data-component="not-persistent"
          className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Not persistent</p>
            <p>Saves are lost when the gateway restarts: configure a database.</p>
          </div>
        </div>
      )}
    </section>
  );
}
