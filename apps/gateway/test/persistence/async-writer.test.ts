import { createFakeClock } from "@tamiz/test-utils";
import { describe, expect, it } from "vitest";
import type { AuditEntry } from "../../src/domain/model/audit-entry.js";
import { createAsyncAuditWriter } from "../../src/infrastructure/persistence/async-writer.js";
import type { AuditStore } from "../../src/infrastructure/persistence/audit-log-repository.js";
import { recordingEvents } from "../resilience/helpers.js";

// Spec 006 US1-6, FR-004, research R-02 (tasks.md T013): writes are queued, batched on
// the clock, retried once, kept for the next interval while the store fails (code audit
// 2026-11-03, L10), and every loss is an `audit.dropped` event.

function entry(n: number): AuditEntry {
  return { id: `id-${n}` } as unknown as AuditEntry;
}

function store(fail: (call: number) => boolean = () => false) {
  const batches: string[][] = [];
  let calls = 0;
  const port: AuditStore = {
    async insertBatch(entries) {
      const call = calls++;
      if (fail(call))
        throw Object.assign(new Error("connection refused at db:5432"), { code: "ECONNREFUSED" });
      batches.push(entries.map((e) => e.id));
    },
  };
  return { port, batches, calls: () => calls };
}

function setup(s = store(), options: { maxQueue?: number; batchSize?: number } = {}) {
  const clock = createFakeClock();
  const events = recordingEvents();
  const writer = createAsyncAuditWriter({
    store: s.port,
    clock,
    events,
    intervalMs: 250,
    ...options,
  });
  return { clock, events, writer, store: s };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createAsyncAuditWriter", () => {
  it("US1-6: append only queues; nothing is written before the interval", async () => {
    const { writer, store: s } = setup();
    writer.append(entry(1));
    await tick();
    expect(s.batches).toEqual([]);
    expect(writer.pending()).toBe(1);
  });

  it("writes in batches every interval, through the clock", async () => {
    const { writer, clock, store: s } = setup(undefined, { batchSize: 2 });
    for (let i = 1; i <= 5; i += 1) writer.append(entry(i));

    clock.advance(250);
    await tick();
    await writer.flush();

    expect(s.batches).toEqual([["id-1", "id-2"], ["id-3", "id-4"], ["id-5"]]);
    expect(writer.pending()).toBe(0);
  });

  it("retries a failed batch once before dropping it", async () => {
    const { writer, events, store: s } = setup(store((call) => call === 0));
    writer.append(entry(1));
    await writer.flush();
    expect(s.batches).toEqual([["id-1"]]);
    expect(events.all).toEqual([]);
  });

  it("a batch that fails twice waits in the queue and is written once the store is back", async () => {
    let down = true;
    const { writer, events, store: s } = setup(store(() => down));
    writer.append(entry(1));
    writer.append(entry(2));
    await writer.flush();
    expect(writer.pending()).toBe(2);
    expect(events.all).toEqual([]);

    down = false;
    await writer.flush();

    expect(s.batches).toEqual([["id-1", "id-2"]]);
    expect(writer.pending()).toBe(0);
  });

  it("a waiting batch never grows the queue past its bound: the oldest are dropped", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slowFailure: AuditStore = {
      async insertBatch() {
        await gate;
        throw Object.assign(new Error("refused"), { code: "ECONNREFUSED" });
      },
    };
    const { writer, events } = setup(
      { port: slowFailure, batches: [], calls: () => 0 },
      {
        maxQueue: 3,
        batchSize: 3,
      },
    );
    for (let i = 1; i <= 3; i += 1) writer.append(entry(i));
    const flushing = writer.flush();
    await tick();
    // The batch is in flight; two more arrive meanwhile.
    writer.append(entry(4));
    writer.append(entry(5));
    release();
    await flushing;

    expect(writer.pending()).toBe(3);
    expect(events.all).toEqual([
      expect.objectContaining({ type: "audit.dropped", count: 2, reason: "queue_full" }),
    ]);
  });

  it("FR-004: what close cannot write is dropped and reported, with the code only", async () => {
    const { writer, events } = setup(store(() => true));
    writer.append(entry(1));
    writer.append(entry(2));
    await writer.close();

    expect(events.all).toEqual([
      expect.objectContaining({ type: "audit.dropped", count: 2, reason: "store_error" }),
    ]);
    expect(JSON.stringify(events.all)).not.toContain("5432");
  });

  it("an entry appended after close is reported as dropped, never lost silently (audit M10)", async () => {
    const { writer, events } = setup();
    await writer.close();
    writer.append(entry(1));

    expect(events.all).toEqual([
      expect.objectContaining({ type: "audit.dropped", count: 1, reason: "shutdown" }),
    ]);
  });

  it("a full queue drops its oldest entry and reports it", async () => {
    const { writer, events, store: s } = setup(undefined, { maxQueue: 2 });
    writer.append(entry(1));
    writer.append(entry(2));
    writer.append(entry(3));
    await writer.flush();

    expect(s.batches.flat()).toEqual(["id-2", "id-3"]);
    expect(events.all).toEqual([
      expect.objectContaining({ type: "audit.dropped", count: 1, reason: "queue_full" }),
    ]);
  });

  it("close flushes what is left and stops the timer", async () => {
    const { writer, clock, store: s } = setup();
    writer.append(entry(1));
    await writer.close();
    expect(s.batches).toEqual([["id-1"]]);
    expect(clock.pendingSleeps()).toBe(0);
  });
});
