/**
 * Spec 010 US3: every Citara request is in the audit log and can be found by its request
 * id, without content. One test per acceptance scenario.
 */
import { AuditEntrySchema } from "@tamiz/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { gatewayRequests, HARNESS_KEYS, reset, runAgainstHarness } from "../support/harness.js";

beforeEach(async () => {
  await reset();
});

const auditOf = (fields: { readonly audit?: string }) =>
  AuditEntrySchema.parse(JSON.parse(fields.audit ?? "null"));

describe("US3 - every request found in the audit log", () => {
  it("US3-1: the entry has the request id, client `citara` and the reported decision", async () => {
    const run = await runAgainstHarness({
      TAMIZ_PROMPT: "Say hello to the team",
      TAMIZ_ADMIN_KEY: HARNESS_KEYS.admin,
    });
    expect(run.code).toBe(0);
    const entry = auditOf(run.fields);
    expect(entry.requestId).toBe(run.fields.request_id);
    expect(entry.clientId).toBe("citara");
    expect(entry.target?.id).toBe(run.fields.route);
    expect(entry.ruleId).toBe(run.fields.rule);
    expect(entry.sensitivity).toBe(run.fields.sensitivity);
    expect(entry.outcome).toBe("answered");
  });

  it("US3-2: the blocked request of US2-3 has one entry, outcome blocked, reason no_target", async () => {
    const run = await runAgainstHarness({
      TAMIZ_PROMPT: "Call Ana García back",
      TAMIZ_MODEL: "tamiz-frontier",
      TAMIZ_ADMIN_KEY: HARNESS_KEYS.admin,
    });
    expect(run.code).toBe(1);
    expect(run.fields.status).toBe("451");
    const entry = auditOf(run.fields);
    expect(entry.requestId).toBe(run.fields.request_id);
    expect(entry.outcome).toBe("blocked");
    expect(entry.blockReason).toBe("no_target");
  });

  it("US3-3: a marker in the prompt appears in neither the entry nor the report", async () => {
    const marker = "zq-marker-7f3a9c";
    const run = await runAgainstHarness({
      TAMIZ_PROMPT: `Repeat ${marker} please`,
      TAMIZ_ADMIN_KEY: HARNESS_KEYS.admin,
    });
    expect(run.code).toBe(0);
    expect(run.fields.audit).toBeDefined();
    expect(run.fields.audit).not.toContain(marker);
    const head = run.output.slice(0, run.output.indexOf("\n\n"));
    expect(head).not.toContain(marker);
    // The scripted provider echoes the prompt, so the marker is in the answer only.
    expect(run.answer).toContain(marker);
  });

  it("US3-4: an entry that never appears ends the check with not_found and exit 1", async () => {
    // A request refused at authentication is never audited, but the gateway still returns
    // its request id: the check polls for the whole wait and must not report success.
    const run = await runAgainstHarness({
      TAMIZ_PROMPT: "hello",
      TAMIZ_API_KEY: "tmz_wrong-key-for-us3-4-0000000000",
      TAMIZ_ADMIN_KEY: HARNESS_KEYS.admin,
      TAMIZ_AUDIT_WAIT_MS: "500",
    });
    expect(run.fields.status).toBe("401");
    expect(run.fields.request_id).toBeDefined();
    expect(run.fields.audit).toBeUndefined();
    expect(run.fields.audit_error).toBe("not_found");
    expect(run.code).toBe(1);
    const lookups = (await gatewayRequests()).filter((r) => r.path.startsWith("/v1/admin/audit"));
    expect(lookups.length).toBeGreaterThan(1);
  });

  it("US3-5: a client key as admin key gets `forbidden` once and exits 1", async () => {
    const run = await runAgainstHarness({
      TAMIZ_PROMPT: "hello",
      TAMIZ_ADMIN_KEY: HARNESS_KEYS.demo,
    });
    expect(run.fields.status).toBe("200");
    expect(run.fields.audit_error).toBe("forbidden");
    expect(run.code).toBe(1);
    const lookups = (await gatewayRequests()).filter((r) => r.path.startsWith("/v1/admin/audit"));
    expect(lookups).toHaveLength(1);
  });
});
