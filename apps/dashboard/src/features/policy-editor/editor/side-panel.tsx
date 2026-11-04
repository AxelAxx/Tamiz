"use client";

import { CircleCheck, CircleX, Monitor, Server } from "lucide-react";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { CARD } from "@/features/shared/card";
import { cn } from "@/lib/utils";
import { outline, type PolicyIssue } from "./policy-yaml";

export type Issues =
  | { readonly from: "browser"; readonly list: ReadonlyArray<PolicyIssue> }
  | { readonly from: "gateway"; readonly list: ReadonlyArray<PolicyIssue> };

export function IssueList({
  issues,
  checking,
  onGoTo,
}: {
  readonly issues: Issues;
  readonly checking: boolean;
  readonly onGoTo: (line: number) => void;
}) {
  const { list, from } = issues;
  if (list.length === 0) {
    return (
      <p className="flex items-center gap-2 px-4 py-3 text-sm text-success">
        <CircleCheck aria-hidden="true" className="size-4" />
        {checking ? "Checking…" : "Valid. No issues."}
      </p>
    );
  }
  return (
    <>
      <p
        className={cn(
          "flex items-center gap-2 border-b px-4 py-2.5 text-xs font-medium",
          from === "gateway" ? "text-danger" : "text-muted-foreground",
        )}
      >
        {from === "gateway" ? (
          <>
            <Server aria-hidden="true" className="size-3.5" />
            Refused by the gateway on save
          </>
        ) : (
          <>
            <Monitor aria-hidden="true" className="size-3.5" />
            Checked in the browser · fix before saving
          </>
        )}
      </p>
      <ul data-component="policy-issues" className="flex flex-col divide-y">
        {list.map((issue, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: two issues may share a path
          <li key={`${issue.path}-${index}`} className="flex flex-col gap-1 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-danger">
                <CircleX aria-hidden="true" className="size-3.5 shrink-0" />
                <span
                  data-testid="issue-path"
                  className="truncate font-mono text-xs text-foreground"
                >
                  {issue.path === "" ? "(document)" : issue.path}
                </span>
              </span>
              {issue.line === undefined ? null : (
                <button
                  type="button"
                  onClick={() => issue.line !== undefined && onGoTo(issue.line)}
                  className="shrink-0 rounded-sm text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  line {issue.line}
                </button>
              )}
            </div>
            <p>{issue.message}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Outline({
  text,
  onGoTo,
}: {
  readonly text: string;
  readonly onGoTo: (line: number) => void;
}) {
  const items = useMemo(() => outline(text), [text]);
  if (items.length === 0) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">Nothing to outline yet.</p>;
  }
  return (
    <ul className="flex flex-col py-1.5">
      {items.map((item) => (
        <li key={`${item.label}-${item.line}`}>
          <button
            type="button"
            onClick={() => onGoTo(item.line)}
            className={cn(
              "flex w-full items-center justify-between gap-2 px-4 py-1 text-left text-sm hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
              item.depth === 1 && "pl-8 font-mono text-xs",
            )}
          >
            <span className="truncate">{item.label}</span>
            <span className="tabular text-xs text-muted-foreground">{item.line}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const TABS = ["issues", "outline"] as const;
type Tab = (typeof TABS)[number];

export function SidePanel({
  issues,
  checking,
  text,
  onGoTo,
}: {
  readonly issues: Issues;
  readonly checking: boolean;
  readonly text: string;
  readonly onGoTo: (line: number) => void;
}) {
  const [tab, setTab] = useState<Tab>("issues");
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ issues: null, outline: null });
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const next = tab === "issues" ? "outline" : "issues";
    setTab(next);
    refs.current[next]?.focus();
  };
  const label: Record<Tab, string> = {
    issues: `Issues (${issues.list.length})`,
    outline: "Outline",
  };
  return (
    <section aria-label="Policy check" className={cn(CARD, "h-fit overflow-hidden")}>
      <div className="border-b p-2">
        <div
          role="tablist"
          aria-label="Policy panels"
          className="inline-flex rounded-md bg-muted p-0.5"
        >
          {TABS.map((key) => (
            <button
              key={key}
              ref={(node) => {
                refs.current[key] = node;
              }}
              type="button"
              role="tab"
              id={`policy-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`policy-panel-${key}`}
              tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={onKeyDown}
              className={cn(
                "rounded-sm px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                tab === key && "bg-background text-foreground shadow-xs",
              )}
            >
              {label[key]}
            </button>
          ))}
        </div>
      </div>
      <div
        role="tabpanel"
        id={`policy-panel-${tab}`}
        aria-labelledby={`policy-tab-${tab}`}
        className="max-h-[32rem] overflow-y-auto"
      >
        {tab === "issues" ? (
          <IssueList issues={issues} checking={checking} onGoTo={onGoTo} />
        ) : (
          <Outline text={text} onGoTo={onGoTo} />
        )}
      </div>
      {/* The count, said once when it changes; the list itself is not a live region. */}
      <p id="policy-issues-summary" aria-live="polite" className="sr-only">
        {issues.list.length === 0
          ? "No issues"
          : `${issues.list.length} issue${issues.list.length === 1 ? "" : "s"}${issues.from === "gateway" ? ", refused by the gateway" : ""}`}
      </p>
    </section>
  );
}
