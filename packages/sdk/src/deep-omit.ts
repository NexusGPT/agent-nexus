/**
 * A by-path erase for the v1 response gates, so a drift-ledger row can exempt
 * the FIELD it names instead of the whole route it sits on.
 *
 * ## The hole this closes
 *
 * `V1_RESPONSE_DRIFT` in `types/v1-response-types-match-the-contract.test.ts` is
 * keyed by ROUTE. A row removes that route from the positive assertions
 * entirely, so every OTHER divergence in its DTO becomes free, and the negative
 * assertion beside it does not close that — it says the pair still DIFFERS, and
 * that stays true however many further fields separate. An entry naming one
 * field reads as narrow and behaves as broad.
 *
 * Measured on this tree rather than argued. `MeListOrganizations` is ledgered
 * for `UserOrganization.name` alone; changing the UNNAMED sibling `role` from
 * `string` to `number` — a blatant lie in a published type — left the SDK
 * typecheck at **exit 0, zero bytes of output**. The same class of edit on a
 * gated route (`AgentFolder.name`) reds three assertions, and on a NARROWED
 * ledgered route (`AgentToolConfig.isActive`) reds five. Three mutants, one
 * instrument: the silence is the ledger row, not the compiler.
 *
 * ## Why a by-path erase is dangerous, and what that forces on the design
 *
 * The failure mode of deep type machinery is a VACUOUS assertion, not a red
 * one: erase more than you claimed and the remainder compares equal for reasons
 * that have nothing to do with the contract, and every number on the page still
 * says the gate passed. A narrowing that silently over-erases is worse than the
 * route-wide silence it replaces, because it reads as coverage.
 *
 * Two decisions follow, and both are load-bearing:
 *
 * 1. **It recurses ONLY along the named path.** `DeepOmit<T, "contact.name">`
 *    rewrites the `contact` key and leaves every other key of `T` as the exact
 *    type node it already was. There is no whole-tree walk, so there is no
 *    depth bound to get wrong and no recursive type to blow the stack.
 * 2. **A path that does not resolve erases NOTHING.** A typo, a renamed field
 *    or a path pointing into a leaf returns the type unchanged, so the drift it
 *    was meant to exempt is still in the comparison and the assertion goes RED.
 *    That is the safe direction: the failure of this module is a false alarm,
 *    never a false pass. `deep-omit.test.ts` pins it with a path into a
 *    primitive and a path whose first segment is not a key.
 *
 * ## What it does not preserve, stated so nobody discovers it
 *
 * Mapping an array drops `readonly` and collapses a tuple to its element type.
 * Both sides of every comparison go through the same function, so the two
 * effects cancel and no assertion is weakened by them — but `DeepOmit` is not a
 * general-purpose utility and should not be reached for as one. It is applied
 * symmetrically to a contract type and an SDK type, and that symmetry is the
 * only reason its lossy edges are safe.
 *
 * Functions satisfy `extends object` and would be mapped. No v1 response type
 * carries one; a future one would need this revisited rather than trusted.
 */

/**
 * A homomorphic identity map. Flattens `Omit`'s own `Pick<…>` spelling into a
 * plain object node, because `Equals` compares the type NODE and would
 * otherwise report a difference that is purely how the type was written.
 */
type Flat<T> = { [K in keyof T]: T[K] };

/**
 * `T` with the single dotted path `P` erased, and nothing else changed.
 *
 * Segments are separated by `.`; array traversal is implicit, so `"slug"`
 * erases `slug` from the element type of an array response and
 * `"providers.slug"` erases it from the element type of a `providers` array.
 */
export type DeepOmit<T, P extends string> = T extends readonly (infer E)[]
  ? DeepOmit<E, P>[]
  : T extends object
    ? OmitPath<T, P>
    : T;

/**
 * The object arm, split out so the array and primitive cases above stay
 * readable. On a multi-segment path it rewrites exactly the head key and
 * carries every sibling through untouched; on the final segment it erases.
 *
 * ## An unresolvable path is a no-op here WITHOUT a guard, and that was measured
 *
 * Both arms were first written with an `extends keyof T` guard returning `T`
 * unchanged, on the reasoning that a typo must erase nothing. The guards were
 * deleted because **no assertion in `deep-omit.test.ts` can see them**: removing
 * each one independently left all 19 arms green, so each was an untested branch
 * claiming a safety property the code already had.
 *
 * It already had it for two reasons, both checked rather than assumed. A
 * homomorphic mapped type over an interface is `Equals`-identical to that
 * interface — which is why `Wire` in `v1-contract-equality.ts` can map the whole
 * contract side and still compare equal — so a head segment matching no key
 * rewrites nothing. And `Omit<T, P>` for a `P` that is not a key of `T` is
 * `Exclude<keyof T, P>` over the full key set, which is every key. The
 * no-op holds by construction in both arms, and the three
 * `UnresolvablePathIsANoOp` assertions are what keep it holding.
 */
type OmitPath<T, P extends string> = P extends `${infer H}.${infer R}`
  ? { [K in keyof T]: K extends H ? DeepOmit<T[K], R> : T[K] }
  : Flat<Omit<T, P>>;

/**
 * `T` with every path in `Ps` erased, applied left to right.
 *
 * Paths sharing a prefix are fine — the second application recurses into the
 * already-rewritten branch — and the order does not change the result.
 */
export type DeepOmitAll<T, Ps extends readonly string[]> = Ps extends readonly [
  infer F extends string,
  ...infer Rest extends readonly string[]
]
  ? DeepOmitAll<DeepOmit<T, F>, Rest>
  : T;
