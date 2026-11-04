/**
 * The "everything to the frontier model" baseline (spec 006 FR-012, research R-08): the
 * policy's most expensive target, by input + output price per million tokens, the first
 * declared on a tie. Each audit entry stores its own baseline cost, so a later price change
 * never rewrites history.
 */
import { computeCost, type Usage } from "./cost.js";
import { type ModelTarget, totalPricePerMillion } from "./model-target.js";
import type { Usd } from "./units.js";

export function baselineTarget(targets: ReadonlyArray<ModelTarget>): ModelTarget | undefined {
  let best: ModelTarget | undefined;
  for (const target of targets) {
    const bestPrice = best === undefined ? -1 : totalPricePerMillion(best);
    if (totalPricePerMillion(target) > bestPrice) best = target;
  }
  return best !== undefined && totalPricePerMillion(best) > 0 ? best : undefined;
}

export function baselineCost(
  usage: Pick<Usage, "promptTokens" | "completionTokens">,
  target: ModelTarget,
): Usd {
  return computeCost(usage, target.pricing);
}
