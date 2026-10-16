import type {
  ConfirmationKind,
  SurfaceDisposition,
  SurfaceJsonShape,
  SurfaceTier
} from "./cli-surface.model.fields";

/**
 * ONE INVOCABLE LEAF OF THE `nexus` BINARY.
 *
 * Every field is DERIVED from the real commander tree. Nothing here is declared
 * by hand, so no field can be forgotten when a command is added.
 *
 * ── THE FLAG AND ARGUMENT ENCODING ──────────────────────────────────────────
 *
 * Both are strings rather than objects, because the review artefact this file
 * exists to produce is a DIFF, and a one-line row makes "a flag lost its value
 * placeholder" a single readable line instead of a six-line object rewrite.
 * Commander's own `flags` string already carries the short alias, the long name,
 * whether a value is taken (`<v>` required, `[v]` optional), variadicity
 * (`...`) and negation (`--no-`). Three facts it does NOT carry are prefixed or
 * suffixed here:
 *
 *   `!`         the option itself is MANDATORY (`makeOptionMandatory`)
 *   `~`         the option is HIDDEN from `--help`
 *   ` {a|b|c}`  the option or argument restricts its value to these choices
 *
 * An argument is `<name>` when required, `[name]` when optional, and carries
 * `...` when variadic — commander's own spelling, in declaration order, because
 * the ORDER is the promise.
 */
export interface SurfaceLeaf {
  /** The full command path, space-joined, exactly as a caller types it. */
  readonly path: string;
  /** Which COMPATIBILITY.md tier governs {@link path} and {@link args}. */
  readonly tier: SurfaceTier;
  /** The module whose registrar produced this leaf's top-level namespace. */
  readonly module: string;
  /** What `COMMAND_CLASSIFICATION` permits doing with this leaf, or its absence. */
  readonly disposition: SurfaceDisposition;
  /** Positionals in DECLARATION ORDER. The order is the contract. */
  readonly args: readonly string[];
  /** Options in declaration order, encoded as documented above. */
  readonly flags: readonly string[];
  /** Alternative names commander resolves to this leaf. */
  readonly aliases: readonly string[];
  /** Absent from `--help` by construction. */
  readonly hidden: boolean;
  /** How `--yes` is wired, or `null` when this leaf is not destructive. */
  readonly confirm: ConfirmationKind | null;
  /** The `--json` envelope shape, or `"(abstains)"` when unknown. */
  readonly json: SurfaceJsonShape;
  /**
   * A RENAME-STABLE IDENTITY, and the field a deprecation mechanism binds to.
   *
   * 12 hex characters of `sha256(module, sorted flags, args, description)`.
   * The PATH is deliberately absent, so renaming `agent get` to `agent show`
   * moves the row and leaves this unchanged — which is what separates "this leaf
   * was renamed" from "one leaf was removed and an unrelated one added".
   *
   * ⚠️ IT IS NOT GUARANTEED UNIQUE, so do not treat it as a primary key without
   * looking. Several leaves registered from one module as aliases of a single
   * action share a module, an empty description, no flags and no arguments —
   * nothing can distinguish them because there is nothing to distinguish.
   *
   * THE GENERATED HEADER IS THE ANSWER, not this comment: it names every
   * colliding group by member, or states that every shape is unique. It is
   * rewritten on each generation, so it is current in a way prose here cannot
   * be.
   *
   * It is also blind by construction to a rename that lands in the SAME commit
   * as a flag or description change — both sides move and the row reads as a
   * removal plus an addition. That is a limit of any derived identity, and the
   * honest alternative is a declared one, which a generator cannot invent.
   */
  readonly shape: string;
}
