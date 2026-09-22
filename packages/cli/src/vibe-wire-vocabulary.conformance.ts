/**
 * THE ASSERTION VOCABULARY every Vibe wire gate is written in.
 *
 * `vibe-wire-types.conformance.ts` and `vibe-domain-wire-types.conformance.ts`
 * both compare hand-declared CLI shapes against `TApi["Vibe"]`, and both need
 * the same four questions asked the same way — no invented field, no silent
 * omission, no narrowed type, the same members in an enum. One copy, so the two
 * gates cannot come to mean different things by "agrees".
 *
 * The `.conformance.ts` suffix is not decoration: this module imports
 * `@nexus/types`, and `wire-types-bundle.test.ts` admits that import ONLY into a
 * module carrying the suffix. Nothing `src/index.ts` reaches imports it.
 */

import type { TApi } from "@nexus/types";

/**
 * A contract type as it arrives over the wire.
 *
 * `z.infer` describes the value AFTER parsing, where `z.coerce.date()` has
 * already produced a `Date`. The CLI never runs the schema — it reads the raw
 * JSON body — so every such field is an ISO string on its side. Normalising
 * `Date → string` here is the one difference that is correct rather than drift;
 * without it every timestamp on every shape would report a false failure and
 * the gate would be switched off within a week.
 */
export type Wire<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

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

/** Wire fields the CLI type does not declare. */
type Omitted<Cli, W> = Exclude<keyof W, keyof Cli>;

/**
 * A CLI field with no counterpart on the wire — ALWAYS a defect, never a
 * deliberate choice: the CLI cannot receive a key the server does not send, so
 * anything here is a field that was renamed or removed upstream and is now read
 * as `undefined` at runtime.
 */
type NoInventedFields<Label extends string, Cli, W> = [Exclude<keyof Cli, keyof W>] extends [never]
  ? true
  : [Label, "declares a field the wire contract does not have:", Exclude<keyof Cli, keyof W>];

/**
 * The CLI omits EXACTLY the wire fields named in `Declared`, no more and no
 * fewer.
 *
 * Both directions matter. A NEW wire field the CLI ignores fails until someone
 * mirrors it or writes its name here with a reason — which is the whole point,
 * because ignoring a field is a decision and a decision should be visible. A
 * declared omission that no longer exists fails too, so this list cannot rot
 * into a set of names nobody can explain.
 */
type OmitsExactly<Label extends string, Cli, W, Declared> = [
  Exclude<Omitted<Cli, W>, Declared>
] extends [never]
  ? [Exclude<Declared, Omitted<Cli, W>>] extends [never]
    ? true
    : [Label, "declares an omission that is not missing:", Exclude<Declared, Omitted<Cli, W>>]
  : [Label, "silently omits a wire field:", Exclude<Omitted<Cli, W>, Declared>];

/**
 * Every field the two DO share carries a type the wire value satisfies.
 *
 * Assignability rather than equality, and in that direction on purpose: the CLI
 * may hold a field more loosely than the contract does (`status: string` for a
 * server enum is a deliberate, harmless widening, and it keeps a published
 * binary from rejecting a value a newer backend adds). It may never hold one
 * more tightly, because that is the shape that reads a real response as the
 * wrong type.
 */
type SharedFieldsMatch<Label extends string, Cli, W> =
  Pick<W, Extract<keyof Cli, keyof W>> extends Pick<Cli, Extract<keyof Cli, keyof W>>
    ? true
    : [Label, "narrows or mistypes a field it shares with the wire contract"];

/**
 * The three assertions every mirrored shape gets. `Declared` omissions default to none.
 *
 * `readonly`, because {@link AGREES} is a `as const` tuple and a readonly tuple is not
 * assignable to a mutable one — without this every assertion below fails for a reason
 * that has nothing to do with the shapes it is checking.
 */
export type Mirrors<Label extends string, Cli, W, Declared = never> = readonly [
  NoInventedFields<Label, Cli, W>,
  OmitsExactly<Label, Cli, W, Declared>,
  SharedFieldsMatch<Label, Cli, W>
];

/** Satisfied by a `Mirrors<…>` tuple only when all three of its members are `true`. */
export const AGREES = [true, true, true] as const;

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
