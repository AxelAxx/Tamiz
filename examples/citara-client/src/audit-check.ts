/**
 * Finds the audit entry of one request through the admin audit API (spec 010 FR-011,
 * data-model section 5, research R-07). The API has no request-id filter, so the check
 * reads a narrow window that starts just before the request and matches the id here.
 */
import { AUDIT_PAGE_MAX, type AuditEntryDto, AuditPageSchema } from "@tamiz/contracts";

const WINDOW_BEFORE_MS = 5_000;
/** The contract's own page cap, so a lower cap on the gateway never makes every page a 400. */
const PAGE_LIMIT = AUDIT_PAGE_MAX;
const MAX_PAGES = 5;
const POLL_INTERVAL_MS = 250;

export interface AuditCheckDeps {
  readonly fetch: typeof fetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
}

export interface AuditCheckInput {
  readonly baseUrl: string;
  readonly adminKey: string;
  readonly requestId: string;
  /** Epoch milliseconds taken just before the first attempt. */
  readonly startedAt: number;
  /** How long to poll, counted from the start of the check (after the answer), not from `startedAt`. */
  readonly waitMs: number;
}

export type AuditCheckResult =
  | { readonly kind: "found"; readonly entry: AuditEntryDto }
  | { readonly kind: "not_found" | "forbidden" | "unauthorized" | "malformed" | "unreachable" };

type PageOutcome =
  | { readonly kind: "found"; readonly entry: AuditEntryDto }
  | { readonly kind: "missing" }
  | { readonly kind: "forbidden" | "unauthorized" | "malformed" | "unreachable" };

/**
 * Polls until the entry appears, the deadline passes, or the key is refused. The deadline
 * starts now: a slow answer (a local model takes seconds) must not use up the wait for an
 * entry the gateway writes asynchronously after answering.
 */
export async function checkAudit(
  input: AuditCheckInput,
  deps: AuditCheckDeps,
): Promise<AuditCheckResult> {
  const deadline = deps.now() + input.waitMs;
  for (;;) {
    const outcome = await scanWindow(input, deps);
    if (outcome.kind !== "missing") return outcome;
    if (deps.now() >= deadline) return { kind: "not_found" };
    await deps.sleep(POLL_INTERVAL_MS);
  }
}

async function scanWindow(input: AuditCheckInput, deps: AuditCheckDeps): Promise<PageOutcome> {
  const from = new Date(input.startedAt - WINDOW_BEFORE_MS).toISOString();
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${input.baseUrl.replace(/\/+$/, "")}/admin/audit`);
    url.searchParams.set("from", from);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    if (cursor !== null) url.searchParams.set("cursor", cursor);
    let response: Response;
    try {
      response = await deps.fetch(url, {
        headers: { authorization: `Bearer ${input.adminKey}` },
      });
    } catch {
      // The answer is already in hand: report `audit_error: unreachable`, never crash
      // the run (code audit 2026-11-03, M20).
      return { kind: "unreachable" };
    }
    if (response.status === 401) return { kind: "unauthorized" };
    if (response.status === 403) return { kind: "forbidden" };
    const parsed = AuditPageSchema.safeParse(
      response.ok ? await response.json().catch(() => undefined) : undefined,
    );
    if (!parsed.success) return { kind: "malformed" };
    const entry = parsed.data.entries.find((e) => e.requestId === input.requestId);
    if (entry !== undefined) return { kind: "found", entry };
    cursor = parsed.data.nextCursor;
    if (cursor === null) break;
  }
  return { kind: "missing" };
}
