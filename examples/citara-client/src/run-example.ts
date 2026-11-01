/**
 * One request through Tamiz with an unmodified OpenAI client (spec 010 US1-US3).
 *
 * The only Tamiz-specific settings are the base URL and the key. SDK retries are off
 * (research R-03): Tamiz already retries and falls back inside its deadline, so the example
 * retries once, and only for "try later" answers. Every Tamiz header is reported verbatim;
 * with an admin key, the audit entry is looked up by the request id the gateway returned.
 */
import OpenAI from "openai";
import { checkAudit } from "./audit-check.js";
import { classifyError, retryAfterMs } from "./classify.js";
import type { ExampleConfig } from "./config.js";
import { guardedWriter, type RunReport, type Write } from "./report.js";

export interface RunDeps {
  readonly fetch: typeof fetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly write: Write;
}

/** Exit codes of spec 010 data-model section 4 (2, invalid configuration, is `main`'s). */
export type ExitCode = 0 | 1;

const MAX_ATTEMPTS = 2;

const TAMIZ_HEADERS = {
  route: "x-tamiz-route",
  rule: "x-tamiz-rule",
  fallback: "x-tamiz-fallback",
  sensitivity: "x-tamiz-sensitivity",
  privacy: "x-tamiz-privacy",
  retry_after: "retry-after",
} as const;

type Attempt =
  | { readonly kind: "answered"; readonly report: RunReport; readonly requestId: string | null }
  | {
      readonly kind: "failed";
      readonly report: RunReport;
      readonly requestId: string | null;
      readonly retryable: boolean;
      readonly waitMs: number;
    };

export async function runExample(config: ExampleConfig, deps: RunDeps): Promise<ExitCode> {
  const print = guardedWriter(deps.write, [config.apiKey, config.adminKey ?? ""]);
  const client = new OpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    timeout: config.timeoutMs,
    maxRetries: 0,
    fetch: deps.fetch,
  });
  const startedAt = deps.now();

  let attempt = await send(client, config);
  let attempts = 1;
  while (attempt.kind === "failed" && attempt.retryable && attempts < MAX_ATTEMPTS) {
    await deps.sleep(attempt.waitMs);
    attempt = await send(client, config);
    attempts++;
  }

  const report: RunReport = { ...attempt.report, attempts: String(attempts) };
  let auditOk = true;
  if (config.adminKey !== undefined && attempt.requestId !== null) {
    const audit = await checkAudit(
      {
        baseUrl: config.baseUrl,
        adminKey: config.adminKey,
        requestId: attempt.requestId,
        startedAt,
        waitMs: config.auditWaitMs,
      },
      deps,
    );
    if (audit.kind === "found") {
      Object.assign(report, { audit: JSON.stringify(audit.entry) });
    } else {
      Object.assign(report, { audit_error: audit.kind });
      auditOk = false;
    }
  }
  print(report);
  return attempt.kind === "answered" && auditOk ? 0 : 1;
}

async function send(client: OpenAI, config: ExampleConfig): Promise<Attempt> {
  const messages = [{ role: "user" as const, content: config.prompt }];
  const options =
    config.requestId === undefined ? {} : { headers: { "x-request-id": config.requestId } };
  try {
    if (config.stream) {
      const { data, response } = await client.chat.completions
        .create({ model: config.model, messages, stream: true }, options)
        .withResponse();
      let answer = "";
      let model: string | undefined;
      let finishReason: string | undefined;
      let usage: string | undefined;
      for await (const chunk of data) {
        model = chunk.model;
        const choice = chunk.choices[0];
        answer += choice?.delta.content ?? "";
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (chunk.usage) usage = usageLine(chunk.usage);
      }
      return answered(response, {
        ...(model !== undefined ? { model } : {}),
        ...(finishReason !== undefined ? { finish_reason: finishReason } : {}),
        ...(usage !== undefined ? { usage } : {}),
        answer,
      });
    }
    const { data, response } = await client.chat.completions
      .create({ model: config.model, messages }, options)
      .withResponse();
    const choice = data.choices[0];
    return answered(response, {
      model: data.model,
      ...(choice?.finish_reason ? { finish_reason: choice.finish_reason } : {}),
      ...(data.usage ? { usage: usageLine(data.usage) } : {}),
      answer: choice?.message.content ?? "",
    });
  } catch (error) {
    return failed(error);
  }
}

function answered(response: Response, body: RunReport): Attempt {
  const requestId = response.headers.get("x-request-id");
  return {
    kind: "answered",
    requestId,
    report: { ...headerFields(response.status, requestId, response.headers), ...body },
  };
}

function failed(error: unknown): Attempt {
  if (error instanceof OpenAI.APIError && error.status !== undefined && error.headers) {
    const { errorType, errorClass } = classifyError(error.status, error.type);
    const requestId = error.headers.get("x-request-id");
    const retryable = errorClass === "later";
    return {
      kind: "failed",
      requestId,
      retryable,
      waitMs: retryAfterMs(error.headers.get("retry-after")),
      report: {
        ...headerFields(error.status, requestId, error.headers),
        error_type: errorType,
        retryable: String(retryable),
      },
    };
  }
  // No answer from the gateway: the request may still be in flight, so never resend it.
  const timedOut = error instanceof OpenAI.APIConnectionTimeoutError;
  return {
    kind: "failed",
    requestId: null,
    retryable: false,
    waitMs: 0,
    report: {
      status: "none",
      error_type: timedOut ? "client_timeout" : "network_error",
      retryable: "false",
    },
  };
}

function headerFields(status: number, requestId: string | null, headers: Headers): RunReport {
  const fields: Record<string, string> = {};
  for (const [field, header] of Object.entries(TAMIZ_HEADERS)) {
    const value = headers.get(header);
    if (value !== null) fields[field] = value;
  }
  return {
    status: String(status),
    ...(requestId !== null ? { request_id: requestId } : {}),
    ...fields,
  };
}

function usageLine(usage: OpenAI.CompletionUsage): string {
  return JSON.stringify(usage);
}
