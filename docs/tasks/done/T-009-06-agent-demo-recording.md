# T-009-06 — Record the answered agent demo on the full stack

| Field | Value |
|---|---|
| Task | `T-009-06` (see `docs/tasks/BACKLOG.md`) |
| Feature | `009-mcp-agent` |
| Spec | `specs/009-mcp-agent/spec.md` US5-6, SC-004; `tasks.md` T030; `quickstart.md` §7 |
| Branch / PR | `T-009-06-agent-demo-recording` / PR linked from the merge commit |
| Date | 2026-11-03 |
| Session | Claude Code (Opus 5.5) |
| Status | done (recorded); SC-004 **partially met**: every model call is audited on the local route, but no local model gave a fully correct answer (follow-up `T-009-07`) |

## What was done

The demo was run against the full compose stack (`T-OPS-01`). The setup:
- the gateway on `default.yaml` (the rule `pinned-local` exists there, not in
  `local-only.yaml`);
- Postgres seeded with `apps/mcp-server/demo/seed-audit.sql` (114 synthetic rows);
- Ollama on CPU;
- the MCP server on `--transport http` (port 3300, because the compose dashboard holds
  3100).

The agent ran with both tool protocols, first on `llama3.1:8b` and then on `qwen2.5:3b`
through a policy override, as T030 allows. The step limit (6) was not changed.

The **audit half** of SC-004 holds in every run: each model call appears in
`GET /v1/admin/audit?rule=pinned-local` once, on target `ollama-llama`. The **answer
half** does not: no run names the cause together with the two daily totals and nothing
wrong. The closest run is `llama3.1:8b` with the text protocol. It names
`anthropic-sonnet` and its growth from $0.31 to $0.732, in 6 calls. But it also says that
`ollama-llama` is the route that changed most, which is false.

Expected (from the seed): yesterday $0.842 against $0.42 the day before, because
`anthropic-sonnet` went from 10 requests ($0.31) to 24 ($0.732).

## Runs

| Model | Protocol | Model calls | Tool calls | Answer | Correct? | Time |
|---|---|---|---|---|---|---|
| `llama3.1:8b` | native | 2 | 1 (`get_cost_report` by day, yesterday only) | Mistakes the baseline ($1.728) for the previous day; says spend "decreased"; announces a tool call it never makes | no | 34 s |
| `llama3.1:8b` | text | 6 | 5 (one `invalid_arguments`, a typo in `to`) | Names `anthropic-sonnet` $0.31 → $0.732; wrongly calls `ollama-llama` the biggest change; no daily totals | partly | 69 s |
| `qwen2.5:3b` | native | 3 | 2 (by day, both days) | Says yesterday cost $0.42 and nothing changed | no | 36 s |
| `qwen2.5:3b` | text | 3 | 2 (by day, by route) | Names `anthropic-sonnet` as the cause, with wrong amounts ($0.31 "yesterday") | no | 28 s |

Both models are deterministic here: a second `llama3.1:8b` native run gave the same
answer word for word. Repeating a run does not help.

### Transcript: `llama3.1:8b`, text protocol (the best run)

```text
$ TAMIZ_AGENT_TOOL_PROTOCOL=text pnpm --filter @tamiz/mcp-server agent:demo -- "why did spend rise yesterday?"
The route whose cost changed most is ollama-llama. Yesterday, its cost was $0, while today it is $0. The route anthropic-sonnet's cost rose from $0.31 to $0.732, and the route mistral-small's cost rose from $0.11 to $0.11.
```

Run record (tool arguments and the answer only; tool results are never printed):

```json
{
  "question": "why did spend rise yesterday?",
  "protocol": "text",
  "promptVersion": "system.v1",
  "model": "tamiz-local",
  "today": "2026-11-03",
  "steps": [
    { "kind": "tool", "tool": "get_cost_report", "arguments": { "from": "2026-11-02T00:00:00Z", "to": "2026-11-03T00:00:00Z", "groupBy": "day" }, "requestId": "183d4b23-a9c0-462f-9953-4fc1cc83c9e1", "ok": true },
    { "kind": "tool", "tool": "get_cost_report", "arguments": { "from": "2026-11-01T00:00:00Z", "to": "2026-11-02T00:00:0Z", "groupBy": "day" }, "requestId": "91fb8eff-8d8c-4c8b-8640-694662dd9258", "ok": false, "errorCode": "invalid_arguments" },
    { "kind": "tool", "tool": "get_cost_report", "arguments": { "from": "2026-11-01T00:00:00Z", "to": "2026-11-02T00:00:00Z", "groupBy": "day" }, "requestId": "cca1d228-c252-41f6-88c0-557a7a100538", "ok": true },
    { "kind": "tool", "tool": "get_cost_report", "arguments": { "from": "2026-11-02T00:00:00Z", "to": "2026-11-03T00:00:00Z", "groupBy": "route" }, "requestId": "7ea76816-262f-4d2e-9427-fe3e6d0dc1e7", "ok": true },
    { "kind": "tool", "tool": "get_cost_report", "arguments": { "from": "2026-11-01T00:00:00Z", "to": "2026-11-02T00:00:00Z", "groupBy": "route" }, "requestId": "235b6a85-8717-4f15-a2eb-691646b0e8cf", "ok": true },
    { "kind": "answer", "requestId": "178e01cc-129b-4334-88ed-a30447707c73" }
  ],
  "stopReason": "answered"
}
```

