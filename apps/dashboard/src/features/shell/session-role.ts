"use client";

/**
 * The session's role (spec 008 US10, FR-029): screens hide what a visitor would be refused.
 * `undefined` while it loads. The server still checks every write; this is presentation.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { SessionInfo } from "@/lib/schemas";

export const SESSION_QUERY_KEY = ["session"] as const;

export function useSessionRole(): SessionInfo["role"] | undefined {
  const query = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: api.session,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return query.data?.role;
}
