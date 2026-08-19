import type { CommandDisposition } from "./command-universe";
import type { JsonShapeId } from "./json-shape-help";

/**
 * THE TYPES UNDER `cli-surface.generated.ts` — deliberately dependency-free.
 *
 * `cli-surface.generated.ts` is a DATA module: one row per leaf and one import.
 * It must not drag the command tree in behind it, so the type it names lives here
 * and this file imports nothing at run time — both imports above are type-only
 * and erase. `cli-surface.project.ts` is the half that walks commander, and
 * nothing that merely READS the manifest has to load it.
 */

/**
 * Which promise in `COMPATIBILITY.md` governs a leaf's PATH and its REQUIRED
 * POSITIONALS. Derived from the document, never declared per command.
 *
 * 🚨 THE TIER IS ABOUT THE PATH AND THE REQUIRED POSITIONALS, AND ABOUT NOTHING
 * ELSE ON THE ROW. Two of the fields beside it are governed by a DIFFERENT tier
 * on every leaf, `STABLE` ones included:
 *
 *   - `flags` — per-command optional flags are EVOLVING everywhere. An addition
 *     may land in any release; a removal owes a deprecation cycle.
 *   - `json`  — the `--json` ENVELOPE is EVOLVING; the field names inside the
 *     document are UNSTABLE. This manifest records the envelope shape only.
 *
 * So a row is not "a STABLE thing"; it is a path and an argument list under one
 * tier, carrying other facts under theirs. Recording one tier per row and
 * calling the row stable is the misreading this comment exists to prevent.
 *
 * EVOLVING is absent from this union ON PURPOSE. No leaf's EXISTENCE is
 * EVOLVING — that tier covers flags, help text, the envelope and the classified
 * SET, none of which is a path. A tier this derivation can never emit must not
 * be spellable, or a reader will look for it and conclude the derivation is
 * broken when it finds none.
 */
export type SurfaceTier =
  /** Named, visible, promised. A rename without an alias is a breaking change. */
  | "STABLE"
  /**
   * `vibe`, `admin` and `api` — carved out of STABLE by name in COMPATIBILITY.md.
   * Visible because operators need to find them, not because they are stable.
   */
  | "UNSTABLE"
  /**
   * Hidden from every `--help`. No promise at all.
   *
   * An EMPTY internal tier is a legitimate reading of a correct tree — a CLI is
   * allowed to hide nothing — so no gate may assert this tier is populated.
   * `cli-surface.codegen.test.ts` tests the tier RULE on synthetic input for
   * exactly that reason.
   */
  | "INTERNAL";

/**
 * How a destructive leaf's `--yes` is wired, or `null` when it declares none.
 *
 * Read off the LIVE `Command` object through `isConfirmable()`, which is a
 * `WeakSet` membership test — a fact placed there by `confirmable()` itself. A
 * source scan could only ask which function a closure appears to call, and
 * cannot tell a hand-rolled prompt that looks right from one that is right.
 */
export type ConfirmationKind =
  /** `--yes` declared through `confirmable()`. The behaviour is held by construction. */
  | "confirmable"
  /** `--yes` declared by hand. The behaviour is held by a test, not by the helper. */
  | "hand-rolled";

/** What a leaf answers under `--json`, or why the derivation abstains. */
export type SurfaceJsonShape = JsonShapeId | "(abstains)";

/**
 * What `COMMAND_CLASSIFICATION` permits doing with a leaf, or the honest absence.
 *
 * 🚨 `"(unclassified)"` IS NOT DECORATION, AND LEAVING IT OUT MADE THE GENERATOR
 * CRASH ON THE ONE CASE IT MOST HAS TO SURVIVE. `COMMAND_CLASSIFICATION` is
 * DECLARED, so a command added today is absent from it until someone writes the
 * line. Typing this field as the declared union forced an unsound cast, and the
 * `undefined` that cast hid reached a `localeCompare` in the header tally — so
 * the fix for "you added a command, regenerate" was a `TypeError` naming
 * neither the command nor the remedy.
 *
 * Measured by mutation: renaming `agent get` to `agent show` without touching
 * the classification. The state is real and the generator has to render it.
 * `command-universe.test.ts` is what REFUSES an unclassified leaf; this manifest
 * only has to report one truthfully.
 */
export type SurfaceDisposition = CommandDisposition | "(unclassified)";

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
