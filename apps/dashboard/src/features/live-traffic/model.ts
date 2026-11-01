/**
 * The live traffic list as a pure value (spec 008 US2-1, US2-4, US2-5, research R-05).
 *
 * Polls return entries by `startedAt` from an overlap window, so the same entry arrives
 * many times and a long request can arrive after a later-started short one. Entries are
 * kept in a map by id; the view is the newest `LIVE_MAX` by `startedAt`, then `id`. While
 * paused, new ids wait in a pending set and the rows stay still; resuming merges them.
 */
import type { AuditEntryDto } from "@tamiz/contracts";

export const LIVE_MAX = 100;
/** The overlap of every poll: the longest plausible request deadline. */
export const OVERLAP_MS = 5 * 60_000;

export interface LiveState {
  /** Every shown entry by id (at most `LIVE_MAX`). */
  readonly shown: ReadonlyMap<string, AuditEntryDto>;
  /** Entries that arrived while paused, by id. */
  readonly pending: ReadonlyMap<string, AuditEntryDto>;
  /** Ids that joined the view in the last merge, for the highlight. */
  readonly fresh: ReadonlySet<string>;
  readonly paused: boolean;
  /** Newest `startedAt` seen (ms); undefined before the first entry. */
  readonly newestStartedAt: number | undefined;
}

export const INITIAL: LiveState = {
  shown: new Map(),
  pending: new Map(),
  fresh: new Set(),
  paused: false,
  newestStartedAt: undefined,
};

/** Newest first: `startedAt` descending, then `id` descending. */
export function compareNewestFirst(a: AuditEntryDto, b: AuditEntryDto): number {
  const byTime = Date.parse(b.startedAt) - Date.parse(a.startedAt);
  if (byTime !== 0) return byTime;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** The newest `LIVE_MAX` of `entries`, newest first. */
function newest(entries: Iterable<AuditEntryDto>): AuditEntryDto[] {
  return [...entries].sort(compareNewestFirst).slice(0, LIVE_MAX);
}

function newestTime(current: number | undefined, entries: ReadonlyArray<AuditEntryDto>) {
  return entries.reduce<number | undefined>((max, entry) => {
    const t = Date.parse(entry.startedAt);
    return max === undefined || t > max ? t : max;
  }, current);
}

/** Folds one poll's entries in; already shown ids are ignored. */
export function merge(state: LiveState, incoming: ReadonlyArray<AuditEntryDto>): LiveState {
  const newestStartedAt = newestTime(state.newestStartedAt, incoming);
  const unseen = incoming.filter((entry) => !state.shown.has(entry.id));
  if (state.paused) {
    const pending = new Map(state.pending);
    for (const entry of unseen) pending.set(entry.id, entry);
    return { ...state, pending, newestStartedAt };
  }
  const view = newest([...state.shown.values(), ...unseen]);
  const shown = new Map(view.map((entry) => [entry.id, entry]));
  const fresh = new Set(unseen.map((entry) => entry.id).filter((id) => shown.has(id)));
  return { ...state, shown, fresh, newestStartedAt };
}

export function pause(state: LiveState): LiveState {
  return { ...state, paused: true, fresh: new Set() };
}

/** Merges what waited while paused, in order, without duplicates. */
export function resume(state: LiveState): LiveState {
  return merge({ ...state, paused: false, pending: new Map() }, [...state.pending.values()]);
}

/** The rows to render, newest first. */
export function rows(state: LiveState): AuditEntryDto[] {
  return newest(state.shown.values());
}

/** The `from` of the next poll: newest seen minus the overlap, or now minus the overlap. */
export function since(state: LiveState, now: number): string {
  return new Date((state.newestStartedAt ?? now) - OVERLAP_MS).toISOString();
}
