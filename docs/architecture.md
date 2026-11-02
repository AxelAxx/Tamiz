# Tamiz — Architecture

Diagrams for the system context and containers (C4), the system view, the request flow
and the gateway layers. The narrative and rationale live in `docs/tamiz-project.md`
section 4 and in `docs/adr/`.

## C4: system context

Who uses Tamiz and which outside systems it talks to (C4 level 1, drawn as a flowchart
because Mermaid's C4 layout overlaps its labels). Personal data crosses only the
boundaries the routing policy allows. Critical data never leaves the deployment. Names,
emails and phones leave only anonymized, and only to EU-resident providers. Locations
(low sensitivity) may go anywhere. These are the rules of `policies/default.yaml`; a
policy can be stricter.

```mermaid
flowchart TB
    operator["<b>Operator</b><br/>[Person]<br/>Runs the deployment, edits the policy,<br/>reads audit and cost"]
    app["<b>Client application</b><br/>[Software system]<br/>Any OpenAI-SDK client: a clinic's<br/>assistant, Citara, an agent"]
    host["<b>MCP host</b><br/>[Software system]<br/>Claude Desktop, Claude Code<br/>or any MCP client"]

    subgraph deploy["Your deployment (EU)"]
        tamiz["<b>Tamiz</b><br/>[Software system]<br/>Inspects each request for personal data,<br/>routes it by policy, survives provider<br/>failures, audits every decision"]
    end

    mistral["<b>Mistral API</b><br/>[Software system]<br/>EU-resident provider"]
    frontier["<b>Anthropic / OpenAI</b><br/>[Software system]<br/>Frontier providers, US"]

    app -->|"Chat completions<br/>[HTTPS, OpenAI-compatible, client key]"| tamiz
    operator -->|"Dashboard<br/>[HTTPS, passphrase]"| tamiz
    host -->|"Read-only tools<br/>[MCP, admin key]"| tamiz
    tamiz -->|"No critical data; names,<br/>emails, phones anonymized<br/>[HTTPS]"| mistral
    tamiz -->|"At most locations,<br/>no other personal data<br/>[HTTPS]"| frontier

    classDef person fill:#08427b,stroke:#052e56,color:#fff
    classDef system fill:#1168bd,stroke:#0b4884,color:#fff
    classDef external fill:#999,stroke:#6b6b6b,color:#fff
    class operator person
    class tamiz system
    class app,host,mistral,frontier external
    style deploy fill:none,stroke:#888,stroke-dasharray:6 4
```

## C4: containers

What runs inside a deployment (C4 level 2): the services of `docker-compose.yml`, plus
the MCP server, which runs next to its host. Only the gateway, the dashboard and Jaeger's
UI are meant to be reachable from outside. The privacy service has no authentication and
stays on the internal network.

```mermaid
flowchart TB
    app["<b>Client application</b><br/>[Software system]<br/>OpenAI SDK"]
    operator["<b>Operator</b><br/>[Person]"]
    host["<b>MCP host</b><br/>[Software system]"]

    subgraph tamiz["Tamiz"]
        direction TB
        dashboard["<b>Dashboard</b><br/>[Container: Next.js 16]<br/>Operator console; its server-side<br/>BFF holds the admin key"]
        mcp["<b>MCP server</b><br/>[Container: Node.js 22, MCP SDK]<br/>Four read-only tools<br/>over the admin API"]
        gateway["<b>Gateway</b><br/>[Container: Node.js 22, Hono]<br/>OpenAI-compatible API, routing policy,<br/>resilience, audit, admin API"]
        privacy["<b>Privacy service</b><br/>[Container: Python 3.12, FastAPI,<br/>Presidio, spaCy]<br/>Finds personal data (positions,<br/>never values), anonymizes"]
        ollama["<b>Ollama</b><br/>[Container: llama3.1:8b]<br/>The local model: the only<br/>target for critical data"]
        postgres[("<b>PostgreSQL 17</b><br/>[Database]<br/>Audit log, API keys, policy<br/>versions; never content")]
        valkey[("<b>Valkey</b><br/>[Key-value store]<br/>Circuit breaker state shared<br/>between gateway instances")]
        jaeger["<b>Jaeger</b><br/>[Container: OpenTelemetry]<br/>Traces with GenAI<br/>attributes; never content"]
    end

    providers["<b>Cloud providers</b><br/>[Software system]<br/>Mistral (EU), Anthropic, OpenAI"]

    app -->|"POST /v1/chat/completions<br/>[HTTPS, client key]"| gateway
    operator -->|"Uses<br/>[HTTPS, session cookie]"| dashboard
    host -->|"Calls tools<br/>[stdio or streamable HTTP]"| mcp
    dashboard -->|"Admin API, simulate<br/>[HTTP, admin key]"| gateway
    mcp -->|"Admin API, simulate<br/>[HTTP, admin key]"| gateway
    gateway -->|"Analyze, anonymize<br/>[HTTP, internal only]"| privacy
    gateway -->|"Local inference<br/>[HTTP]"| ollama
    gateway -->|"Audit, keys, policies<br/>[SQL]"| postgres
    gateway -->|"Circuit state<br/>[RESP]"| valkey
    gateway -->|"Spans<br/>[OTLP/HTTP]"| jaeger
    gateway -->|"Cloud inference<br/>[HTTPS]"| providers

    classDef person fill:#08427b,stroke:#052e56,color:#fff
    classDef container fill:#438dd5,stroke:#2e6295,color:#fff
    classDef external fill:#999,stroke:#6b6b6b,color:#fff
    class operator person
    class dashboard,mcp,gateway,privacy,ollama,postgres,valkey,jaeger container
    class app,host,providers external
    style tamiz fill:none,stroke:#888,stroke-dasharray:6 4
```

## System view

```mermaid
flowchart LR
    client["Client app / Agent"] -->|"POST /v1/chat/completions (OpenAI-compatible)"| gw

    subgraph gw["Gateway (Hono, Node 22)"]
        direction TB
        pres["presentation"] --> app["application"] --> dom["domain"]
        infra["infrastructure"] --> app
    end

    infra -->|"/analyze, /anonymize"| privacy["Privacy service (FastAPI + Presidio)"]
    infra -->|local| ollama["Ollama (local)"]
    infra -->|EU residency| mistral["Mistral API (EU)"]
    infra -->|frontier| frontier["Anthropic / OpenAI"]
    infra --> pg[("PostgreSQL 17: audit log, policies, api keys")]
    infra --> redis[("Redis / Valkey: circuit state, rate limit, cache")]
    infra -->|OTLP| jaeger["Jaeger"]

    browser["Operator browser"] -->|"/api/* (session cookie)"| dash
    dash["Dashboard BFF (Next.js 16 route handlers, admin key server-side)"] -->|"GET /v1/admin/*, PUT /v1/admin/policy, POST /v1/simulate"| pres
    host["MCP host (Claude Desktop / Code)"] -->|"MCP: stdio or streamable HTTP"| mcp
    mcp["MCP server (apps/mcp-server)"] -->|"POST /v1/simulate, GET /v1/admin/* (read-only)"| pres
    agent["Agent (AI SDK 6, apps/mcp-server/src/agent)"] -->|"MCP tools over HTTP (admin key)"| mcp
    agent -->|"POST /v1/chat/completions, model tamiz-local (client key)"| pres
```

## Request flow

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant P as presentation
    participant U as RouteInference (application)
    participant S as Privacy service
    participant D as RoutingPolicy (domain)
    participant R as Resilience (timeout, retry, breaker)
    participant L as LLM provider
    participant A as AuditLog + OTel

    C->>P: POST /v1/chat/completions
    P->>P: Zod validation (packages/contracts)
    P->>U: InferenceRequest
    par in parallel
        U->>U: load the active policy
    and
        U->>S: InspectSensitivity: POST /analyze (cached by SHA-256, positions only)
        S-->>U: entities (kinds, offsets) + sensitivity level, or a failure (fail closed)
    end
    U->>U: ClassifyTask (type, size) + inspection
    U->>D: decide(policy, request)
    D-->>U: route (chain filtered by the level's residencies) or block
    alt block (or detector failed with onDetectorError: block)
        U-->>P: Result.err(Blocked) → 451 / 503, no provider called
    else anonymize
        U->>U: <KIND_n> placeholders + versioned notice, mapping in a closure
    end
    U->>R: execute(chain)
    R->>L: call target 1
    L-->>R: error / timeout
    R->>R: next target (blocked if residency violated)
    R->>L: call target 2
    L-->>R: response
    R-->>U: response (+ fallback event)
    U->>U: restore placeholders (one pass, streams through a placeholder-safe buffer)
    U->>A: AuditEntry (no content) + span (GenAI attrs) + events
    U-->>P: Result.ok(response)
    P-->>C: 200 + x-tamiz-route / x-tamiz-fallback / x-tamiz-sensitivity / x-tamiz-privacy
```

What exists after feature 003: validation, classification, `decide` with the allowed
residencies, and the resilient execution (`application/resilience/execute-chain.ts`:
residency guard → circuit breaker → retry → timeout → next target), for both completions
and streams, with `x-tamiz-route` / `x-tamiz-rule` / `x-tamiz-fallback`. Every step is a
`RoutingEvent` on the routing-events port, logged by default. Circuit state lives in
memory or, with `REDIS_URL`, in Valkey. The privacy service exists since feature 004 (below).
Since feature 005 the gateway calls it on every request (`application/use-cases/
inspect-sensitivity.ts`), applies the policy's privacy action in `decide`, anonymizes
and restores in `protect-messages.ts` / `restore-stream.ts`, and answers
`POST /v1/simulate` with the same steps minus the provider call.

Since feature 006 the use cases are wrapped, outermost first, by:

- **`withAudit` / `withAuditStream`** (`application/audit/with-audit.ts`). They write one
  content-free `AuditEntry` when the request ends (for a stream: the last part, an error
  part, or the client leaving). The entry goes to the bounded in-memory log or, with
  `DATABASE_URL`, to PostgreSQL through an asynchronous batched writer whose losses are
  `audit.dropped` events.
- **`withTracing` / `withTracingStream`** (`application/tracing/with-tracing.ts`). They
  open the `tamiz.request` span. `executeChain` runs each attempt in a `chat {model}`
  child span, and the routing events reach both the log and the active span (`fanOut`).

The admin API reads the same store:

- `GET /v1/admin/audit` (keyset pages);
- `GET /v1/admin/cost` (actual vs baseline);
- `GET /v1/admin/providers` (circuit state plus a window of the log).

| Concern | Port | Adapters |
|---|---|---|
| Audit write | `AuditLogPort` | in-memory ring buffer; async batched writer → PostgreSQL |
| Audit read, cost, provider window | `AuditReaderPort` | in-memory (pure aggregates); SQL (`percentile_cont`, `jsonb_array_elements`) |
| Spans | `TracerPort` | OpenTelemetry (OTLP/HTTP from `OTEL_*`), no-op by default |
| Routing events | `RoutingEventsPort` | pino log sink + OTel span-event sink, through `fanOut` |
| API keys | `StoredKeyLookup` (infrastructure) | environment (`TAMIZ_API_KEYS`, `TAMIZ_ADMIN_API_KEYS`) then PostgreSQL |

## Gateway layers and allowed dependencies

```mermaid
flowchart TB
    main["main.ts (composition root)"] --> infra
    main --> pres
    pres["presentation: routes, middlewares, mappers"] --> app
    pres --> contracts["packages/contracts (Zod)"]
    infra["infrastructure: llm, privacy, persistence, cache, telemetry, config"] --> app
    app["application: ports, use-cases, resilience"] --> dom
    dom["domain: model, errors, result"]
```

Rules enforced by `.dependency-cruiser.cjs` (feature 001):

| From | May import |
|---|---|
| `domain` | nothing |
| `application` | `domain` |
| `infrastructure` | `application`, `domain` |
| `presentation` | `application`, `domain`, `packages/contracts` |
| `main.ts` | everything (only place that imports `infrastructure`) |

## Privacy service layers

`services/privacy/src/privacy/{domain,application,infrastructure,api}/` mirrors the
gateway, enforced by import-linter (feature 004):

| Layer | Holds | May import |
|---|---|---|
| `domain` | entity kinds, findings, sensitivity rule, overlap resolution, placeholders, check characters | standard library only |
| `application` | `analyze_text`, `anonymize_text`, `PiiAnalyzerPort` | `domain` |
| `infrastructure` | Presidio engine with spaCy `es_core_news_lg`, the Spanish recognizers, settings | `application`, `domain` |
| `api` | FastAPI app, Pydantic contract (exported to `openapi.json`), errors, body limit, logging | `application`, `domain` |
| `main.py` | composition root: loads the model, then serves | everything |

```mermaid
flowchart LR
    req["POST /analyze or /anonymize"] --> limit["1 MiB limit + validation (400, no echo)"]
    limit --> uc["analyze_text"]
    uc --> engine["Presidio: spaCy PERSON/LOCATION, email, card, DNI, NIE, CIF, IBAN, NSS, phone"]
    engine --> pipeline["kinds → min score → overlaps → level"]
    pipeline --> resp["findings (offsets, no values) + level"]
    pipeline --> anon["placeholders <KIND_n> + mapping (anonymize only)"]
```

Nothing is stored: no database, no files, no request content in logs (one allow-listed
JSON line per request; third-party loggers below WARNING are filtered out).

## Evals in CI (feature 007)

The `evals` job runs the evals against the real services, through their public contracts.
`packages/evals` imports no app code.

```mermaid
flowchart LR
    runner["@tamiz/evals runner<br/>datasets + thresholds"] -->|"POST /v1/simulate<br/>leak, routing, cost"| gwA["gateway<br/>default.yaml"]
    runner -->|"POST /analyze<br/>detection"| priv["privacy service"]
    runner -->|"POST /v1/chat/completions<br/>model tamiz-local"| gwB["gateway<br/>quality-ci.yaml"]
    runner -->|"blind grading<br/>judge.v1.md"| judge["Ollama qwen2.5:3b"]
    gwA --> priv
    gwB --> priv
    gwB --> ans["Ollama qwen2.5:1.5b"]
    runner --> report["evals.json + evals.md<br/>exit 0 / 1 / 2"]
```

| Concern | Where |
|---|---|
| Datasets (synthetic, versioned) | `packages/evals/datasets/`; the PII ones are generated by `src/synthetic/generate.ts` |
| Thresholds | `packages/evals/src/thresholds.ts` |
| Quality baseline | `packages/evals/baselines/quality.json` |
| Report contract | `EvalReportSchema` in `packages/contracts/src/evals.ts` |
| README table | `pnpm evals:readme`, between `<!-- evals:start -->` markers |

## Dashboard

Organised by feature, routes stay thin. The browser only calls the dashboard's own `/api/*`
route handlers (the BFF): they check the session (and the origin, for writes), call the
gateway with the admin key held on the server, and parse every answer with the contract
schemas. Eval reports are read from a folder, not from the gateway (spec 008 R-09).

```
apps/dashboard/src/
├── app/                 routes only: (auth)/sign-in, (console)/*, api/* (the BFF)
├── features/            shell, shared, live-traffic, audit-log, policy-editor/{simulator,editor},
│                        cost-analytics, provider-health, eval-results
├── components/ui/       shadcn
└── lib/                 api-client.ts (browser), schemas.ts, server/ (env, session, gateway hc client)
```
