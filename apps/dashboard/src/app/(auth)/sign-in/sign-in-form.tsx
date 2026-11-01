"use client";

import { useRouter } from "next/navigation";
import { PassphraseForm } from "@/features/shell/passphrase-form";

/** Signs in, then lands on live traffic (spec 008 US1-2). */
export function SignInForm() {
  const router = useRouter();
  return <PassphraseForm onSignedIn={() => router.replace("/live")} />;
}
