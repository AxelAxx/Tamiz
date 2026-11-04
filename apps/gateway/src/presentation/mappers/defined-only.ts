/**
 * The fields of `value` that are defined. Under `exactOptionalPropertyTypes` an optional
 * field may be absent but not `undefined`, while a parsed query string gives `undefined`
 * for every filter not sent; this drops them, with the type saying so.
 */
export function definedOnly<T extends Readonly<Record<string, unknown>>>(
  value: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const entries = Object.entries(value).filter(([, field]) => field !== undefined);
  return Object.fromEntries(entries) as { [K in keyof T]?: Exclude<T[K], undefined> };
}
