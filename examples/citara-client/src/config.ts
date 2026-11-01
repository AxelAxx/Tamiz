/**
 * The example's configuration (spec 010 data-model section 1): environment variables only,
 * validated once at start. An invalid value names the variable, never its value, and the
 * process exits with status 2 (constitution VI).
 */
import { z } from "zod";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const ExampleConfigSchema = z.strictObject({
  TAMIZ_BASE_URL: z.url(),
  TAMIZ_API_KEY: z.string().min(1),
  TAMIZ_MODEL: z.string().min(1).default("tamiz-auto"),
  TAMIZ_PROMPT: z.string().min(1),
  TAMIZ_STREAM: z.enum(["true", "false"]).default("false"),
  TAMIZ_REQUEST_ID: z.string().regex(REQUEST_ID_PATTERN).optional(),
  TAMIZ_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(70_000),
  TAMIZ_ADMIN_KEY: z.string().min(1).optional(),
  TAMIZ_AUDIT_WAIT_MS: z.coerce.number().int().min(0).max(60_000).default(5_000),
});

/** Every variable the example reads; the guide's configuration table lists exactly these. */
export const CONFIG_VARIABLES = Object.keys(ExampleConfigSchema.shape) as ReadonlyArray<
  keyof typeof ExampleConfigSchema.shape
>;

export interface ExampleConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly prompt: string;
  readonly stream: boolean;
  readonly requestId?: string;
  readonly timeoutMs: number;
  readonly adminKey?: string;
  readonly auditWaitMs: number;
}

export type ConfigResult =
  | { readonly ok: true; readonly config: ExampleConfig }
  | { readonly ok: false; readonly message: string };

/**
 * Reads the known variables from `env`; the first CLI argument, when given, replaces
 * `TAMIZ_PROMPT`. Empty strings count as unset, so `VAR=` in a shell does not fail.
 */
export function loadConfig(
  env: Readonly<Record<string, string | undefined>>,
  argv: ReadonlyArray<string> = [],
): ConfigResult {
  const input: Record<string, string> = {};
  for (const name of CONFIG_VARIABLES) {
    const value = env[name];
    if (value !== undefined && value !== "") input[name] = value;
  }
  // `pnpm start -- "<prompt>"` may pass the separator through.
  const promptArgument = argv[0] === "--" ? argv[1] : argv[0];
  const withPrompt =
    promptArgument !== undefined && promptArgument !== ""
      ? { ...input, TAMIZ_PROMPT: promptArgument }
      : input;

  const parsed = ExampleConfigSchema.safeParse(withPrompt);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    return { ok: false, message: `invalid configuration: ${names.join(", ")}` };
  }
  const v = parsed.data;
  return {
    ok: true,
    config: {
      baseUrl: v.TAMIZ_BASE_URL,
      apiKey: v.TAMIZ_API_KEY,
      model: v.TAMIZ_MODEL,
      prompt: v.TAMIZ_PROMPT,
      stream: v.TAMIZ_STREAM === "true",
      timeoutMs: v.TAMIZ_TIMEOUT_MS,
      auditWaitMs: v.TAMIZ_AUDIT_WAIT_MS,
      ...(v.TAMIZ_REQUEST_ID !== undefined ? { requestId: v.TAMIZ_REQUEST_ID } : {}),
      ...(v.TAMIZ_ADMIN_KEY !== undefined ? { adminKey: v.TAMIZ_ADMIN_KEY } : {}),
    },
  };
}
