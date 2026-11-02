/**
 * The policy as YAML in the editor (spec 008 US5-1, US5-2, research R-12).
 *
 * - `policyToYaml`: the active policy as the operator reads it, short lists and small maps
 *   inline as in `policies/default.yaml`;
 * - `checkPolicyYaml`: the shape check while typing. YAML syntax errors and
 *   `RoutingPolicySchema` issues (the gateway's own schema), each with its dot path and
 *   the line it points at;
 * - `lineOfPath`: the line of a path the gateway sent back (US5-3);
 * - `outline`: the sections, targets and rules with their lines.
 *
 * Cross-field rules (a route naming an undeclared target, duplicate ids) are the gateway's:
 * they arrive on save as issues with paths and are shown the same way.
 */
import { type RoutingPolicyDto, RoutingPolicySchema } from "@tamiz/contracts";
import {
  Document,
  isMap,
  isPair,
  isScalar,
  isSeq,
  LineCounter,
  type Node,
  parseDocument,
  visit,
} from "yaml";

export interface PolicyIssue {
  /** Dot path (`rules.2.route.0`); `""` for the document itself. */
  readonly path: string;
  readonly message: string;
  /** 1-based line the issue points at, when it can be placed. */
  readonly line?: number;
}

export type PolicyCheck =
  | { readonly ok: true; readonly policy: RoutingPolicyDto; readonly issues: readonly [] }
  | { readonly ok: false; readonly issues: ReadonlyArray<PolicyIssue> };

const SMALL_MAP = 3;

const scalarList = (node: unknown): boolean =>
  isSeq(node) && node.items.every((item) => isScalar(item));

/**
 * The policy as YAML, laid out like `policies/default.yaml`: a blank line between sections,
 * scalar lists and small maps of scalars (or scalar lists) on one line.
 */
export function policyToYaml(policy: RoutingPolicyDto): string {
  const doc = new Document(policy);
  visit(doc, {
    Seq(_, node) {
      if (scalarList(node)) node.flow = true;
    },
    Map(_, node) {
      if (node === doc.contents) return;
      const inline = node.items.every((pair) => isScalar(pair.value) || scalarList(pair.value));
      if (inline && node.items.length <= SMALL_MAP) node.flow = true;
    },
  });
  if (isMap(doc.contents)) {
    for (const [index, pair] of doc.contents.items.entries()) {
      const key = pair.key;
      if (index > 0 && isScalar(key) && !isScalar(pair.value)) key.spaceBefore = true;
    }
  }
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

type Segment = string | number;

function segments(path: string): Segment[] {
  if (path === "") return [];
  return path.split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

/** The node at `path`, or its deepest existing ancestor. */
function nodeAt(doc: Document.Parsed, path: ReadonlyArray<Segment>): Node | undefined {
  for (let depth = path.length; depth >= 0; depth -= 1) {
    const node = doc.getIn(path.slice(0, depth), true);
    if (node !== undefined && node !== null && typeof node === "object" && "range" in node) {
      return node as Node;
    }
  }
  return doc.contents ?? undefined;
}

/** The key node named `key` inside the map at `path` (an unknown key's own line). */
function keyAt(doc: Document.Parsed, path: ReadonlyArray<Segment>, key: string): Node | undefined {
  const map = path.length === 0 ? doc.contents : doc.getIn(path, true);
  if (!isMap(map)) return undefined;
  const pair = map.items.find(
    (item) => isPair(item) && isScalar(item.key) && item.key.value === key,
  );
  return pair !== undefined && isScalar(pair.key) ? pair.key : undefined;
}

function lineOf(node: Node | undefined, counter: LineCounter): number | undefined {
  const start = node?.range?.[0];
  return start === undefined ? undefined : counter.linePos(start).line;
}

function parse(text: string): { doc: Document.Parsed; counter: LineCounter } {
  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter, prettyErrors: false });
  return { doc, counter };
}

export function checkPolicyYaml(text: string): PolicyCheck {
  const { doc, counter } = parse(text);
  if (doc.errors.length > 0) {
    return {
      ok: false,
      issues: doc.errors.map((error) => ({
        path: "",
        message: `YAML: ${error.message.split("\n")[0] ?? error.code}`,
        line: counter.linePos(error.pos[0]).line,
      })),
    };
  }
  const parsed = RoutingPolicySchema.safeParse(doc.toJS());
  if (parsed.success) return { ok: true, policy: parsed.data, issues: [] };
  const issues: PolicyIssue[] = [];
  for (const issue of parsed.error.issues) {
    const path = issue.path.filter((s): s is Segment => typeof s !== "symbol");
    // An unknown key is placed on the key itself and named in the path.
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        issues.push({
          path: [...path, key].join("."),
          message: `Unknown key "${key}"`,
          ...withLine(lineOf(keyAt(doc, path, key), counter)),
        });
      }
      continue;
    }
    issues.push({
      path: path.join("."),
      message: issue.message,
      ...withLine(lineOf(nodeAt(doc, path), counter)),
    });
  }
  return { ok: false, issues };
}

const withLine = (line: number | undefined) => (line === undefined ? {} : { line });

/** The line a gateway issue's path points at in `text`, if the text still parses. */
export function lineOfPath(text: string, path: string): number | undefined {
  const { doc, counter } = parse(text);
  if (doc.errors.length > 0) return undefined;
  return lineOf(nodeAt(doc, segments(path)), counter);
}

export interface OutlineItem {
  readonly label: string;
  readonly line: number;
  readonly depth: 0 | 1;
}

/** Top-level sections, then each target and rule by id. */
export function outline(text: string): ReadonlyArray<OutlineItem> {
  const { doc, counter } = parse(text);
  if (!isMap(doc.contents)) return [];
  const items: OutlineItem[] = [];
  for (const pair of doc.contents.items) {
    if (!isScalar(pair.key)) continue;
    const label = String(pair.key.value);
    const line = lineOf(pair.key, counter);
    if (line !== undefined) items.push({ label, line, depth: 0 });
    if ((label === "targets" || label === "rules") && isSeq(pair.value)) {
      for (const entry of pair.value.items) {
        if (!isMap(entry)) continue;
        const id = entry.get("id", true);
        const at = lineOf(entry, counter);
        if (isScalar(id) && at !== undefined)
          items.push({ label: String(id.value), line: at, depth: 1 });
      }
    }
  }
  return items;
}
