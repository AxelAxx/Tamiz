import type { AuditEntryDto } from "@tamiz/contracts";
import { describe, expect, it } from "vitest";
import {
  INITIAL,
  LIVE_MAX,
  merge,
  OVERLAP_MS,
  pause,
  resume,
  rows,
  since,
} from "@/features/live-traffic/model";

// Spec 008 US2-1, US2-4, US2-5, research R-05 (tasks.md T022).

const T0 = Date.parse("2026-11-01T12:00:00.000Z");

/** A minimal valid entry `n` started `seconds` after T0. */
function entry(n: number, seconds: number): AuditEntryDto {
  const id = `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
  return {
    id,
    requestId: `req-${n}`,
    clientId: "demo",
    startedAt: new Date(T0 + seconds * 1000).toISOString(),
    endedAt: new Date(T0 + seconds * 1000 + 800).toISOString(),
    latencyMs: 800,
    requestHash: "a".repeat(64),
    policyId: "default",
    policyVersion: 3,
    ruleId: "default",
    taskType: "chat",
    size: "short",
    sensitivity: "none",
    entities: {},
    privacyAction: "allow",
    outcome: "answered",
    streamed: false,
    abandoned: [],
    costUsd: 0,
  };
}

const ids = (list: ReadonlyArray<AuditEntryDto>) => list.map((e) => e.requestId);

describe("merge", () => {
  it("merges by id and orders newest first, then by id", () => {
    const a = entry(1, 10);
    const b = entry(2, 20);
    const c = entry(3, 20);
    const state = merge(merge(INITIAL, [a, b]), [b, c, a]);
    expect(ids(rows(state))).toEqual(["req-3", "req-2", "req-1"]);
    expect([...state.fresh]).toEqual([c.id]);
  });

  it("caps the view at the newest 100", () => {
    const many = Array.from({ length: LIVE_MAX + 20 }, (_, i) => entry(i + 1, i));
    const state = merge(INITIAL, many);
    const shown = rows(state);
    expect(shown).toHaveLength(LIVE_MAX);
    expect(shown[0]?.requestId).toBe(`req-${LIVE_MAX + 20}`);
    expect(shown.at(-1)?.requestId).toBe("req-21");
  });

  it("US2-5 a late-finishing entry with an older start is added in place, once", () => {
    const short = entry(2, 30);
    const long = entry(1, 5); // started earlier, written later
    let state = merge(INITIAL, [short]);
    state = merge(state, [short, long]);
    state = merge(state, [short, long]);
    expect(ids(rows(state))).toEqual(["req-2", "req-1"]);
    expect([...state.fresh]).toEqual([]);
  });

  it("does not mark an id fresh when it falls outside the view", () => {
    const full = Array.from({ length: LIVE_MAX }, (_, i) => entry(i + 1000, 100 + i));
    const state = merge(merge(INITIAL, full), [entry(1, 0)]);
    expect(state.fresh.size).toBe(0);
    expect(rows(state)).toHaveLength(LIVE_MAX);
  });
});

describe("pause and resume (US2-4)", () => {
  it("keeps rows still, counts what waits, and resumes without duplicates", () => {
    const first = merge(INITIAL, [entry(1, 1), entry(2, 2)]);
    let state = pause(first);
    state = merge(state, [entry(2, 2), entry(3, 3), entry(4, 4)]);
    state = merge(state, [entry(3, 3), entry(4, 4), entry(5, 5)]);
    expect(ids(rows(state))).toEqual(["req-2", "req-1"]);
    expect(state.pending.size).toBe(3);

    state = resume(state);
    expect(state.paused).toBe(false);
    expect(state.pending.size).toBe(0);
    expect(ids(rows(state))).toEqual(["req-5", "req-4", "req-3", "req-2", "req-1"]);
    expect([...state.fresh].sort()).toEqual([entry(3, 3).id, entry(4, 4).id, entry(5, 5).id]);
  });
});

describe("since (the overlap window)", () => {
  it("starts 5 minutes before now, then 5 minutes before the newest start seen", () => {
    const now = T0 + 60_000;
    expect(since(INITIAL, now)).toBe(new Date(now - OVERLAP_MS).toISOString());
    const state = merge(INITIAL, [entry(1, 10), entry(2, 40)]);
    expect(since(state, now)).toBe(new Date(T0 + 40_000 - OVERLAP_MS).toISOString());
  });

  it("an older late entry does not move the window back", () => {
    let state = merge(INITIAL, [entry(2, 40)]);
    state = merge(state, [entry(1, 5)]);
    expect(since(state, T0)).toBe(new Date(T0 + 40_000 - OVERLAP_MS).toISOString());
  });
});
