# T-DOC-03 — LinkedIn post and case study drafts

| Field | Value |
|---|---|
| Task | `T-DOC-03` (see `docs/tasks/BACKLOG.md`) |
| Feature | — (documentation) |
| Spec | — (`docs/tamiz-project.md` section 10) |
| Branch / PR | `T-DOC-03-marketing-drafts` / PR linked from the merge commit |
| Date | 2026-11-02 |
| Session | Claude Code (Opus 5.5) |
| Status | done as drafts; Alex reviews them in the PR and fills his placeholders before publishing |

## What was done

Two drafts are in `docs/marketing/`, with a short `README.md` for the folder.

- **`linkedin-post.md`**: the post in Spanish (content that is Spanish by design,
  ADR-0002), problem first, as section 10 asks. It runs from the hook, through the five
  things Tamiz does and the leak figures with the name caveat, to the one-line
  integration and the spec-first note. It ends with the repository link and a demo-link
  placeholder. About 2,000 characters.

  Around it, in English: a pre-publishing checklist, the length budget, and a table that
  maps each claim to its source.
- **`case-study.md`**: for Alex's website, in English, in this order:
  - problem;
  - what it does;
  - the shape of the system;
  - seven decisions: fail closed and block rather than degrade, the pure routing
    function, its own resilience, reversible but unpersisted anonymization with the
    split-placeholder buffer, the content-free audit with its capture test, evals as the
    specification, and dogfooding through the MCP agent; spec-first work comes after
    them;
  - trade-offs;
  - results: the eval table and the size of the work;
  - next steps;
  - a sources table.

## Files touched

- `docs/marketing/{README,linkedin-post,case-study}.md` (new).
- `docs/tasks/BACKLOG.md`.

## Decisions

- **Alex's own experience is a placeholder, not invented.** Section 10 builds the post
  around "what working with real clinical data taught", and nothing in the repository
  says what that was. Each draft has explicit `[ALEX: …]` slots: two in the post, one in
  the case study.
- **Every figure cites its source**, and the uncertain ones were rechecked:
  - the resilience code is 551 lines (470 without comments and blank lines); the first
    draft said "about 1,000", now corrected to "about 550";
  - merged pull requests: 71;
  - "every pull request passed the full gate" was wrong for the early ones (`e2e` exists
    since `T-008-09`, evals since `T-007-06`). It now says each pull request merged on
    a green CI, and lists what CI ran by the end.
- **The name caveat stays in the post.** Publishing "0 % leaks" without the 0.83 % for
  names would contradict the README's limitations, and the case study's argument is that
  the numbers are honest.
- **The demo link is a placeholder** until `T-OPS-02`.
- **The case study is in English.** The backlog allows Spanish only for the post. A
  Spanish version for the website is Alex's call.

## How it was verified

- Each claim was checked against the source listed in each draft's table: the README
  evals table (`main` run, `10d17b3`), `default.yaml`, the specs and the task records.
- Resilience line count: `wc -l` over `application/resilience/*.ts`.
- Merged pull requests: `gh pr list --state merged`.
- Post length: about 2,020 characters, measured with the placeholders.

## Pending / follow-ups

- Alex: review both drafts, fill the `[ALEX: …]` slots, and publish.
- Add the demo link after `T-OPS-02`.
- Optional: a Spanish version of the case study.

## Pitfalls for the next session

- The figures age. Before publishing, regenerate them from the latest `main` evals report
  (`pnpm evals:readme`) and update both drafts.

## Links

- Related task records: `docs/tasks/done/T-DOC-01-final-readme.md`,
  `docs/tasks/done/T-DOC-02-gif-and-c4.md`
