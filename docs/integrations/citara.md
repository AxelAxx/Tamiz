# Integrating Citara with Tamiz

Citara sends its LLM calls through Tamiz by pointing its OpenAI-compatible client at
Tamiz's base URL with a Tamiz client key. Nothing else in Citara's calling code changes:
requests and responses keep the OpenAI chat completion shape. In return, every response
says where the request went and what Tamiz did about personal data, and every request
leaves one content-free audit entry an operator can look up by its request id.

This page is written for Citara, Tamiz's first integrating client, but it applies to any
application that uses an OpenAI-compatible client. The changes inside Citara's own code
base (its client configuration, secrets and deployment) live in Citara's repository.
Specification: `specs/010-citara-integration/`.

## Quick start

1. An operator issues a client key for Citara (see [Keys](#keys)).
2. In Citara, set the OpenAI client's base URL to Tamiz and its API key to that key:

   ```ts
   import OpenAI from "openai";

   const client = new OpenAI({
     baseURL: "http://localhost:3000/v1", // Tamiz, not api.openai.com
     apiKey: process.env.TAMIZ_API_KEY,   // a Tamiz client key, not a provider key
     maxRetries: 0,                        // see "Timeouts and retries"
     timeout: 70_000,
   });

   const { data, response } = await client.chat.completions
     .create({ model: "tamiz-auto", messages: [{ role: "user", content: "Hello" }] })
     .withResponse();
   console.log(data.choices[0]?.message.content, response.headers.get("x-tamiz-route"));
   ```

3. Try it with the example client in this repository, against the gateway's E2E harness
   (no Docker, no provider keys):

   ```bash
   TAMIZ_E2E_PROVIDERS=scripted pnpm --filter @tamiz/gateway e2e-gateway
   ```

   ```bash
   pnpm --filter @tamiz/example-citara-client build
   TAMIZ_BASE_URL=http://127.0.0.1:3210/v1 TAMIZ_API_KEY=<citara fixture key> \
   pnpm --filter @tamiz/example-citara-client start -- "Hello"
   ```

   The harness's fixture keys are in `apps/gateway/scripts/e2e-gateway.ts`; they are test
   values, not secrets. Against a real deployment, use the base URL and keys of that
   deployment.

The same request with `curl`:

```bash
curl -sS -D - http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $TAMIZ_API_KEY" \
  -H "Content-Type: application/json" \
  -H "x-request-id: citara-0001" \
  -d '{"model":"tamiz-auto","messages":[{"role":"user","content":"Hello"}]}'
```

## Keys

Each integrating client has its own key; the client name (`citara`) is what the audit log
records as `clientId`. Keys are stored hashed, compared in constant time and never logged.
An operator issues one in either way:

- **Database** (when the gateway runs with `DATABASE_URL`):
  `pnpm --filter @tamiz/gateway api-key:add citara` prints the key once and stores its hash.
  Revoke it by setting `revoked_at` on its `api_keys` row.
- **Environment**: `pnpm --filter @tamiz/gateway generate-api-key citara` prints a key and the
  entry to append to `TAMIZ_API_KEYS`. Revoke it by removing the entry and restarting.

Citara only needs a client key. Admin keys (`--admin`) open `/v1/admin/*` (audit, cost,
provider health) and belong to operators, not to the application.

## Base URL

The base URL includes `/v1`; the client appends `/chat/completions`.

- **Same host or Docker network**: `http://gateway:3000/v1` (compose service name) or
  `http://localhost:3000/v1`. Plain HTTP is acceptable only inside a private network.
- **Remote**: put Tamiz behind a reverse proxy that terminates TLS
  (`https://tamiz.example.internal/v1`). Tamiz does not terminate TLS itself, and keys must
  never travel over plain HTTP outside a private network.

## Models

The `model` field selects a route only through Tamiz's aliases; any other name (for
example `gpt-4o`) is routed as `tamiz-auto` is. Aliases of the default policy:

<!-- table:models -->
| Model | Rule | Meaning |
|---|---|---|
| `tamiz-auto` | — | No rule pins it: the policy decides by task type, size and the personal data found |
| `tamiz-local` | `pinned-local` | Local model only; fallbacks never leave the machine |
| `tamiz-frontier` | `pinned-frontier` | Frontier model; data of level `high` (names, emails, phones) is blocked, `critical` data is restricted to the local model |

## Response headers

Every response carries `x-request-id`. Once Tamiz has made a routing decision, the
response, errors included, says what it decided:

<!-- table:headers -->
| Header | Values | When |
|---|---|---|
| `x-request-id` | The request id: the client's own, when well formed, or a generated one | Always |
| `x-tamiz-route` | The target that answered or, on failure, the last one reached (for example `ollama-llama`) | A routing decision was made |
| `x-tamiz-rule` | The policy rule that matched, or `default` | A routing decision was made |
| `x-tamiz-fallback` | Abandoned targets in order, as `targetId:reason` | A target was abandoned |
| `x-tamiz-sensitivity` | `unknown`, `none`, `low`, `high` or `critical` (`unknown` when inspection failed) | The request was inspected |
| `x-tamiz-privacy` | `allow`, `anonymize;notice=v1` (`v2` with tools), `restrict_to_local` or `block` | The request was inspected |
| `retry-after` | Seconds to wait | 503 with every circuit open |

To correlate Citara's own logs with Tamiz, send `x-request-id` (1-128 characters of
`[A-Za-z0-9_-]`); a value outside that format is replaced, so always keep the id the
response returns. Never put personal data in it.

