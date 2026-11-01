import { describe, expect, it } from "vitest";
import {
  highlightSegments,
  placeholderSegments,
  type SpanInput,
} from "@/features/policy-editor/simulator/highlight";

// Spec 008 US3-5, research R-06 (tasks.md T026). Synthetic texts only.

const span = (kind: SpanInput["kind"], start: number, end: number): SpanInput => ({
  kind,
  start,
  end,
  score: 1,
});

const joined = (text: string, spans: ReadonlyArray<SpanInput>) =>
  highlightSegments(text, spans)
    .map((s) => s.text)
    .join("");

describe("highlightSegments", () => {
  it("cuts a DNI at its exact offsets and leaves the text unchanged", () => {
    const text = "Resume el expediente de 12345678Z para el comité.";
    const segments = highlightSegments(text, [span("DNI", 24, 33)]);
    expect(segments).toEqual([
      { text: "Resume el expediente de " },
      { text: "12345678Z", entities: [span("DNI", 24, 33)] },
      { text: " para el comité." },
    ]);
    expect(joined(text, [span("DNI", 24, 33)])).toBe(text);
  });

  it("uses UTF-16 offsets: accents and emoji (surrogate pairs) before the span", () => {
    const text = "Lucía 👋🏽 escribe a lucia.perez@example.com hoy";
    const start = text.indexOf("lucia.perez");
    const end = start + "lucia.perez@example.com".length;
    // "Lucía " is 6 units, the waving hand with its skin tone 4 (two surrogate pairs) and
    // " escribe a " 11: the offsets count UTF-16 units, as the gateway does.
    expect(start).toBe(21);
    const segments = highlightSegments(text, [span("EMAIL", start, end)]);
    expect(segments[1]).toEqual({
      text: "lucia.perez@example.com",
      entities: [span("EMAIL", start, end)],
    });
    expect(joined(text, [span("EMAIL", start, end)])).toBe(text);
  });

  it("highlights an emoji-adjacent name without splitting a surrogate pair", () => {
    const text = "🙂Lucía Pérez";
    const segments = highlightSegments(text, [span("PERSON", 2, 13)]);
    expect(segments).toEqual([
      { text: "🙂" },
      { text: "Lucía Pérez", entities: [span("PERSON", 2, 13)] },
    ]);
  });

  it("draws overlapping spans as their union, carrying both labels", () => {
    const text = "Cuenta ES91 2100 0418 4502 0005 1332 fin";
    const iban = span("IBAN", 7, 36);
    const phone = span("PHONE", 12, 21);
    const segments = highlightSegments(text, [phone, iban]);
    expect(segments).toEqual([
      { text: "Cuenta " },
      { text: "ES91 2100 0418 4502 0005 1332", entities: [iban, phone] },
      { text: " fin" },
    ]);
    expect(joined(text, [phone, iban])).toBe(text);
  });

  it("chains overlaps and keeps separate spans apart", () => {
    const text = "aaaa bbbb cccc";
    const segments = highlightSegments(text, [
      span("PERSON", 0, 6),
      span("LOCATION", 5, 9),
      span("EMAIL", 10, 14),
    ]);
    expect(segments.map((s) => [s.text, s.entities?.map((e) => e.kind)])).toEqual([
      ["aaaa bbbb", ["PERSON", "LOCATION"]],
      [" ", undefined],
      ["cccc", ["EMAIL"]],
    ]);
  });

  it("ignores empty or out-of-range spans and keeps a text with none whole", () => {
    expect(highlightSegments("hola", [])).toEqual([{ text: "hola" }]);
    expect(highlightSegments("hola", [span("DNI", 3, 3), span("DNI", 10, 12)])).toEqual([
      { text: "hola" },
    ]);
    expect(joined("hola", [span("DNI", 2, 99)])).toBe("hola");
  });
});

describe("placeholderSegments", () => {
  it("marks each placeholder and keeps the rest as text", () => {
    expect(placeholderSegments("Informe de <PERSON_1> (<EMAIL_1>) ya.")).toEqual([
      { text: "Informe de ", placeholder: false },
      { text: "<PERSON_1>", placeholder: true },
      { text: " (", placeholder: false },
      { text: "<EMAIL_1>", placeholder: true },
      { text: ") ya.", placeholder: false },
    ]);
  });
});
