"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Eye, LoaderCircle, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, BffRequestError } from "@/lib/api-client";
import { SESSION_QUERY_KEY } from "./session-role";

/**
 * "Explore as a visitor" (spec 008 US10-2): a read-only session, then live traffic. Shown
 * only when the server has visitor access on. In the session-expired dialog `onEntered`
 * keeps the visitor on the current screen instead.
 */
export function VisitorEntry({ onEntered }: { readonly onEntered?: () => void } = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function enter() {
    setPending(true);
    setError(undefined);
    try {
      await api.enterAsVisitor();
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      if (onEntered === undefined) router.replace("/live");
      else onEntered();
    } catch (failure) {
      setError(
        failure instanceof BffRequestError && failure.status === 429
          ? "Too many visitor sessions from this address. Try again in a minute."
          : "Could not open a visitor session. Try again.",
      );
      setPending(false);
    }
  }

  return (
    <div data-component="visitor-entry" className="mt-6 border-t pt-5">
      <p className="text-sm text-muted-foreground">
        No passphrase? Explore the demo read-only: every screen and the simulator, but the policy
        cannot be changed.
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-3 w-full"
        disabled={pending}
        onClick={() => void enter()}
      >
        {pending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <Eye aria-hidden="true" />
        )}
        Explore as a visitor
      </Button>
      {error === undefined ? null : (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-danger">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
