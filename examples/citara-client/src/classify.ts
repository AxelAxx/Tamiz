/**
 * What a client should do with each gateway error (spec 010 data-model section 2,
 * research R-03). Tamiz already retries and falls back inside its request deadline, so
 * only "try later" answers are worth one more attempt.
 */
import { type ErrorType, ErrorTypeSchema } from "@tamiz/contracts";

export type ErrorClass = "fix_request" | "never" | "later";

export const ERROR_CLASSES: Readonly<Record<ErrorType, ErrorClass>> = Object.freeze({
  invalid_request: "fix_request",
  unauthorized: "fix_request",
  forbidden: "fix_request",
  not_found: "fix_request",
  policy_blocked: "never",
  provider_error: "never",
  provider_timeout: "never",
  internal: "never",
  provider_unavailable: "later",
  privacy_unavailable: "later",
  rate_limited: "later",
});

/** How the guide's error table words each class. */
export const GUIDANCE: Readonly<Record<ErrorClass, string>> = Object.freeze({
  fix_request: "after fixing the request",
  never: "never",
  later: "later",
});

export interface ClassifiedError {
  /** The gateway's error type, or `http_<status>` when the body is not an error envelope. */
  readonly errorType: string;
  readonly errorClass: ErrorClass;
}

/** Classifies by the envelope's `error.type`; falls back to the HTTP status. */
export function classifyError(status: number, type: unknown): ClassifiedError {
  const parsed = ErrorTypeSchema.safeParse(type);
  if (parsed.success) return { errorType: parsed.data, errorClass: ERROR_CLASSES[parsed.data] };
  const errorClass: ErrorClass =
    status === 429 || status === 503 ? "later" : status >= 500 ? "never" : "fix_request";
  return { errorType: `http_${status}`, errorClass };
}

const DEFAULT_RETRY_AFTER_MS = 1_000;
const MAX_RETRY_AFTER_MS = 30_000;

/** `retry-after` in seconds; absent or unreadable → 1 s; capped at 30 s. */
export function retryAfterMs(header: string | null | undefined): number {
  if (header === null || header === undefined) return DEFAULT_RETRY_AFTER_MS;
  const seconds = Number(header.trim());
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_RETRY_AFTER_MS;
  return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS);
}