When the request is anonymized, the provider never sees the detected values; Tamiz puts
them back before the answer reaches Citara, so Citara receives the original values.

## Errors

Errors use one envelope, `{"error": {"type", "message", "requestId"}}`. The type tells
Citara what to do:

<!-- table:errors -->
| Error type | Status | Retry | Meaning |
|---|---|---|---|
| `invalid_request` | 400 | after fixing the request | The body fails the contract, is not JSON, or exceeds 1 MiB |
| `unauthorized` | 401 | after fixing the request | Missing or invalid key |
| `policy_blocked` | 451 | never | The policy refuses the request (privacy action or residency); the same request will always be refused |
| `internal` | 500 | never | Unexpected gateway error; report it with the request id |
| `provider_error` | 502 | never | Every target of the chain failed; Tamiz already fell back |
| `provider_unavailable` | 503 | later | Every circuit of the chain is open; wait `retry-after` |
| `privacy_unavailable` | 503 | later | The privacy service failed and the policy blocks in that case |
| `provider_timeout` | 504 | never | A target timed out last or the request deadline was reached |

## Timeouts and retries

Tamiz retries, falls back across providers and enforces a request deadline (60 s in the
default policy, `resilience.requestDeadlineMs`). Client-side retries on top multiply
provider calls and cost, and a 451 can never succeed. Therefore:

- set the client's own retries to `0` (OpenAI SDKs retry 408, 409, 429 and every 5xx by
  default);
- retry at most once, and only for the "later" errors above, after `retry-after`;
- set the client timeout above Tamiz's deadline (70 s for the default policy), so Citara
  does not abandon a request Tamiz is still serving;
- never resend after a network error or client timeout: the request may still be running.

## Streaming

`stream: true` works as with OpenAI. The Tamiz headers are final when the response starts
(before the first delta), because fallback happens before the first token and never after.
The last chunk carries `usage`. A client that closes the stream early ends the request;
its audit entry has outcome `cancelled`.

## Tool calling

OpenAI function tools (`tools`, `tool_choice`, assistant `tool_calls`, `tool` messages) pass
through Tamiz. Tool definitions, call arguments and tool results are inspected like
messages, so personal data in a tool result is routed and anonymized like any other.
Contract and limits: `specs/009-mcp-agent/tool-calling/spec.md`.

## What Tamiz stores

One audit entry per request: ids, `clientId`, times and latency, a keyed hash of the
messages (correlates identical requests, never readable), the policy and rule, task type and
size, sensitivity, entity counts by kind (never values or positions), the privacy action and
notice version, the outcome and block reason, the target and model, abandoned targets, token
usage, cost and tool counts with the names of called tools.

Tamiz never stores, logs or traces prompt or answer text, tool arguments or results, or the
key. Anonymization mappings live in memory for one request only.

An operator finds a request with `GET /v1/admin/audit` and an admin key. The API filters by
time, route, rule, sensitivity, action, entity and outcome, not by request id, so look in a
narrow time window and match `requestId`; the example client's audit check does exactly that.

## Limitations

- Personal data detection is statistical: a defence layer with published metrics, not a
  guarantee. See the [eval results](../../README.md#evals).
- Tamiz is not a certified compliance product.
- The default policy is an example; an operator adapts it to Citara's data and residency
  requirements.

## Example client configuration

The example (`examples/citara-client/`) reads only environment variables; invalid values
exit with status 2 and name the variable.

<!-- table:config -->
| Variable | Default | Meaning |
|---|---|---|
| `TAMIZ_BASE_URL` | required | Gateway base URL including `/v1` |
| `TAMIZ_API_KEY` | required | Client key issued for Citara |
| `TAMIZ_MODEL` | `tamiz-auto` | Model alias sent in the request |
| `TAMIZ_PROMPT` | required | The user message; the first CLI argument replaces it |
| `TAMIZ_STREAM` | `false` | `true` sends `stream: true` |
| `TAMIZ_REQUEST_ID` | none | Correlation id sent as `x-request-id` (`[A-Za-z0-9_-]{1,128}`) |
| `TAMIZ_TIMEOUT_MS` | `70000` | Client timeout in milliseconds (1000 to 600000) |
| `TAMIZ_ADMIN_KEY` | none | Admin key; when set, the example looks up its audit entry |
| `TAMIZ_AUDIT_WAIT_MS` | `5000` | How long the audit lookup polls (0 to 60000) |

It prints one `key: value` line per field (`status`, `request_id`, the Tamiz headers,
`error_type` and `retryable` on errors, `attempts`, `model`, `finish_reason`, `usage`,
`audit` or `audit_error`), then the answer. It never prints a key. Exit codes: `0` answered
(and audited, when checked), `1` failed, `2` invalid configuration.
