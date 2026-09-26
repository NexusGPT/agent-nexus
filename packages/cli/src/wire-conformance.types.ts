/**
 * THE ASSERTION VOCABULARY every wire drift gate in this package is written in.
 *
 * The CLI publishes standalone, so every shape it declares for a response is a
 * HAND COPY of a contract that lives somewhere else. A hand copy is safe only
 * while something FAILS when it stops matching, and these operators are that
 * something: each is a type that resolves to `true` when two shapes agree and to
 * a descriptive TUPLE when they do not, so `pnpm typecheck` prints the offending
 * field names rather than `'false' is not assignable to 'true'`. There is no
 * runtime behaviour here; the module exists to be compiled. One copy, so no two
 * gates can come to mean different things by "agrees".
 *
 * 🔴 THIS MODULE IMPORTS NOTHING, AND THAT IS A CONSTRAINT RATHER THAN AN
 * ACCIDENT. A gate must be able to take these operators without dragging any
 * other gate's shapes — or `@nexus/types` — into its own compilation, and two
 * gates outside this file enforce that from opposite directions: this module may
 * not be named `*.conformance.ts`, because `wire-types-bundle.test.ts` REQUIRES
 * that suffix to import `@nexus/types`, and not being named it makes
 * `isShippedSourceFile` in `scripts/_lib/mirror-manifests.mjs` classify this as
 * SHIPPED and audit what it imports — which it passes only while that set is
 * empty. Keep every declaration generic and import-free: an import here fails
 * one of those two gates whichever way the file is named.
 */

/**
 * A contract type as it arrives over the wire. `z.infer` describes the value
 * AFTER parsing, where `z.coerce.date()` has already produced a `Date` and a
 * `z.string().datetime()` is `string` already. The CLI never runs the schema —
 * it reads the raw JSON body — so every such field is an ISO string on its
 * side. Normalising `Date → string` here rather than declaring `Date` in the
 * wire types keeps those declarations honest about what actually arrives, and
 * it is the one difference that is correct rather than drift; without it every
 * timestamp on every shape would report a false failure and the gate would be
 * switched off within a week.
 */
export type Wire<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

/** Wire fields the CLI type does not declare. Not used directly — {@link OmitsExactly} is. */
export type Omitted<Cli, W> = Exclude<keyof W, keyof Cli>;

/**
 * A CLI field with no counterpart on the wire — ALWAYS a defect, never a
 * deliberate choice: the CLI cannot receive a key the server does not send, so
 * anything here is a field that was renamed or removed upstream and is now read
 * as `undefined` at runtime.
 */
export type NoInventedFields<Label extends string, Cli, W> = [Exclude<keyof Cli, keyof W>] extends [
  never
]
  ? true
  : [Label, "declares a field the wire contract does not have:", Exclude<keyof Cli, keyof W>];

/**
 * The CLI omits EXACTLY the wire fields named in `Declared`, no more and no
 * fewer. Both directions matter. A NEW wire field the CLI ignores fails until
 * someone mirrors it or writes its name here with a reason — which is the whole
 * point, because ignoring a field is a decision and a decision should be
 * visible. A declared omission that no longer exists fails too, so this list
 * cannot rot into a set of names nobody can explain.
 */
export type OmitsExactly<Label extends string, Cli, W, Declared> = [
  Exclude<Omitted<Cli, W>, Declared>
] extends [never]
  ? [Exclude<Declared, Omitted<Cli, W>>] extends [never]
    ? true
    : [Label, "declares an omission that is not missing:", Exclude<Declared, Omitted<Cli, W>>]
  : [Label, "silently omits a wire field:", Exclude<Omitted<Cli, W>, Declared>];

/**
 * Every field the two DO share carries a type the wire value satisfies.
 * Assignability rather than equality, and in that direction on purpose: the CLI
 * may hold a field more LOOSELY than the contract does (`status: string` for a
 * server enum is a deliberate, harmless widening, and it keeps a published
 * binary from rejecting a value a newer backend adds). It may never hold one
 * more tightly — that is the shape that reads a real response as the wrong type,
 * and it is exactly how `builder` went wrong.
 */
export type SharedFieldsMatch<Label extends string, Cli, W> =
  Pick<W, Extract<keyof Cli, keyof W>> extends Pick<Cli, Extract<keyof Cli, keyof W>>
    ? true
    : [Label, "narrows or mistypes a field it shares with the wire contract"];

/**
 * The three assertions every mirrored shape gets. `Declared` omissions default
 * to none. `readonly`, because {@link AGREES} is an `as const` tuple and a readonly tuple
 * is not assignable to a mutable one — without this every assertion fails for a
 * reason that has nothing to do with the shapes it is checking.
 */
export type Mirrors<Label extends string, Cli, W, Declared = never> = readonly [
  NoInventedFields<Label, Cli, W>,
  OmitsExactly<Label, Cli, W, Declared>,
  SharedFieldsMatch<Label, Cli, W>
];

/** Satisfied by a `Mirrors<…>` tuple only when all three of its members are `true`. */
export const AGREES = [true, true, true] as const;

/**
 * An arm is INHABITED. `Extract<U, {kind: "x"}>` is silently `never` when the
 * union does not carry that arm, and a `never` on both sides satisfies every
 * structural assertion — so a missing arm would read as a perfect match. That
 * trap is not hypothetical: it made an earlier version of the Vibe gate compare
 * nothing at all.
 */
type Inhabited<Label extends string, T> = [T] extends [never]
  ? [Label, "resolves to never — the arm does not exist on one side"]
  : true;

/** One arm of a `kind`-discriminated union. */
type Arm<U, K extends string> = Extract<U, { kind: K }>;

/**
 * The five assertions a DISCRIMINATED UNION's arm gets, keyed on `kind`.
 * The field-set operators above would compare a union's common keys and prove
 * almost nothing, so a union is compared arm by arm instead — and every arm is
 * asserted inhabited first, for the reason {@link Inhabited} gives.
 */
export type ArmsAgree<Label extends string, Cli, W, K extends string> = readonly [
  Inhabited<Label, Arm<Cli, K>>,
  Inhabited<Label, Arm<W, K>>,
  NoInventedFields<Label, Arm<Cli, K>, Arm<W, K>>,
  OmitsExactly<Label, Arm<Cli, K>, Arm<W, K>, never>,
  SharedFieldsMatch<Label, Arm<Cli, K>, Arm<W, K>>
];

/** Satisfied by an `ArmsAgree<…>` tuple only when all five members are `true`. */
export const ARMS_AGREE = [true, true, true, true, true] as const;

/**
 * The union carries no arm the CLI has not modelled. The per-arm assertions
 * cannot see a NEW `kind` — they only compare the arms they name — so this is
 * the one that fails when the backend grows a variant.
 */
export type NoUnmodelledArm<
  Label extends string,
  Cli extends { kind: string },
  W extends { kind: string }
> = [Exclude<W["kind"], Cli["kind"]>] extends [never]
  ? true
  : [
      Label,
      "the wire union carries a kind the CLI does not model:",
      Exclude<W["kind"], Cli["kind"]>
    ];
