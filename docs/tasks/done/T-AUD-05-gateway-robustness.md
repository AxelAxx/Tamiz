# T-AUD-05 — Gateway robustness: invalid tool calls, unfinished streams, fail-closed anonymization

| Field | Value |
|---|---|
| Task | `T-AUD-05` (see `docs/tasks/BACKLOG.md`) |
| Feature | `003-resilience`, `005-privacy-aware-routing`, `009-mcp-agent` (tool calling) |
| Spec | `specs/003-resilience/spec.md` (FR-023 … FR-027), `specs/009-mcp-agent/tool-calling/` |
| Branch / PR | `T-AUD-05-gateway-robustness` / PR linked from the merge commit |
| Date | 2026-11-03 |
| Session | Claude Code (Opus 5.5) |
| Status | done (L20 moved to `T-AUD-11`) |

## What was done

This task fixes the gateway robustness findings of the code audit
(`docs/audit/2026-11-03-code-audit.md`).

- **M6, invalid tool calls:** a call to a tool the request did not declare, or one the AI
  SDK marks `invalid`, is now a `malformed_response` provider error.
  - It fails the attempt, so the chain falls back to the next target. Before, it reached
    presentation and failed the response contract.
  - In a stream, before the first token it fails the attempt; after it, it ends the
    stream with an error part.
  - `streamSSE` has an error handler. A failure after the headers went out sends one
    error event and is logged by name through pino, instead of a cut stream printed by
    Hono.
- **M7, unfinished streams:** a provider stream that ends with neither `finish` nor `error`
  flushes what was held and ends with an error part, and `stream.failed` is emitted.
- **M8, fail-closed anonymization:** if anonymization ever leaves a detected value in
  place, the request is not sent: it is an internal error, never clear text to the
  provider.
- **M9, client disconnects:** non-streamed requests take the client's abort signal, so a
  client that disconnects stops retries and fallbacks.
- **L9, a client already gone:** an abort that happened before inspection now aborts the
  privacy call at once.

## Files touched

- `apps/gateway/src/infrastructure/llm/ai-sdk-provider.ts`: `declared`, `undeclaredToolError`, applied to completions, to the stream's first part, and to later parts.
- `apps/gateway/src/presentation/routes/chat-completions.ts`, `src/presentation/app.ts`, `src/presentation/mappers/chat-completion-chunk.ts`: the `streamSSE` error handler, `onStreamError` and `chunks.internal()`.
- `apps/gateway/src/application/use-cases/stream-inference.ts`: the end of a stream without `finish` or `error`.
- `apps/gateway/src/application/use-cases/protect-request.ts`: fail closed on `unsafe`.
- `apps/gateway/src/application/use-cases/route-inference.ts`, `src/application/audit/with-audit.ts`, `src/application/tracing/with-tracing.ts`: the client signal, forwarded by both wrappers.
- `apps/gateway/src/application/use-cases/inspect-sensitivity.ts`: the pre-aborted signal.
- Tests:
  - `test/llm/tool-calling.adapter.test.ts`: two tests per adapter, eight in all. All eight failed before the fix.
  - `test/application/stream-inference.test.ts`: a stream that ends with no final part.
  - `test/application/inspect-sensitivity.test.ts`: a client already gone.
  - `test/application/route-inference.test.ts`: a client that went away.

## Decisions

- **Undeclared tools are checked in the adapter.** The adapter is where the SDK's
  `invalid` flag is visible, and where a provider error still lets the chain fall back.
  Presentation keeps its contract parse as the last line of defence.
- **M8 throws instead of returning a `Result`.** The state is impossible by construction:
  `notAnonymizableReason` routes such requests away first. A throw is an internal error,
  so nothing is sent, and it needs no new failure kind through every caller. Constitution
  VI allows exceptions for broken invariants at this point.
- **A malformed end of stream does not count for the circuit.** The breaker's rules count
  retryable failures only. The failure is still observable as `stream.failed`.
- **The stream error is logged by name only.** A `ZodError` message can quote the model's
  output, for example a tool name, and prompt content never reaches logs
  (constitution V).

## How it was verified

```bash
pnpm exec vitest run apps/gateway   # 859 passed, 35 skipped
pnpm --filter @tamiz/gateway typecheck ; pnpm arch ; pnpm exec biome check apps/gateway   # clean
```

The eight adapter tests were run with the adapter change stashed: all eight failed.

## Pending / follow-ups

- **L20, tolerant placeholder restore** (`<dni_1>`, `DNI_1`), is moved to `T-AUD-11`.
  The current behaviour fails safe: an altered placeholder is shown as is and never
  restored wrongly. A tolerant matcher needs its own tests against near-miss text.
- **M8 has no dedicated test.** Producing `unsafe` needs entities that
  `notAnonymizableReason` lets through, which the current code never does. That is the
  point of the guard.

## Pitfalls for the next session

- **`RouteInference` has a second parameter now.** Any new wrapper must forward `signal`,
  as `withAudit` and `withTracing` do.

## Links

- Audit: `docs/audit/2026-11-03-code-audit.md` (M6-M9, L9, L20)
- Related task records: `docs/tasks/done/T-AUD-04-breaker-streams-concurrency.md`, `docs/tasks/done/T-009-05-native-tool-calling.md`
