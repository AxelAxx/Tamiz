import { describe, expect, it } from "vitest";
import { checkAudit } from "../../src/audit-check.js";
import { auditEntry, auditPage, fakeFetch, type Responder } from "../support/fake-fetch.js";

const STARTED = Date.parse("2026-11-01T10:00:00.000Z");
const INPUT = {
  baseUrl: "http://tamiz.test/v1/",
  adminKey: "tmz_unit-admin",
  requestId: "req-1",
  startedAt: STARTED,
  waitMs: 1_000,
};

function harness(responders: ReadonlyArray<Responder>) {
  const { fetch, requests } = fakeFetch(responders);
  let clock = STARTED;
  const deps = {
    fetch,
    sleep: async (ms: number) => {
      clock += ms;
    },
    now: () => clock,
  };
  return { deps, requests };
}

describe("checkAudit (spec 010 data-model section 5, research R-07)", () => {
  it("queries a window from 5 s before the request, 200 per page", async () => {
    const { deps, requests } = harness([auditPage([auditEntry("req-1")])]);
    const result = await checkAudit(INPUT, deps);
    expect(result.kind).toBe("found");
    const url = new URL(requests[0]?.url ?? "");
    expect(url.pathname).toBe("/v1/admin/audit");
    expect(url.searchParams.get("from")).toBe("2026-11-01T09:59:55.000Z");
    expect(url.searchParams.get("limit")).toBe("200");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer tmz_unit-admin");
  });

  it("follows the cursor and finds the entry on page 2", async () => {
    const { deps, requests } = harness([
      auditPage([auditEntry("a")], "cursor-2"),
      auditPage([auditEntry("req-1")]),
    ]);
    const result = await checkAudit(INPUT, deps);
    expect(result).toMatchObject({ kind: "found", entry: { requestId: "req-1" } });
    expect(new URL(requests[1]?.url ?? "").searchParams.get("cursor")).toBe("cursor-2");
  });

  it("reads at most 5 pages per poll", async () => {
    const pages = Array.from({ length: 5 }, () => auditPage([auditEntry("x")], "more"));
    const { deps, requests } = harness(pages);
    const result = await checkAudit({ ...INPUT, waitMs: 0 }, deps);
    expect(result.kind).toBe("not_found");
    expect(requests).toHaveLength(5);
  });

  it("edge (audit write timing): finds an entry that appears on the third poll", async () => {
    const { deps, requests } = harness([
      auditPage([]),
      auditPage([]),
      auditPage([auditEntry("req-1")]),
    ]);
    const result = await checkAudit(INPUT, deps);
    expect(result.kind).toBe("found");
    expect(requests).toHaveLength(3);
  });

  it("edge (slow answer, T-010-03): the wait starts with the check, not with the request", async () => {
    const { deps, requests } = harness([auditPage([]), auditPage([auditEntry("req-1")])]);
    // The local model answered 12 s after the request started, well past `waitMs`.
    let clock = STARTED + 12_000;
    const slow = {
      ...deps,
      now: () => clock,
      sleep: async (ms: number) => {
        clock += ms;
      },
    };
    const result = await checkAudit(INPUT, slow);
    expect(result.kind).toBe("found");
    expect(requests).toHaveLength(2);
  });

  it("gives up at the deadline with not_found", async () => {
    const { deps, requests } = harness(Array.from({ length: 10 }, () => auditPage([])));
    const result = await checkAudit({ ...INPUT, waitMs: 500 }, deps);
    expect(result.kind).toBe("not_found");
    expect(requests).toHaveLength(3); // t = 0, 250, 500
  });

  it.each([
    [403, "forbidden"],
    [401, "unauthorized"],
  ])("a %i ends the check at once (%s)", async (status, kind) => {
    const { deps, requests } = harness([() => new Response(null, { status })]);
    expect((await checkAudit(INPUT, deps)).kind).toBe(kind);
    expect(requests).toHaveLength(1);
  });

  it("a connection that fails is reported as unreachable, not thrown (code audit M20)", async () => {
    const { deps } = harness([
      () => {
        throw new TypeError("fetch failed");
      },
    ]);
    expect((await checkAudit(INPUT, deps)).kind).toBe("unreachable");
  });

  it("a malformed page is a failure, never a success", async () => {
    const { deps } = harness([() => Response.json({ entries: [{ requestId: "req-1" }] })]);
    expect((await checkAudit(INPUT, deps)).kind).toBe("malformed");
  });
});
