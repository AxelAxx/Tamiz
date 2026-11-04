# T-DOC-05 — Trailer at the top of the README

| Field | Value |
|---|---|
| Task | `T-DOC-05` (see `docs/tasks/BACKLOG.md`) |
| Feature | — (documentation) |
| Spec | — |
| Branch / PR | `T-DOC-05-readme-trailer` / PR linked from the merge commit |
| Date | 2026-11-04 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

The README opens with a 46-second trailer of Tamiz, in English, 1080p and 4.4 MB.
GitHub plays it inline. The trailer covers:

- the problem: personal data in requests to LLMs;
- what Tamiz inspects, decides and routes, with an animated data flow to the local, EU
  and cheapest targets;
- anonymization with placeholders;
- the CI eval figures: 0 % critical leak, 100 % structured recall, −87 % cost;
- a montage of the dashboard;
- the one-line `baseURL` change.

The simulator GIF (`docs/images/demo.gif`) moves from the top to "The operator console",
where it opens the three GIFs.

## Files touched

- `README.md`, `docs/tasks/BACKLOG.md`.

## Decisions

- **Hosted as a GitHub attachment, not committed.** GitHub plays a video inline only
  from a `user-attachments` URL. A repository-relative MP4 shows as a link. The file was
  attached to an unsubmitted issue draft to get the URL, and no issue was created. The
  free plan limits attachments to 10 MB, so the README uses a 1080p cut; the 4K
  versions stay outside the repository.
- **English in the README.** The repository is in English (ADR-0002). The Spanish
  versions of the trailer are for Alex's posts.
- **The trailer's figures are the CI eval figures** of the `main` run of 2026-11-04, the
  same ones as in the evals table. Its dashboard shots come from the compose stack: the
  cloud providers were local stand-ins, because no paid keys are used, and the data is
  synthetic.
- **The source of the trailer is not committed.** It is an animated HTML page rendered
  frame by frame, like the GIF recordings of `T-DOC-02` and `T-DOC-04`, and is kept
  outside the repository.

## How it was verified

- The attachment URL was returned by GitHub's uploader after the upload finished.
- The MP4 is H.264, yuv420p, 1920×1080, 46 s.

## Pending / follow-ups

- None.

## Pitfalls for the next session

- **Replacing the trailer:**
  1. Attach the new MP4, under 10 MB, in any GitHub comment box.
  2. Copy the `user-attachments` URL it returns.
  3. Put it alone on its own line in the README.
- **The URL can stop working.** It stays valid while GitHub keeps the asset. An
  attachment from a draft that is never submitted may expire. If the player stops
  showing, upload the file again in a real comment, for example on the PR that changes
  it.

## Links

- Related task records: `docs/tasks/done/T-DOC-04-readme-gifs.md`
