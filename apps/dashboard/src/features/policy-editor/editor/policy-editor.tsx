"use client";

/**
 * The policy editor (design `policy.html`; spec 008 US5, research R-10 … R-12).
 *
 * The active policy loads as YAML. Every edit is checked in the browser 300 ms later with
 * the gateway's own schema; issues show in the gutter and in a list with their paths, and
 * saving waits until there are none. A save sends `{ baseVersion, policy }`; the gateway
 * checks cross-field rules again and either answers the new version, refuses with issues,
 * or refuses with a conflict when someone saved first. Nothing is overwritten silently.
 * A visitor session (US10-3) sees the same policy read-only, with no save.
 */
import type { ActivePolicyDto } from "@tamiz/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CircleCheck,
  CircleDot,
  CircleX,
  Copy,
  Database,
  Eye,
  FlaskConical,
  Monitor,
  RefreshCw,
  Save,
  Server,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { BADGE, TONE } from "@/features/shared/badges";
import { RegionError } from "@/features/shared/region-states";
import { useSessionRole } from "@/features/shell/session-role";
import { api, BffRequestError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  checkPolicyYaml,
  lineOfPath,
  outline,
  type PolicyCheck,
  type PolicyIssue,
  policyToYaml,
} from "./policy-yaml";
import { YamlEditor } from "./yaml-editor";

const CARD = "rounded-xl border bg-card text-card-foreground shadow-xs";
const CHECK_DELAY_MS = 300;

type Issues =
  | { readonly from: "browser"; readonly list: ReadonlyArray<PolicyIssue> }
  | { readonly from: "gateway"; readonly list: ReadonlyArray<PolicyIssue> };

