import { Suspense } from "react";
import { AuditLog } from "@/features/audit-log/audit-log";
import { RegionLoading } from "@/features/shared/region-states";

/** The audit log (spec 008 US4). The filters live in the URL, read on the client. */
export default function AuditLogPage() {
  return (
    <Suspense fallback={<RegionLoading rows={8} />}>
      <AuditLog />
    </Suspense>
  );
}
