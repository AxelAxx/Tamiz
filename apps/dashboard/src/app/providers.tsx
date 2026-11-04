"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BffRequestError } from "@/lib/api-client";

function sessionEnded(error: unknown): boolean {
  return (
    error instanceof BffRequestError &&
    error.status === 401 &&
    error.body?.error.type === "unauthenticated"
  );
}

/**
 * One query client per tab; a 400, 401 or 403 is never retried. A 401 from any query or
 * mutation means the session ended: `onSessionEnded` opens the dialog in place.
 */
function createQueryClient(onSessionEnded: () => void): QueryClient {
  const onError = (error: unknown) => {
    if (sessionEnded(error)) onSessionEnded();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        refetchIntervalInBackground: false,
        retry: (failures, error) =>
          !(error instanceof BffRequestError && [400, 401, 403].includes(error.status)) &&
          failures < 2,
      },
    },
  });
}

interface SessionExpiry {
  readonly expired: boolean;
  /** Called after signing in again from the dialog: refetches what failed. */
  readonly signedInAgain: () => void;
}

const SessionExpiryContext = createContext<SessionExpiry>({
  expired: false,
  signedInAgain: () => {},
});

export function useSessionExpiry(): SessionExpiry {
  return useContext(SessionExpiryContext);
}

export function Providers({ children }: { readonly children: ReactNode }) {
  const [expired, setExpired] = useState(false);
  const [client] = useState(() => createQueryClient(() => setExpired(true)));
  // A poll that ends in 401 just after sign-out must not greet the next sign-in with the
  // "session ended" dialog: reaching the sign-in page clears it (second code audit, D6).
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/sign-in") setExpired(false);
  }, [pathname]);
  const expiry: SessionExpiry = {
    expired,
    signedInAgain: () => {
      setExpired(false);
      void client.invalidateQueries();
    },
  };
  // The tokens switch on the `dark` class (`@custom-variant dark` in globals.css); dark is
  // the design's default, and the system preference applies once chosen.
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <SessionExpiryContext value={expiry}>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </SessionExpiryContext>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
