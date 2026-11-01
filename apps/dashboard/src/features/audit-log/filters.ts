/**
 * Audit log filters held in the URL (spec 008 US4-3, US4-5, research R-07).
 *
 * The filters are the fields of `AuditQuerySchema` without `cursor` and `limit`. Each search
 * param is parsed with its own field schema, so one bad value is dropped (and reported)
 * while the others still apply. The URL holds only enums, ids and ISO dates, never content.
 */
import { type AuditQueryDto, AuditQuerySchema } from "@tamiz/contracts";

export const FILTER_KEYS = [
  "from",
  "to",
  "route",
  "rule",
  "sensitivity",
  "action",
  "entity",
  "outcome",
] as const;

export type FilterKey = (typeof FILTER_KEYS)[number];
export type AuditFilters = Partial<Pick<AuditQueryDto, FilterKey>>;

export interface ParsedFilters {
  readonly filters: AuditFilters;
  /** Keys whose values were invalid and were dropped. */
  readonly dropped: ReadonlyArray<FilterKey>;
}

export function filtersFromParams(params: URLSearchParams): ParsedFilters {
  const filters: Record<string, string> = {};
  const dropped: FilterKey[] = [];
  for (const key of FILTER_KEYS) {
    const raw = params.get(key);
    if (raw === null || raw === "") continue;
    const parsed = AuditQuerySchema.shape[key].safeParse(raw);
    if (parsed.success && parsed.data !== undefined) filters[key] = parsed.data;
    else dropped.push(key);
  }
  return { filters: filters as AuditFilters, dropped };
}

/** The search params for `filters`, in a stable order; empty values are left out. */
export function paramsFromFilters(filters: AuditFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value !== undefined && value !== "") params.set(key, value);
  }
  return params;
}

/** The error to show next to the dates, or undefined when the range is valid (US4-5). */
export function rangeError(from: string | undefined, to: string | undefined): string | undefined {
  if (from === undefined || to === undefined) return undefined;
  return Date.parse(from) >= Date.parse(to) ? '"To" must be after "From".' : undefined;
}

export const FILTER_LABELS: Readonly<Record<FilterKey, string>> = {
  from: "From",
  to: "To",
  route: "Route",
  rule: "Rule",
  sensitivity: "Sensitivity",
  action: "Privacy action",
  entity: "Entity kind",
  outcome: "Outcome",
};
