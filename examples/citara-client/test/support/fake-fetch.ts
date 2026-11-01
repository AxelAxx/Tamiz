/** A scripted `fetch` for the unit tests: answers in order and records every request. */

export interface Recorded {
  readonly url: string;
  readonly headers: Headers;
  readonly body: string | undefined;
}

export type Responder = (request: Recorded) => Response | Promise<Response>;

export function fakeFetch(responders: ReadonlyArray<Responder>): {
  readonly fetch: typeof fetch;
  readonly requests: Recorded[];
} {
  const requests: Recorded[] = [];
  let next = 0;
  const fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    const recorded: Recorded = {
      url: request.url,
      headers: request.headers,
      body: request.body === null ? undefined : await request.text(),
    };
    requests.push(recorded);
    const responder = responders[next++];
    if (responder === undefined) throw new Error(`unexpected request ${recorded.url}`);
    return responder(recorded);
  };
  return { fetch: fetchImpl as typeof fetch, requests };
}

export const TAMIZ_HEADERS = {
  "x-request-id": "req-1",
  "x-tamiz-route": "ollama-llama",
  "x-tamiz-rule": "pinned-local",
  "x-tamiz-sensitivity": "none",
  "x-tamiz-privacy": "allow",
};

export function completion(content: string, headers: Record<string, string> = {}): Responder {
  return () =>
    Response.json(
      {
        id: "chatcmpl-1",
        object: "chat.completion",
        created: 1,
        model: "llama3.1:8b",
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      },
      { headers: { ...TAMIZ_HEADERS, ...headers } },
    );
}

export function streamed(parts: ReadonlyArray<string>): Responder {
  return () => {
    const chunk = (delta: object, extra: object = {}) =>
      `data: ${JSON.stringify({
        id: "chatcmpl-1",
        object: "chat.completion.chunk",
        created: 1,
        model: "llama3.1:8b",
        choices: [{ index: 0, delta, finish_reason: null }],
        ...extra,
      })}\n\n`;
    const body = [
      ...parts.map((text) => chunk({ content: text })),
      `data: ${JSON.stringify({
        id: "chatcmpl-1",
        object: "chat.completion.chunk",
        created: 1,
        model: "llama3.1:8b",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      })}\n\n`,
      `data: ${JSON.stringify({
        id: "chatcmpl-1",
        object: "chat.completion.chunk",
        created: 1,
        model: "llama3.1:8b",
        choices: [],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      })}\n\n`,
      "data: [DONE]\n\n",
    ].join("");
    return new Response(body, {
      headers: { ...TAMIZ_HEADERS, "content-type": "text/event-stream" },
    });
  };
}

export function gatewayError(
  status: number,
  type: string,
  headers: Record<string, string> = {},
): Responder {
  return () =>
    Response.json(
      { error: { type, message: `${type} for the test`, requestId: "req-1" } },
      { status, headers: { "x-request-id": "req-1", ...headers } },
    );
}

export function auditPage(entries: ReadonlyArray<object>, nextCursor: string | null = null) {
  return () => Response.json({ entries, nextCursor });
}

/** A minimal entry valid against `AuditEntrySchema`. */
export function auditEntry(requestId: string, overrides: object = {}): object {
  return {
    id: "6f1c1f62-5a0e-4c1e-9c62-0c1b8b0d9a11",
    requestId,
    clientId: "citara",
    startedAt: "2026-11-01T10:00:00.000Z",
    endedAt: "2026-11-01T10:00:00.100Z",
    latencyMs: 100,
    requestHash: "a".repeat(64),
    policyId: "default",
    policyVersion: 3,
    ruleId: "pinned-local",
    taskType: "chat",
    size: "short",
    sensitivity: "none",
    entities: {},
    privacyAction: "allow",
    outcome: "answered",
    streamed: false,
    abandoned: [],
    costUsd: 0,
    ...overrides,
  };
}
