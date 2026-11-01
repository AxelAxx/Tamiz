/**
 * Number, money and time formatting (spec 008 design-brief §7, design `screens/*.html`).
 *
 * Money keeps four decimals below one dollar, so sub-cent request costs stay visible;
 * numbers group thousands; latency is in ms below one second, then seconds; absolute times
 * are UTC and say so. Callers render the results with the `tabular` utility.
 */

const GROUPED = new Intl.NumberFormat("en-US");
const DOLLARS = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `—` for a missing value, the design's placeholder. */
export const MISSING = "—";

export function formatUsd(value: number | undefined): string {
  if (value === undefined) return MISSING;
  if (value === 0) return "$0.0000";
  if (value < 0.0001) return "<$0.0001";
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${DOLLARS.format(value)}`;
}

export function formatNumber(value: number | undefined): string {
  return value === undefined ? MISSING : GROUPED.format(value);
}

/** A ratio (0.871) as a percentage with one decimal ("87.1%"). */
export function formatPercent(ratio: number | undefined): string {
  return ratio === undefined ? MISSING : `${(ratio * 100).toFixed(1)}%`;
}

/** "840 ms", "1.25 s", "12.5 s". */
export function formatLatency(ms: number | undefined): string {
  if (ms === undefined) return MISSING;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = (ms / 1000).toFixed(ms < 10_000 ? 2 : 1).replace(/\.?0+$/, "");
  return `${seconds} s`;
}

/** "just now", "12 s ago", "3 min ago", "2 h ago". */
export function formatAgo(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 5) return "just now";
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}

/** "2026-11-01 12:04:15.120 UTC". */
export function formatUtc(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").replace("Z", " UTC");
}

/** "12:04:15" (UTC). */
export function formatUtcTime(iso: string): string {
  return new Date(iso).toISOString().slice(11, 19);
}

/** "2026-11-01" (the UTC day, as cost days are labelled). */
export function formatUtcDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
