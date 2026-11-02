/**
 * What the provider health screen derives from a report (spec 008 US8, design
 * `screens/providers.html`): the window choices, the open circuit's countdown and when an
 * error rate is worth the danger colour. The circuit state and the window figures are the
 * gateway's own.
 */
import type { ProvidersReportDto } from "@tamiz/contracts";
import { MISSING } from "@/features/shared/format";

export const WINDOWS = [5, 15, 60] as const;
export type WindowMinutes = (typeof WINDOWS)[number];
export const DEFAULT_WINDOW: WindowMinutes = 15;

/** The screen refetches at least this often (US8-2). */
export const REFRESH_MS = 10_000;

/** From this error rate on, the rate is shown in the danger colour (display only). */
export const HIGH_ERROR_RATE = 0.2;

export type TargetHealth = ProvidersReportDto["targets"][number];

/**
 * Whole seconds left of an open circuit's cool-down. The deadline is counted from when the
 * browser received the report, not from `generatedAt`, so a clock difference between the
 * gateway and the browser cannot stretch or skip the countdown.
 */
export function cooldownSeconds(remainingMs: number, receivedAt: number, now: number): number {
  return Math.max(0, Math.ceil((receivedAt + remainingMs - now) / 1000));
}

export const isIdle = (target: TargetHealth): boolean => target.window.requests === 0;

/** "33.3 %", or "—" for an idle target: no attempts means no rate, not a zero one. */
export function formatErrorRate(target: TargetHealth): string {
  return isIdle(target) ? MISSING : `${(target.window.errorRate * 100).toFixed(1)} %`;
}

export const isHighErrorRate = (target: TargetHealth): boolean =>
  !isIdle(target) && target.window.errorRate >= HIGH_ERROR_RATE;
