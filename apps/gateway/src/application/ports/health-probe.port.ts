/**
 * One dependency `/health` reports on (spec 001 FR-017).
 *
 * `down`: requests that need it fail (privacy service, database). `degraded`: the gateway
 * works without it, with less (shared circuit state answered from memory). A probe never
 * throws and never puts an address or a secret in `detail`.
 */
export interface HealthProbe {
  readonly name: string;
  check(): Promise<{ readonly status: "ok" | "degraded" | "down"; readonly detail?: string }>;
}
