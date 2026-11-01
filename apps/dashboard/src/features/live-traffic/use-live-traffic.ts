"use client";

/**
 * Polls the audit log for the live traffic screen (spec 008 US2, research R-05).
 *
 * Every 2 s it asks `/api/audit` for entries since the newest one seen minus a 5-minute
 * overlap, following `nextCursor` while pages are full, and folds them into the pure model.
 * Failed polls back off (2, 4, 8, 16, then 30 s) and keep the rows. TanStack Query does not
 * poll a hidden tab. New rows stay highlighted for 2 s, and a polite announcement says how
 * many arrived, at most once every 10 s (US9-4).
 */
import type { AuditEntryDto } from "@tamiz/contracts";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { INITIAL, type LiveState, merge, pause, resume, rows, since } from "./model";

const POLL_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;
const PAGE_LIMIT = 200;
/** A burst larger than this many pages waits for the next poll. */
const MAX_PAGES = 5;
const HIGHLIGHT_MS = 2_000;
const ANNOUNCE_EVERY_MS = 10_000;

type Action =
  | {
      readonly type: "merge";
      readonly entries: ReadonlyArray<AuditEntryDto>;
      /** The first load: its rows are not "new", so nothing is highlighted or announced. */
      readonly initial: boolean;
    }
  | { readonly type: "pause" }
  | { readonly type: "resume" };

function reduce(state: LiveState, action: Action): LiveState {
  switch (action.type) {
    case "merge": {
      const next = merge(state, action.entries);
      return action.initial ? { ...next, fresh: new Set() } : next;
    }
    case "pause":
      return pause(state);
    case "resume":
      return resume(state);
  }
}

async function fetchSince(from: string): Promise<AuditEntryDto[]> {
  const entries: AuditEntryDto[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await api.audit({
      from,
      limit: PAGE_LIMIT,
      ...(cursor !== undefined && { cursor }),
    });
    entries.push(...result.entries);
    if (result.entries.length < PAGE_LIMIT || result.nextCursor === null) break;
    cursor = result.nextCursor;
  }
  return entries;
}

export function backoffMs(failures: number): number {
  return failures === 0 ? POLL_MS : Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS);
}

export type LiveStatus = "connecting" | "live" | "paused" | "retrying" | "error";

export function useLiveTraffic() {
  const [state, dispatch] = useReducer(reduce, INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Consecutive failed polls; TanStack resets its own count at every fetch.
  const failures = useRef(0);
  const poll = useQuery({
    queryKey: ["live-traffic"],
    queryFn: () => fetchSince(since(stateRef.current, Date.now())),
    refetchInterval: () => backoffMs(failures.current),
    retry: false,
    // Every poll is new data; never serve it from the cache of a previous visit.
    gcTime: 0,
  });

  const lastMerged = useRef(0);
  const [successAt, setSuccessAt] = useState<number | undefined>();
  const [failingSince, setFailingSince] = useState<number | undefined>();
  useEffect(() => {
    if (poll.data === undefined || poll.dataUpdatedAt === lastMerged.current) return;
    lastMerged.current = poll.dataUpdatedAt;
    failures.current = 0;
    dispatch({ type: "merge", entries: poll.data, initial: successAt === undefined });
    setSuccessAt(poll.dataUpdatedAt);
    setFailingSince(undefined);
  }, [poll.data, poll.dataUpdatedAt, successAt]);
  useEffect(() => {
    if (poll.errorUpdatedAt === 0 || poll.errorUpdatedAt < (successAt ?? 0)) return;
    failures.current += 1;
    setFailingSince((current) => current ?? poll.errorUpdatedAt);
  }, [poll.errorUpdatedAt, successAt]);

  // Highlight: each fresh id keeps its mark for 2 s, whatever the next polls bring.
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (state.fresh.size === 0) return;
    const ids = [...state.fresh];
    setHighlighted((current) => new Set([...current, ...ids]));
    const timer = setTimeout(
      () => setHighlighted((current) => new Set([...current].filter((id) => !ids.includes(id)))),
      HIGHLIGHT_MS,
    );
    return () => clearTimeout(timer);
  }, [state.fresh]);

  // Announcements: count arrivals after the first load, say it at most every 10 s.
  const unannounced = useRef(0);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    unannounced.current += state.fresh.size;
  }, [state.fresh]);
  useEffect(() => {
    const timer = setInterval(() => {
      const n = unannounced.current;
      if (n === 0) return;
      unannounced.current = 0;
      setAnnouncement(n === 1 ? "1 new request" : `${n} new requests`);
    }, ANNOUNCE_EVERY_MS);
    return () => clearInterval(timer);
  }, []);

  const loaded = successAt !== undefined;
  const status: LiveStatus = !loaded
    ? poll.isError
      ? "error"
      : "connecting"
    : failingSince !== undefined
      ? "retrying"
      : state.paused
        ? "paused"
        : "live";

  return {
    rows: rows(state),
    highlighted,
    paused: state.paused,
    pendingCount: state.pending.size,
    status,
    loaded,
    error: poll.error,
    successAt,
    failingSince,
    announcement,
    pause: useCallback(() => dispatch({ type: "pause" }), []),
    resume: useCallback(() => dispatch({ type: "resume" }), []),
    retry: useCallback(() => void poll.refetch(), [poll]),
  };
}
