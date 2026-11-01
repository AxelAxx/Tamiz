/**
 * Spec 010 US4: the guide's tables stay equal to the gateway's OpenAPI document, the
 * contracts, the example's configuration and the default policy (research R-09). Each
 * table follows an HTML comment marker such as `<!-- table:headers -->`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { errorTypeToHttpStatus } from "@tamiz/contracts";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ERROR_CLASSES, GUIDANCE } from "../src/classify.js";
import { CONFIG_VARIABLES } from "../src/config.js";
import { harnessUrls, reset, runAgainstHarness } from "./support/harness.js";

const GUIDE = readFileSync(
  resolve(import.meta.dirname, "../../../docs/integrations/citara.md"),
  "utf8",
);

/** Rows of the table after `<!-- table:<name> -->`, without header and separator. */
function table(name: string): ReadonlyArray<ReadonlyArray<string>> {
  const marker = `<!-- table:${name} -->`;
  const start = GUIDE.indexOf(marker);
  if (start === -1) throw new Error(`the guide has no ${marker}`);
  const lines = GUIDE.slice(start + marker.length)
    .trimStart()
    .split(/\r?\n/);
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.startsWith("|")) break;
    rows.push(
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim().replaceAll("`", "")),
    );
  }
  return rows.slice(2);
}

const column = (name: string, index: number) => table(name).map((row) => row[index] ?? "");

type OpenApi = {
  paths: Record<
    string,
    { post?: { responses: Record<string, { headers?: Record<string, unknown> }> } }
  >;
};

let chatResponses: Record<string, { headers?: Record<string, unknown> }> = {};

beforeAll(async () => {
  const origin = new URL(harnessUrls().baseUrl).origin;
  const document = (await (await fetch(`${origin}/openapi.json`)).json()) as OpenApi;
  const operation = document.paths["/v1/chat/completions"]?.post;
  if (operation === undefined) throw new Error("no POST /v1/chat/completions in /openapi.json");
  chatResponses = operation.responses;
});

beforeEach(async () => {
  await reset();
});

describe("US4 - the integration guide is accurate", () => {
  it("US4-1: the header table equals the chat endpoint's documented headers plus retry-after", () => {
    const documented = Object.keys(chatResponses["200"]?.headers ?? {});
    expect(documented.length).toBeGreaterThan(0);
    expect([...column("headers", 0)].sort()).toEqual([...documented, "retry-after"].sort());
  });

  it("US4-2: the error table lists each error type of the chat endpoint once, with status and guidance", () => {
    const statuses = new Set(
      Object.keys(chatResponses)
        .filter((status) => status !== "200")
        .map(Number),
    );
    statuses.add(500); // `internal`: any unexpected failure, not a documented response
    const expected = Object.entries(errorTypeToHttpStatus)
      .filter(([, status]) => statuses.has(status))
      .map(([type, status]) => [type, String(status), GUIDANCE[ERROR_CLASSES[type as never]]]);
    const rows = table("errors").map((row) => row.slice(0, 3));
    expect([...rows].sort()).toEqual([...expected].sort());
  });

  it("US4-3: the configuration table lists exactly the variables the example reads", () => {
    expect([...column("config", 0)].sort()).toEqual([...CONFIG_VARIABLES].sort());
  });

  it("US4-4: every model alias behaves as the model table says", async () => {
    const pinned = column("models", 1).filter((rule) => rule !== "—");
    for (const [model = "", rule = ""] of table("models")) {
      const run = await runAgainstHarness({ TAMIZ_PROMPT: "hello", TAMIZ_MODEL: model });
      expect(run.fields.status, model).toBe("200");
      if (rule === "—") expect(pinned, model).not.toContain(run.fields.rule);
      else expect(run.fields.rule, model).toBe(rule);
    }
  });
});
