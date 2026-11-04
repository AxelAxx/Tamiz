/**
 * Asynchronous audit writer (spec 006 FR-004, US1-6, research R-02).
 *
 * `append` only queues: a request never waits for the database. Every `intervalMs`
 * (through the clock port) the queue is written in batches of up to `batchSize`. A batch
 * that fails twice goes back to the head of the queue and waits for the next interval, so
 * a short database outage loses nothing while the queue has room (code audit 2026-11-03,
 * L10); a full queue drops its oldest entry. `close` flushes what is left; what still
 * cannot be written then is dropped, and so is anything appended after `close` (M10).
 * Every loss is an `audit.dropped` routing event and a `warn` line with the error code,
 * never silent.
 */
import type { AuditLogPort } from "../../application/ports/audit-log.port.js";
import type { ClockPort } from "../../application/ports/clock.port.js";
import type { LoggerPort } from "../../application/ports/logger.port.js";
import type { RoutingEventsPort } from "../../application/ports/routing-events.port.js";
import type { AuditEntry } from "../../domain/model/audit-entry.js";
import type { Milliseconds } from "../../domain/model/units.js";
import type { AuditStore } from "./audit-log-repository.js";

export interface AsyncAuditWriterOptions {
  readonly store: AuditStore;
  readonly clock: ClockPort;
  readonly events: RoutingEventsPort;
  readonly logger?: LoggerPort;
  readonly maxQueue?: number;
  readonly batchSize?: number;
  readonly intervalMs?: number;
}

export interface AsyncAuditWriter extends AuditLogPort {
  /** Writes everything queued now. */
  flush(): Promise<void>;
  /** Stops the timer and flushes. */
  close(): Promise<void>;
  pending(): number;
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "unknown";
}

export function createAsyncAuditWriter(options: AsyncAuditWriterOptions): AsyncAuditWriter {
  const maxQueue = options.maxQueue ?? 10_000;
  const batchSize = options.batchSize ?? 100;
  const intervalMs = (options.intervalMs ?? 250) as Milliseconds;
  const queue: AuditEntry[] = [];
  const stop = new AbortController();
  let running: Promise<void> = Promise.resolve();

  let closed = false;

  const dropped = (
    count: number,
    reason: "queue_full" | "store_error" | "shutdown",
    code?: string,
  ) => {
    options.events.emit({
      type: "audit.dropped",
      count,
      reason,
      at: options.clock.now().toISOString(),
    });
    options.logger?.warn(
      { count, reason, ...(code === undefined ? {} : { code }) },
      "audit entries dropped",
    );
  };

  async function insert(batch: AuditEntry[]): Promise<unknown> {
    try {
      await options.store.insertBatch(batch);
      return undefined;
    } catch {
      try {
        await options.store.insertBatch(batch);
        return undefined;
      } catch (error) {
        return error;
      }
    }
  }

  /** Puts a failed batch back in front, within `maxQueue`: the oldest entries go first. */
  function requeue(batch: AuditEntry[], error: unknown): void {
    const room = Math.max(0, maxQueue - queue.length);
    const kept = batch.slice(Math.max(0, batch.length - room));
    if (kept.length < batch.length) dropped(batch.length - kept.length, "queue_full");
    queue.unshift(...kept);
    options.logger?.warn({ count: kept.length, code: errorCode(error) }, "audit write deferred");
  }

  async function writeAll(final: boolean): Promise<void> {
    while (queue.length > 0) {
      const batch = queue.splice(0, batchSize);
      const error = await insert(batch);
      if (error === undefined) continue;
      if (final) {
        dropped(batch.length, "store_error", errorCode(error));
        continue;
      }
      requeue(batch, error);
      return;
    }
  }

  // Flushes never overlap: each one runs after the previous.
  const run = (final: boolean): Promise<void> => {
    const write = () => writeAll(final);
    running = running.then(write, write);
    return running;
  };
  const flush = () => run(false);

  void (async () => {
    while (!stop.signal.aborted) {
      try {
        await options.clock.sleep(intervalMs, stop.signal);
      } catch {
        return;
      }
      await flush();
    }
  })();

  return {
    append(entry) {
      if (closed) {
        dropped(1, "shutdown");
        return;
      }
      if (queue.length >= maxQueue) {
        queue.shift();
        dropped(1, "queue_full");
      }
      queue.push(entry);
    },
    flush,
    async close() {
      closed = true;
      stop.abort();
      await run(true);
    },
    pending: () => queue.length,
  };
}
