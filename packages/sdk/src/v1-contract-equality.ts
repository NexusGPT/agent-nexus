/**
 * The type machinery the v1 contract gates are built from.
 *
 * Every type under `types/` is a published npm contract, hand-written by reading
 * `packages/types/src/api/public/v1/schemas/`. Reading is not a gate: a field
 * renamed on the server side leaves this package compiling perfectly, shipping a
 * lie to every consumer, and nothing anywhere goes red. The `*.test.ts` files
 * that import these helpers are what make that impossible.
 *
 * This module holds NO assertions and imports nothing. It exists so that each
 * slice of the gate — folders, phone numbers, workflows — states its pairs and
 * nothing else, instead of carrying its own copy of the four types below.
 *
 * ## Why `Infer` is spelled by hand instead of `z.infer`
 *
 * `zod` is not resolvable from this package and is not being added. `z.infer<S>`
 * is by definition `S["_output"]`, so the same inference is available with no
 * zod import at all.
 *
 * ## `Sent` and `Received` are different, and using one for both is wrong
 *
 * A Zod schema has TWO types. `_output` is what the server holds after parsing;
 * `_input` is what the caller hands over. For a response the client sees the
 * OUTPUT; for a request body the client supplies the INPUT. They diverge the
 * moment a schema carries `.default()` or `z.coerce`, and comparing a request
 * type against `_output` reports drift that does not exist.
 */

/** What a caller SENDS: a schema's input type. `z.input<S>` without zod. */
export type Sent<S extends { _input: unknown }> = S["_input"];

/** What a caller RECEIVES: a schema's output type, as it survives JSON. */
export type Received<S extends { _output: unknown }> = Wire<S["_output"]>;

/**
 * The server type as it arrives over JSON. `Date` becomes `string`; everything
 * else is carried through structurally, unions and optionality included.
 *
 * The structural walk also collapses intersections into a single object type,
 * which matters more than it looks: {@link Equals} compares the type NODE, so a
 * `Partial<Pick<T, "a">> & Omit<T, "a">` is not identical to the flat object it
 * describes, and an assertion built from `Omit` / `Pick` / `Partial` would
 * otherwise fail for a reason that has nothing to do with the contract.
 */
export type Wire<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

/**
 * Exact type equality — NOT mutual assignability.
 *
 * 🚨 `A extends B && B extends A` passes for types that differ only in
 * OPTIONALITY, and it passes when either side is `any` — which would make every
 * assertion vacuous the moment `@nexus/types` stopped resolving. Measured on the
 * workflow slice: deleting `WorkflowEdge.targetHandle`, a field the API sends,
 * leaves a mutual-assignability gate at exit 0 and takes this one to 2 errors.
 *
 * This form distinguishes `{ a?: string }` from `{ a: string | undefined }` and
 * refuses `any` on either side.
 */
export type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

/** Fails to compile unless its argument is `true`. */
export type Expect<T extends true> = T;
