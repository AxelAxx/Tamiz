"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/features/shell/app-shell";
import { SessionExpiredDialog } from "@/features/shell/session-expired-dialog";
import { useSessionExpiry } from "../providers";

/** Every console screen sits in the shell; a session that ends is renewed in place. */
export default function ConsoleLayout({ children }: { readonly children: ReactNode }) {
  const { expired, signedInAgain } = useSessionExpiry();
  return (
    <>
      <AppShell>{children}</AppShell>
      <SessionExpiredDialog open={expired} onSignedIn={signedInAgain} />
    </>
  );
}
