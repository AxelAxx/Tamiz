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
import { Check, CircleDot, CircleX, Eye, RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD } from "@/features/shared/card";
import { RegionError } from "@/features/shared/region-states";
import { useSessionRole } from "@/features/shell/session-role";
import { api, BffRequestError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ConflictDialog } from "./conflict-dialog";
import { PolicyHeader } from "./policy-header";
import {
  checkPolicyYaml,
  lineOfPath,
  type PolicyCheck,
  type PolicyIssue,
  policyToYaml,
} from "./policy-yaml";
import { type Issues, SidePanel } from "./side-panel";
import { YamlEditor } from "./yaml-editor";

const CHECK_DELAY_MS = 300;

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
    // The submitted text travels with the request: issues are mapped against what the
    // gateway validated, not a newer draft.
    mutationFn: (submitted: {
      readonly request: Parameters<typeof api.replacePolicy>[0];
      readonly text: string;
    }) => api.replacePolicy(submitted.request),
    onSuccess: (saved) => {
      replaceWith(saved);
      queryClient.setQueryData(["policy"], saved);
      void queryClient.invalidateQueries({ queryKey: ["policy"] });
      toast.success(`Saved as version ${saved.policy.version}`);
    },
    onError: (error, submitted) => {
      const gatewayError =
        error instanceof BffRequestError ? error.body?.error.gatewayError : undefined;
      if (gatewayError?.type === "conflict") {
        setConflict(true);
        return;
      }
      if (gatewayError?.issues !== undefined && gatewayError.issues.length > 0) {
        setRefused({
          text: submitted.text,
          issues: gatewayError.issues.map((issue) => {
            // The gateway's paths start at the request body (`policy.rules.0…`); the
            // editor holds the policy itself.
            const path = issue.path.replace(/^policy(\.|$)/, "");
            const line = lineOfPath(submitted.text, path);
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
    save.mutate({ request: { baseVersion: base.policy.version, policy: check.policy }, text });
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
    // A failed reload keeps the draft and the conflict open.
    if (fresh === undefined) return;
    replaceWith(fresh);
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
              // Nothing typed while a save is in flight can be lost when the saved version
              // replaces the draft.
              readOnly={readOnly || save.isPending}
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

  const reload = async () => {
    const result = await query.refetch();
    if (!result.isError) return result.data;
    // `data` would be the cached base version: never put it in place of the draft.
    toast.error("Could not reload the policy from the gateway. Your draft is kept.");
    return undefined;
  };
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
