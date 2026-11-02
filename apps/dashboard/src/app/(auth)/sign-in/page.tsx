import { Clock } from "lucide-react";
import { LogoMark } from "@/features/shell/logo";
import { serverContext } from "@/lib/server/context";
import { SignInForm } from "./sign-in-form";
import { VisitorEntry } from "./visitor-entry";

/**
 * The sign-in page, outside the console shell (design `signin.html`). `?session=expired` is
 * set by the page gate when a session cookie was present but no longer valid. With visitor
 * access on (spec 008 US10) it also offers a read-only visitor session.
 */
export default async function SignInPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const expired = (await searchParams)["session"] === "expired";
  return (
    <div className="flex min-h-svh items-center justify-center bg-app p-4">
      <main id="content" className="w-full max-w-sm">
        <div data-slot="card" className="rounded-xl border bg-surface p-6 shadow-sm md:p-8">
          <div className="flex items-center gap-2">
            <LogoMark className="size-7" />
            <span className="text-lg font-semibold tracking-tight">Tamiz</span>
          </div>
          <h1 className="mt-6 text-xl font-semibold tracking-tight">Operator console</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with the operator passphrase.
          </p>
          {expired ? (
            <div
              data-slot="alert"
              role="status"
              className="mt-5 flex gap-2 rounded-lg border border-info/30 bg-info-soft px-3 py-2.5 text-sm text-info"
            >
              <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <p>Your session ended. Sign in again.</p>
            </div>
          ) : null}
          <div className="mt-5">
            <SignInForm />
          </div>
          {serverContext().env.visitorAccess ? <VisitorEntry /> : null}
        </div>
      </main>
    </div>
  );
}
