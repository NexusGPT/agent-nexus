import type { ProjectedDescriptor } from "./contract-help.render";

/**
 * THE SHAPES THE CONTRACT BINDING IS EXPRESSED IN.
 *
 * Declared in this leaf rather than in `contract-binding.ts`, which is a
 * re-export index and imports nothing: a shared value declared in an index its
 * own siblings import back from costs one `import/no-cycle` warning per
 * sibling, against a package running `eslint . --max-warnings 9`.
 *
 * `contract-binding.ts` carries why any of this exists; this file carries only
 * the types.
 */

/**
 * A contract enum, as emitted into `<namespace>.contract.generated.ts`.
 *
 * `path` is the join key and the only hand-written part: `<Descriptor>.<slot>.
 * <dotted field>`, where slot is `Body`, `Params` or `PathVars`, and a `[]`
 * segment steps into an array's element (`Body.filters[].op`).
 */
export interface ContractEnum {
  readonly path: string;
  /** Every value the v1 contract accepts. Generated — never hand-edited. */
  readonly contractValues: readonly string[];
}

/**
 * A declared, reasoned difference between what the CLI offers and what the
 * contract lists. There are exactly two directions and both must be stated.
 *
 * NOT a way to quiet the gate. Where the CONTRACT is wrong, the fix is the
 * contract — an omission here leaves every SDK and MCP consumer still being told
 * a broken value works.
 */
export interface EnumDivergence {
  /**
   * NARROWING. Contract values this CLI does not offer. Each must still exist
   * upstream: `contract-help.test.ts` fails on an omission that matches nothing,
   * because a filter whose target has already been removed excludes nothing and
   * reads exactly like one that is still doing its job.
   */
  readonly omit?: readonly string[];
  /**
   * WIDENING. Extra spellings the CLI accepts and normalises into a contract
   * value before sending — `7d` for `last_7_days`. Declaring them is what lets
   * `.choices()` keep validating; see `normalise` in `contract-binding.ts`'s
   * `enumOption` for why that is not automatic.
   */
  readonly alsoAccepts?: readonly string[];
  /** Why, in one sentence. Rendered into `--help`, so write it for an operator. */
  readonly because: string;
}

/** What the gate recovers from a live `Option`. */
export interface BoundOption {
  readonly source: ContractEnum;
  readonly divergence?: EnumDivergence;
  /** What `.choices()` was actually given: contract values minus any omission. */
  readonly offered: readonly string[];
}

/**
 * What the gate recovers from a live `Argument`.
 *
 * Structurally identical to `BoundOption`, and deliberately a separate type
 * rather than a shared one: the two are keyed off different commander objects
 * and read back through different accessors, so a single alias would let a
 * caller pass an `Option`'s record where an `Argument`'s belongs and typecheck.
 */
export interface BoundArgument {
  readonly source: ContractEnum;
  readonly divergence?: EnumDivergence;
  /** What `.choices()` was actually given: contract values minus any omission. */
  readonly offered: readonly string[];
}

/** What the gate recovers from a live `Command`. */
export interface BoundCommand {
  /** The generated shape of the v1 descriptor this command calls. */
  readonly shape: ProjectedDescriptor;
  /**
   * Enum paths this command reaches only through `--body`, each with the reason
   * it has no flag. Without this the gate cannot tell a field somebody forgot to
   * expose from one deliberately left to `--body`.
   */
  readonly bodyOnly: Readonly<Record<string, string>>;
}
