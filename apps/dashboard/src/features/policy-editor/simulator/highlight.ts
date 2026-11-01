/**
 * Splits a message into plain and highlighted segments (spec 008 US3-5, research R-06).
 *
 * The gateway's offsets are UTF-16 indices; JavaScript strings are UTF-16, so `slice` is
 * exact for accents and emoji. Overlapping spans become one segment covering their union
 * that carries every kind. The segments always join back to the original text.
 */
import type { PrivacyEntityKindDto } from "@tamiz/contracts";

export interface SpanInput {
  readonly kind: PrivacyEntityKindDto;
  readonly start: number;
  readonly end: number;
  readonly score: number;
}

export type Segment =
  | { readonly text: string; readonly entities?: undefined }
  | { readonly text: string; readonly entities: ReadonlyArray<SpanInput> };

/** Clamps spans to the text and merges overlapping ones into unions, in order. */
function unions(text: string, spans: ReadonlyArray<SpanInput>) {
  const clamped = spans
    .map((s) => ({ ...s, start: Math.max(0, s.start), end: Math.min(text.length, s.end) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const groups: Array<{ start: number; end: number; entities: SpanInput[] }> = [];
  for (const span of clamped) {
    const last = groups.at(-1);
    if (last !== undefined && span.start < last.end) {
      last.end = Math.max(last.end, span.end);
      last.entities.push(span);
    } else {
      groups.push({ start: span.start, end: span.end, entities: [span] });
    }
  }
  return groups;
}

export function highlightSegments(text: string, spans: ReadonlyArray<SpanInput>): Segment[] {
  const segments: Segment[] = [];
  let at = 0;
  for (const group of unions(text, spans)) {
    if (group.start > at) segments.push({ text: text.slice(at, group.start) });
    segments.push({ text: text.slice(group.start, group.end), entities: group.entities });
    at = group.end;
  }
  if (at < text.length) segments.push({ text: text.slice(at) });
  return segments;
}

/** `<PERSON_1>`-style placeholders of an anonymized message, split out for marking. */
export function placeholderSegments(
  text: string,
): Array<{ readonly text: string; readonly placeholder: boolean }> {
  return text
    .split(/(<[A-Z_]+_\d+>)/)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, placeholder: /^<[A-Z_]+_\d+>$/.test(part) }));
}
