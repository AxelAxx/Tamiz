# LinkedIn post — draft

Status: **draft, waiting for Alex's review** (`T-DOC-03`).

Angle (`docs/tamiz-project.md` section 10): problem first. What working with real
clinical data teaches about sending personal data to an LLM, and how a gateway solves
it. Links to the repository and the demo.

Before publishing:

- [ ] Replace the two `[ALEX: …]` placeholders with your own experience. The draft does
      not invent it.
- [ ] Add the demo link once `T-OPS-02` is deployed, or keep the repository link only.
- [ ] Attach `docs/images/demo.gif` (LinkedIn plays GIFs) or a screenshot of the
      simulator.
- [ ] Recheck the figures against the latest README evals table (they come from the
      `main` run of 2026-11-02, commit `10d17b3`).

Length: about 2,000 characters with the placeholders, so room for about 900 of your own
under LinkedIn's 3,000. The hook is in the first two lines, the part shown before
"…see more".

---

## Post (Spanish)

Mandar un DNI a una API de un LLM en EE. UU. es muy fácil. Lo difícil es saber que no lo
has hecho.

[ALEX: 2-3 frases con tu experiencia con datos clínicos reales: qué tipo de datos, qué
dilema concreto tuviste con un LLM y qué acabasteis haciendo. Sin datos identificables.]

La mayoría de equipos pequeños en salud, legal o fintech acaba en uno de dos extremos:
o no usa IA con esos datos, o la usa sin control. Así que construí Tamiz, un gateway
self-hosted que se pone entre tu aplicación y los proveedores de LLM y decide en cada
petición:

🔍 Inspecciona el texto (y los argumentos de las tool calls) buscando DNI, NIE, IBAN,
NSS, tarjetas, emails, teléfonos y nombres, con reconocedores españoles que comprueban
la letra de control.

🧭 Enruta según una política en YAML: lo crítico no sale de la máquina (modelo local con
Ollama); nombres, emails y teléfonos solo salen anonimizados y a proveedores con
residencia en la UE; el resto va al modelo más barato que sirve para la tarea.

🛡️ Aguanta caídas con timeouts, reintentos, circuit breakers y fallback. Y si el
fallback rompería la residencia, bloquea en vez de degradar.

📋 Audita cada decisión (qué detectó, qué regla, qué modelo, coste) sin guardar nunca el
texto.

✅ Y lo demuestra: las evals de fuga corren en cada pull request y bloquean el merge. En
la última ejecución, 0 % de DNI, NIE, IBAN, NSS y tarjetas llegaron a un proveedor no
local, y el 0,83 % de los nombres (la detección de nombres es estadística, y lo cuento
tal cual).

Para tu aplicación es cambiar la base URL del cliente de OpenAI. Nada más.

Lo he hecho en dos semanas con desarrollo guiado por specs: cada feature tiene su spec
con criterios Given/When/Then que son tests, y cada decisión está escrita.

[ALEX: una frase de cierre personal: qué te llevas o a quién le puede servir.]

Repo (Apache-2.0): https://github.com/AxelAxx/tamiz
Demo: [enlace cuando esté desplegada]

#IA #LLM #Privacidad #RGPD #HealthTech #OpenSource

---

## Sources for every claim

| Claim in the post | Source |
|---|---|
| Recognizers check control characters | `services/privacy` (feature 004), README "Features" |
| Tool-call arguments inspected | `T-009-05`, CLAUDE.md section 5 |
| Critical stays local, high only anonymized to EU/local | `apps/gateway/policies/default.yaml`, `privacy` section |
| Residency guard blocks instead of degrading | Feature 003 (`451`), README |
| Audit without content | Feature 006, capture test |
| 0 % critical, 0.83 % names | README evals table, `main` run 2026-11-02 (`10d17b3`) |
| Base URL change only | `docs/integrations/citara.md` |
| Two weeks, spec-driven | `docs/tasks/BACKLOG.md` (2026-10-18 → 2026-11-02), `specs/` |