### Audit check for that run

`GET /v1/admin/audit?rule=pinned-local` (admin key), the entries of the run:

| requestId | target | model | rule | outcome | latency ms |
|---|---|---|---|---|---|
| 183d4b23-… | ollama-llama | llama3.1:8b | pinned-local | answered | 26 084 |
| 91fb8eff-… | ollama-llama | llama3.1:8b | pinned-local | answered | 7 767 |
| cca1d228-… | ollama-llama | llama3.1:8b | pinned-local | answered | 6 103 |
| 7ea76816-… | ollama-llama | llama3.1:8b | pinned-local | answered | 7 957 |
| 235b6a85-… | ollama-llama | llama3.1:8b | pinned-local | answered | 9 205 |
| 178e01cc-… | ollama-llama | llama3.1:8b | pinned-local | answered | 11 655 |

There is one entry per request id of the run record: 6 of 6. A sample entry also shows
`policyId: default`, `clientId: demo`, `sensitivity: low` and `privacyAction: allow`. It
shows `entities: { LOCATION: 7 }` too: the detector flags parts of the cost report's
text. That does not change the route, which is pinned local anyway.

The `qwen2.5:3b` runs were audited the same way, with `model: qwen2.5:3b` on target
`ollama-llama`: 3 of 3 calls for each protocol.

## Files touched

- `docs/tasks/done/T-009-06-agent-demo-recording.md` (this record).
- `specs/009-mcp-agent/tasks.md`: T030 checked, with the outcome.
- `docs/tasks/BACKLOG.md`: `T-009-06` done; new rows `T-009-07` and `T-OPS-05`.

No code changed. The runner and the policy override lived in the scratchpad only.

## Decisions

- **Recorded as partially met, not tuned until it passed.** The task is to record the
  run, and T030 forbids raising the step limit silently. Rewriting the system prompt
  until one deterministic run happens to pass would fit the prompt to one question. That
  belongs in a task with an evaluation set: `T-009-07`.
- **`default.yaml`, not the local machine's `local-only.yaml`.** The DoD queries rule
  `pinned-local`, which only `default.yaml` (and `demo-eu.yaml`) declare. The three cloud
  keys were placeholders, so nothing could leave the machine, and every agent request is
  pinned local anyway.
- **The `qwen2.5:3b` override was a scratch copy of `default.yaml`** with the local
  target's model changed, mounted into the gateway with a compose override. It had to go
  to `version: 4`; see the pitfalls. Afterwards the stored version 4 was deleted, the
  machine's `apps/gateway/.env.docker` was restored, and the stack was stopped. The
  volumes, with the seed, are kept.

## How it was verified

```bash
docker compose up -d --build            # healthy; ollama-pull exits 0, so --wait reports exit 1
docker compose exec -T postgres psql -U tamiz -d tamiz -f - < apps/mcp-server/demo/seed-audit.sql   # INSERT 0 114
pnpm --filter "@tamiz/mcp-server..." build
TAMIZ_MCP_HTTP_PORT=3300 node apps/mcp-server/dist/main.js --transport http
TAMIZ_AGENT_MCP_URL=http://127.0.0.1:3300/mcp TAMIZ_AGENT_TOOL_PROTOCOL=native|text \
  TAMIZ_AGENT_API_KEY=<demo> TAMIZ_AGENT_MCP_KEY=<ops> pnpm --filter @tamiz/mcp-server agent:demo -- "why did spend rise yesterday?"
curl -H "Authorization: Bearer <ops>" "http://localhost:3000/v1/admin/audit?rule=pinned-local&limit=20"
```

## Pending / follow-ups

- **`T-009-07`** (new): make the agent answer the demo question correctly on a local
  model. Add an agent dataset with a threshold (constitution IV) and iterate the
  versioned system prompt and the tool result format against it. Two failure modes seen
  here:
  - the models confuse the report's baseline with the previous day;
  - with native tools, `llama3.1:8b` stops after one call.
- **`T-OPS-05`** (new): warn at boot when the policy file's content differs from the
  stored version with the same id and version. Today the stored one wins silently.

## Pitfalls for the next session

- **A policy file edit without a version bump is ignored once a database is configured.**
  The first boot stores the file as a version. Later boots use the stored version when its
  number is at least the file's (`postgres-policy-repository.ts`, by design), with no
  warning. Changing the local model needed `version: 4`, and the stored version 4 has to
  be deleted afterwards, or it keeps winning over `default.yaml` v3.
- **`docker compose up --wait` exits 1** because `ollama-pull` is a one-shot service that
  exits 0. Check `docker compose ps` instead.
- **Port 3100 is taken by the compose dashboard.** Run the MCP server's HTTP transport on
  another port, and point `TAMIZ_AGENT_MCP_URL` at it.
- **`docker compose exec ... psql -f -`** reads the seed from standard input; the
  quickstart's `psql "$DATABASE_URL"` needs a local `psql`, which this machine lacks.

## Links

- Spec / plan / tasks: `specs/009-mcp-agent/`
- Related task records: `docs/tasks/done/T-009-04-mcp-agent.md`,
  `docs/tasks/done/T-009-05-native-tool-calling.md`, `docs/tasks/done/T-OPS-01-full-compose.md`
