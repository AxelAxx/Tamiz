"use client";

/**
 * A thin React wrapper over CodeMirror 6 for YAML (spec 008 research R-12): line numbers, a
 * lint gutter fed with the issues the screen computes, history and the default keymap.
 * `Tab` indents; `Esc` then `Tab` leaves the editor (CodeMirror's documented model).
 * `Mod-s` asks to save.
 *
 * The editor owns its text while the operator types; the screen replaces it only through
 * `document.revision` (load, reload, discard, after a save).
 */
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { yaml } from "@codemirror/lang-yaml";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { type Diagnostic, lintGutter, setDiagnostics } from "@codemirror/lint";
import { EditorSelection, EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";

export interface EditorIssue {
  readonly line: number;
  readonly message: string;
}

const highlight = HighlightStyle.define([
  { tag: [tags.propertyName, tags.definition(tags.propertyName)], color: "var(--info)" },
  { tag: tags.comment, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--warning)" },
  {
    tag: [tags.punctuation, tags.separator, tags.squareBracket, tags.brace],
    color: "var(--muted-foreground)",
  },
]);

const theme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--card)",
    color: "var(--foreground)",
    fontSize: "13px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.85" },
  ".cm-content": { caretColor: "var(--foreground)", padding: "12px 0" },
  ".cm-gutters": {
    backgroundColor: "var(--card)",
    color: "var(--muted-foreground)",
    border: "none",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 12px", minWidth: "40px" },
  ".cm-activeLine": { backgroundColor: "color-mix(in oklch, var(--muted) 45%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklch, var(--info) 30%, transparent) !important",
  },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    backgroundColor: "var(--danger-soft)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
  },
});

function toDiagnostics(state: EditorState, issues: ReadonlyArray<EditorIssue>): Diagnostic[] {
  const lines = state.doc.lines;
  return issues
    .filter((issue) => issue.line >= 1 && issue.line <= lines)
    .map((issue) => {
      const line = state.doc.line(issue.line);
      // The whole line, from its first non-blank character, is the marked range.
      const indent = line.text.length - line.text.trimStart().length;
      return {
        from: line.from + Math.min(indent, line.length),
        to: line.to,
        severity: "error",
        message: issue.message,
      };
    });
}

export function YamlEditor({
  document,
  issues,
  goTo,
  label,
  describedBy,
  onChange,
  onSave,
}: {
  readonly document: { readonly text: string; readonly revision: number };
  readonly issues: ReadonlyArray<EditorIssue>;
  /** A line to scroll to and select; a new object each time, so the same line works twice. */
  readonly goTo?: { readonly line: number };
  readonly label: string;
  readonly describedBy?: string;
  readonly onChange: (text: string) => void;
  readonly onSave: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onSave });
  callbacks.current = { onChange, onSave };

  // biome-ignore lint/correctness/useExhaustiveDependencies: created once; text changes go through `revision`
  useEffect(() => {
    if (host.current === null) return;
    const created = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: document.text,
        extensions: [
          lineNumbers(),
          lintGutter(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          indentUnit.of("  "),
          EditorState.tabSize.of(2),
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                callbacks.current.onSave();
                return true;
              },
            },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          yaml(),
          syntaxHighlighting(highlight),
          theme,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            "aria-label": label,
            ...(describedBy === undefined ? {} : { "aria-describedby": describedBy }),
            "data-testid": "policy-yaml",
            // Explicit, so checkers see a focusable element inside the scroll region.
            tabindex: "0",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = created;
    return () => {
      created.destroy();
      view.current = null;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new revision replaces the text
  useEffect(() => {
    const current = view.current;
    if (current === null || current.state.doc.toString() === document.text) return;
    current.dispatch({
      changes: { from: 0, to: current.state.doc.length, insert: document.text },
      selection: EditorSelection.cursor(0),
      scrollIntoView: true,
    });
  }, [document.revision]);

  useEffect(() => {
    const current = view.current;
    if (current === null) return;
    current.dispatch(setDiagnostics(current.state, toDiagnostics(current.state, issues)));
  }, [issues]);

  useEffect(() => {
    const current = view.current;
    if (current === null || goTo === undefined) return;
    const line = current.state.doc.line(Math.min(Math.max(goTo.line, 1), current.state.doc.lines));
    current.dispatch({
      selection: EditorSelection.range(line.from, line.to),
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
    current.focus();
  }, [goTo]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}
