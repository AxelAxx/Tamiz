/**
 * An in-memory policy repository (spec 002, research R-14).
 *
 * Satisfies the read side of the gateway's policy port, `PolicyReader`
 * (`{ getActive(): Promise<RoutingPolicy> }`), structurally: the use cases that route,
 * audit and report depend on that side only. Tests of the policy admin API (spec 008)
 * use the gateway's own in-memory repository, which also replaces with a version check.
 * The policy type is a parameter, so this package never imports the gateway's
 * `RoutingPolicy` (research R-09).
 */
export interface InMemoryPolicyRepository<P> {
  /** Resolves the active policy. */
  getActive(): Promise<P>;
  /** Replaces the active policy. */
  set(policy: P): void;
}

export function createInMemoryPolicyRepository<P>(initial: P): InMemoryPolicyRepository<P> {
  let active = initial;

  return {
    getActive: async () => active,
    set: (policy) => {
      active = policy;
    },
  };
}
