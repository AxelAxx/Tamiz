"use client";

/**
 * The passphrase form shared by the sign-in page and the session-expired dialog (spec 008
 * US1-2, design `signin.html`): show/hide toggle, inline errors under the field, and a
 * rate-limit countdown that keeps the button disabled until it ends.
 */
import { CircleX, Eye, EyeOff, LoaderCircle, TriangleAlert } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, BffRequestError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Failure =
  | { readonly kind: "empty" }
  | { readonly kind: "wrong" }
  | { readonly kind: "other" }
  | { readonly kind: "rate"; readonly until: number };

const RATE_LIMIT_FALLBACK_SECONDS = 60;

function failureFrom(error: unknown, now: number): Failure {
  if (error instanceof BffRequestError) {
    if (error.status === 429) {
      const seconds = error.retryAfterSeconds ?? RATE_LIMIT_FALLBACK_SECONDS;
      return { kind: "rate", until: now + seconds * 1000 };
    }
    if (error.status === 401) return { kind: "wrong" };
  }
  return { kind: "other" };
}

/** Seconds left of a rate limit, ticking each second; 0 when there is none. */
function useSecondsLeft(until: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return until === undefined ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

const MESSAGES: Readonly<Record<"empty" | "wrong" | "other", string>> = {
  empty: "Enter the passphrase.",
  wrong: "Wrong passphrase. Check it and try again.",
  other: "Sign-in failed. Try again.",
};

export function PassphraseForm({ onSignedIn }: { readonly onSignedIn: () => void }) {
  const id = useId();
  const [reveal, setReveal] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | undefined>();
  const secondsLeft = useSecondsLeft(failure?.kind === "rate" ? failure.until : undefined);
  const limited = failure?.kind === "rate" && secondsLeft > 0;
  const fieldError = failure !== undefined && failure.kind !== "rate" ? failure.kind : undefined;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("passphrase");
    const passphrase = typeof value === "string" ? value : "";
    if (passphrase === "") {
      setFailure({ kind: "empty" });
      return;
    }
    setPending(true);
    setFailure(undefined);
    try {
      await api.signIn(passphrase);
      onSignedIn();
    } catch (error) {
      setFailure(failureFrom(error, Date.now()));
      setPending(false);
    }
  }

  const inputId = `${id}-passphrase`;
  const errorId = `${id}-error`;
  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      {limited ? (
        <div
          data-slot="alert"
          role="alert"
          className="flex gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            Too many attempts. Try again in{" "}
            <span className="tabular font-medium">{secondsLeft} s</span>.
          </p>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={inputId}>Passphrase</Label>
        <div className="relative">
          <Input
            id={inputId}
            name="passphrase"
            type={reveal ? "text" : "password"}
            autoComplete="current-password"
            className={cn(
              "h-10 bg-surface pr-10",
              fieldError !== undefined && "border-danger ring-[3px] ring-danger/20",
            )}
            aria-invalid={fieldError !== undefined}
            {...(fieldError !== undefined && { "aria-describedby": errorId })}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-muted-foreground hover:text-foreground"
            aria-label={reveal ? "Hide passphrase" : "Show passphrase"}
            aria-pressed={reveal}
            onClick={() => setReveal((shown) => !shown)}
          >
            {reveal ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
        {fieldError === undefined ? null : (
          <p id={errorId} role="alert" className="flex items-center gap-1.5 text-sm text-danger">
            <CircleX aria-hidden="true" className="size-3.5" />
            {MESSAGES[fieldError]}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending || limited}>
        {pending ? (
          <>
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            Signing in…
          </>
        ) : limited ? (
          `Try again in ${secondsLeft} s`
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  );
}
