/**
 * THE VIBE-SPECIFIC half of the assertion vocabulary.
 *
 * The shape operators every gate in this package shares — `Mirrors`, `AGREES`,
 * `Wire` and the rest — live in `wire-conformance.types.ts`, which imports
 * nothing and so can be taken by any gate without dragging a contract with it.
 * What stays here is what only a Vibe gate can use: the envelope lookups bound
 * to `TApi["Vibe"]`, and the two literal-union operators these gates need.
 *
 * The `.conformance.ts` suffix is not decoration: this module imports
 * `@nexus/types`, and `wire-types-bundle.test.ts` admits that import ONLY into a
 * module carrying the suffix. Nothing `src/index.ts` reaches imports it.
 */

import type { TApi } from "@nexus/types";

import type { Wire } from "./wire-conformance.types";

/**
 * The Vibe operations that answer with a JSON envelope. A `responseType: "blob"`
 * route (`DownloadAppStarter`) declares no `Response` at all, so indexing every
 * operation by `"Response"` is not a type.
 */
export type VibeEnvelopedOp = {
  [Op in keyof TApi["Vibe"]]: TApi["Vibe"][Op] extends { Response: unknown } ? Op : never;
}[keyof TApi["Vibe"]];

/** The response body of a tenant Vibe endpoint, unwrapped from its envelope. */
export type VibeData<Op extends VibeEnvelopedOp> = Wire<
  TApi["Vibe"][Op] extends { Response: { data: infer D } } ? D : never
>;

/**
 * Two unions of literals hold EXACTLY the same members.
 *
 * For enum-shaped things a shape comparison says nothing — every member is a
 * `string` — so the membership itself is what has to be asserted. Both
 * directions: a member added upstream must fail here (the CLI would receive a
 * value its own union calls impossible), and a member the CLI still lists after
 * upstream dropped it must fail too, or the list rots into names nobody can
 * explain. Same argument as `OmitsExactly`, one level down.
 */
export type SameMembers<Label extends string, Cli, Wire> = [Exclude<Wire, Cli>] extends [never]
  ? [Exclude<Cli, Wire>] extends [never]
    ? true
    : [Label, "declares a member the contract does not have:", Exclude<Cli, Wire>]
  : [Label, "is missing a member the contract has:", Exclude<Wire, Cli>];

/**
 * Two literal types are the same literal.
 *
 * Bidirectional deliberately. `512 extends number` is true, so a ONE-way check
 * would keep passing on the day the upstream constant stops being a literal —
 * i.e. it would go vacuous exactly when it stopped being able to see anything.
 * Failing loudly there is correct: it says the gate can no longer bind, which is
 * a thing to know rather than a thing to be quietly deprived of.
 */
export type SameLiteral<Label extends string, Cli, Wire> = [Cli] extends [Wire]
  ? [Wire] extends [Cli]
    ? true
    : [Label, "is narrower than the contract's constant — the gate cannot bind", Cli, Wire]
  : [Label, "does not equal the contract's constant", Cli, Wire];
