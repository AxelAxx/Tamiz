/**
 * Per-target circuit breaker over the circuit-state port (spec 003 FR-006 … FR-009, US4,
 * research R-04, R-05).
 *
 * `admit` decides before a call: closed → call; open → skip with the remaining
 * cool-down; half-open → the single trial if its lease can be taken, skip otherwise.
 * `onResult` updates the state after the call:
 * - a success closes the circuit;
 * - a counted failure (retryable: rate limited, 5xx, timeout, network) increments the
 *   count and opens the circuit at the threshold;
 * - a failed trial reopens it at once; a trial the client abandoned changes nothing;
 * - other failures (credential or request rejected, malformed body) say nothing about
 *   the provider's health and change nothing;
 * - the outcome of a `call` admitted while the circuit was closed is dropped when the
 *   circuit is no longer closed: another request opened it meanwhile, and a late success
 *   must not close it silently, nor a late failure extend its cool-down.
 * Every transition is a `circuit.changed` event. `onResult` answers whether this outcome
 * opened the circuit, so a caller stops retrying a target it has just opened.
 */
import type { ProviderError } from "../../domain/errors.js";
import { type CircuitState, remainingCooldownMs, stateAt } from "../../domain/model/circuit.js";
import type { ModelTarget } from "../../domain/model/model-target.js";
import type { Milliseconds, RequestId } from "../../domain/model/units.js";
import type { Result } from "../../domain/result.js";
import type { CircuitStatePort } from "../ports/circuit-state.port.js";
import type { ClockPort } from "../ports/clock.port.js";
import type { RoutingEventsPort } from "../ports/routing-events.port.js";

export interface BreakerSettings {
  /** Consecutive counted failures that open a closed circuit. */
  readonly failureThreshold: number;
  readonly cooldownMs: Milliseconds;
}

export interface BreakerDeps {
  readonly state: CircuitStatePort;
  readonly clock: ClockPort;
  readonly events: RoutingEventsPort;
  readonly settings: BreakerSettings;
}

export interface BreakerContext {
  readonly requestId: RequestId;
}

export type Admission =
  | { readonly kind: "call" }
  | { readonly kind: "trial" }
  /** `remainingMs` is 0 when a trial is in flight and the cool-down is over. */
  | { readonly kind: "skip"; readonly remainingMs: number };

export interface CircuitBreaker {
  /** `leaseMs` bounds how long a trial may hold the half-open slot (the attempt timeout). */
  admit(target: ModelTarget, context: BreakerContext, leaseMs: Milliseconds): Promise<Admission>;
  /** `true` when this outcome opened the circuit. */
  onResult(
    target: ModelTarget,
    context: BreakerContext,
    result: Result<unknown, ProviderError>,
    admission: Admission,
  ): Promise<boolean>;
}

/**
 * Only failures that say something about the provider count. `aborted` never does: by the
 * time an outcome reaches the breaker, the request deadline has shown up as `timeout` (each
 * attempt is bounded by the time left), so `aborted` means the client went away. A trial
 * that ends that way leaves the circuit half-open; its lease expires and another request
 * tries.
 */
function counts(error: ProviderError): boolean {
  return error.retryable && error.cause !== "aborted";
}

export function createCircuitBreaker(deps: BreakerDeps): CircuitBreaker {
  const { state, clock, events, settings } = deps;

  function changed(
    target: ModelTarget,
    context: BreakerContext,
    from: CircuitState,
    to: CircuitState,
  ): void {
    events.emit({
      type: "circuit.changed",
      requestId: context.requestId,
      targetId: target.id,
      provider: target.provider,
      residency: target.residency,
      at: clock.now().toISOString(),
      from,
      to,
    });
  }

  async function isClosed(target: ModelTarget): Promise<boolean> {
    const snapshot = await state.snapshot(target.id);
    return stateAt(snapshot, clock.now().getTime(), settings.cooldownMs) === "closed";
  }

  return {
    async admit(target, _context, leaseMs) {
      const snapshot = await state.snapshot(target.id);
      const now = clock.now().getTime();
      switch (stateAt(snapshot, now, settings.cooldownMs)) {
        case "closed":
          return { kind: "call" };
        case "open":
          return {
            kind: "skip",
            remainingMs: remainingCooldownMs(snapshot, now, settings.cooldownMs),
          };
        case "half_open":
          return (await state.tryAcquireTrial(target.id, leaseMs))
            ? { kind: "trial" }
            : { kind: "skip", remainingMs: 0 };
      }
    },

    async onResult(target, context, result, admission) {
      if (admission.kind === "skip") return false;
      if (admission.kind === "call" && !(await isClosed(target))) return false;
      if (result.ok) {
        await state.recordSuccess(target.id);
        if (admission.kind === "trial") changed(target, context, "half_open", "closed");
        return false;
      }
      if (!counts(result.error)) return false;
      if (admission.kind === "trial") {
        await state.open(target.id, settings.cooldownMs);
        changed(target, context, "half_open", "open");
        return true;
      }
      const failures = await state.recordFailure(target.id);
      if (failures < settings.failureThreshold) return false;
      await state.open(target.id, settings.cooldownMs);
      changed(target, context, "closed", "open");
      return true;
    },
  };
}