function formatSaved(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function PolicyHeader({
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

function IssueList({
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

function Outline({
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

function SidePanel({
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

function ConflictDialog({
  open,
  onCopy,
  onReload,
  onClose,
}: {
  readonly open: boolean;
  readonly onCopy: () => void;
  readonly onReload: () => void;
  readonly onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md rounded-xl" data-component="conflict-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <TriangleAlert aria-hidden="true" className="size-5 text-warning" />
            The policy changed
          </DialogTitle>
          <DialogDescription>
            Someone saved a newer version while you were editing. Saving now would overwrite it, so
            nothing was saved. Copy your draft if you want to keep it, then reload.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCopy}>
            <Copy aria-hidden="true" />
            Copy my draft first
          </Button>
          <Button variant="destructive" onClick={onReload}>
            Reload (lose my changes)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Asks before leaving the page, or following a link inside it, with unsaved changes. */
function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const message = "You have unsaved policy changes. Leave without saving?";
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.origin !== window.location.origin || anchor.target === "_blank") return;
      if (anchor.pathname === window.location.pathname) return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}

function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="flex flex-col gap-4">
      <Skeleton className="h-28 rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-[32rem] rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    </div>
  );
}

function ReadOnlyFooter({ onReload }: { readonly onReload: () => void }) {
  return (
    <div
      data-component="policy-read-only"
      className="flex flex-wrap items-center gap-2 border-t px-4 py-3"
    >
      <span className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
        <Eye aria-hidden="true" className="size-3.5" />
        Read-only: you are exploring as a visitor. Saving needs the operator passphrase.
      </span>
      <Button variant="ghost" size="sm" onClick={onReload}>
        <RefreshCw aria-hidden="true" />
        Reload from gateway
      </Button>
    </div>
  );
}

function Editor({
  loaded,
  onReload,
  readOnly,
}: {
  readonly loaded: ActivePolicyDto;
  readonly onReload: () => Promise<ActivePolicyDto | undefined>;
  readonly readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const [base, setBase] = useState(loaded);
  const baseText = useMemo(() => policyToYaml(base.policy), [base]);
  const [editorDoc, setEditorDoc] = useState({ text: baseText, revision: 0 });
  const [text, setText] = useState(baseText);
  const [check, setCheck] = useState<PolicyCheck>(() => checkPolicyYaml(baseText));
  const [checkedText, setCheckedText] = useState(baseText);
  const [refused, setRefused] = useState<{ text: string; issues: ReadonlyArray<PolicyIssue> }>();
  const [conflict, setConflict] = useState(false);
  const [goTo, setGoTo] = useState<{ line: number }>();
  const [saveError, setSaveError] = useState<string>();

  const dirty = text !== baseText;
  const checking = checkedText !== text;
  useUnsavedGuard(dirty);

  useEffect(() => {
    if (text === checkedText) return;
    const timer = setTimeout(() => {
      setCheck(checkPolicyYaml(text));
      setCheckedText(text);
    }, CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, checkedText]);

  const replaceWith = useCallback((next: ActivePolicyDto) => {
    const nextText = policyToYaml(next.policy);
    setBase(next);
    setText(nextText);
    setCheck(checkPolicyYaml(nextText));
    setCheckedText(nextText);
    setRefused(undefined);
    setSaveError(undefined);
    setEditorDoc((current) => ({ text: nextText, revision: current.revision + 1 }));
  }, []);

  const save = useMutation({
    mutationFn: api.replacePolicy,
    onSuccess: (saved) => {
      replaceWith(saved);
      queryClient.setQueryData(["policy"], saved);
      void queryClient.invalidateQueries({ queryKey: ["policy"] });
      toast.success(`Saved as version ${saved.policy.version}`);
    },
    onError: (error) => {
      const gatewayError =
        error instanceof BffRequestError ? error.body?.error.gatewayError : undefined;
      if (gatewayError?.type === "conflict") {
        setConflict(true);
        return;
      }
      if (gatewayError?.issues !== undefined && gatewayError.issues.length > 0) {
        setRefused({
          text,
          issues: gatewayError.issues.map((issue) => {
            // The gateway's paths start at the request body (`policy.rules.0…`); the
            // editor holds the policy itself.
            const path = issue.path.replace(/^policy(\.|$)/, "");
            const line = lineOfPath(text, path);
            return {
              path,
              message: issue.message,
              ...(line === undefined ? {} : { line }),
            };
          }),
        });
        return;
      }
      if (error instanceof BffRequestError && error.status === 401) return; // session dialog
      setSaveError(gatewayError?.message ?? error.message);
    },
  });

  const canSave = dirty && !checking && check.ok && !save.isPending;
  const onSave = () => {
    if (!canSave || !check.ok) return;
    setSaveError(undefined);
    save.mutate({ baseVersion: base.policy.version, policy: check.policy });
  };

  const issues: Issues =
    refused !== undefined && refused.text === text
      ? { from: "gateway", list: refused.issues }
      : { from: "browser", list: check.issues };
  const editorIssues = useMemo(
    () =>
      issues.list.flatMap((issue) =>
        issue.line === undefined
          ? []
          : [{ line: issue.line, message: `${issue.path || "(document)"}: ${issue.message}` }],
      ),
    [issues],
  );

  const reload = async () => {
    const fresh = await onReload();
    if (fresh !== undefined) replaceWith(fresh);
    setConflict(false);
  };
  const discard = () => replaceWith(base);
  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Draft copied to the clipboard");
    } catch {
      toast.error("Could not copy the draft: select it in the editor and copy it by hand");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PolicyHeader active={base} dirty={dirty} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section
          aria-label="Policy YAML"
          className={cn(CARD, "flex min-w-0 flex-col overflow-hidden")}
        >
          <h2 className="border-b px-4 py-3 font-mono text-sm font-semibold">
            {base.policy.id}.yaml
          </h2>
          <div className="h-[32rem] min-h-0">
            <YamlEditor
              document={editorDoc}
              issues={editorIssues}
              {...(goTo === undefined ? {} : { goTo })}
              label="Policy YAML"
              describedBy="policy-issues-summary"
              onChange={setText}
              onSave={onSave}
              readOnly={readOnly}
            />
          </div>
          {saveError === undefined ? null : (
            <p
              role="alert"
              className="flex items-center gap-2 border-t bg-danger-soft px-4 py-2 text-sm text-danger"
            >
              <CircleX aria-hidden="true" className="size-4 shrink-0" />
              Not saved: {saveError}
            </p>
          )}
          {readOnly ? (
            <ReadOnlyFooter onReload={() => void reload()} />
          ) : (
            <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
              <span
                data-testid="draft-state"
                className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                {dirty ? (
                  <>
                    <CircleDot aria-hidden="true" className="size-3.5 text-info" />
                    Unsaved changes
                  </>
                ) : (
                  <>
                    <Check aria-hidden="true" className="size-3.5" />
                    No changes
                  </>
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void reload()}
                disabled={save.isPending}
              >
                <RefreshCw aria-hidden="true" />
                Reload from gateway
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={discard}
                disabled={!dirty || save.isPending}
              >
                Discard changes
              </Button>
              <Button size="sm" onClick={onSave} disabled={!canSave}>
                <Save aria-hidden="true" />
                {save.isPending ? "Saving…" : `Save as version ${base.policy.version + 1}`}
              </Button>
            </div>
          )}
        </section>
        <SidePanel
          issues={issues}
          checking={checking}
          text={text}
          onGoTo={(line) => setGoTo({ line })}
        />
      </div>
      <ConflictDialog
        open={conflict}
        onCopy={() => void copyDraft()}
        onReload={() => void reload()}
        onClose={() => setConflict(false)}
      />
    </div>
  );
}

export function PolicyEditor() {
  const query = useQuery({
    queryKey: ["policy"],
    queryFn: api.policy,
    staleTime: Number.POSITIVE_INFINITY,
  });
  // The editor keeps the version it loaded; later refetches never replace a draft.
  const [loaded, setLoaded] = useState<ActivePolicyDto>();
  useEffect(() => {
    if (loaded === undefined && query.data !== undefined) setLoaded(query.data);
  }, [loaded, query.data]);

  const reload = async () => (await query.refetch()).data;
  const role = useSessionRole();

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 p-4 md:p-6">
      {loaded !== undefined && role !== undefined ? (
        <Editor loaded={loaded} onReload={reload} readOnly={role === "visitor"} />
      ) : query.isError ? (
        <div className={CARD}>
          <RegionError error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : (
        <Loading />
      )}
    </div>
  );
}
