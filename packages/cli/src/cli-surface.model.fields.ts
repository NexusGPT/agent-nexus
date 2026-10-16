import type { CommandDisposition } from "./command-universe";
import type { JsonShapeId } from "./json-shape-help";

/**
 * THE PER-FIELD TYPES OF A SURFACE ROW — tier, confirmation, json shape and
 * disposition. The row itself is `SurfaceLeaf` in `cli-surface.model.leaf.ts`,
 * named rather than `{@link}`ed because it is not in this module's scope and a
 * link that resolves to nothing reads exactly like one that resolves.
 *
 * Split out of `cli-surface.model.ts` so the row type and the field types each
 * stay inside the size cap; the dependency rule is unchanged, and both imports
 * above are type-only and erase.
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
   * `apps`, `admin` and `api` — carved out of STABLE by name in COMPATIBILITY.md.
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
