/**
 * THE NODE CONTRACT — what one walk of the commander tree returns.
 *
 * Types and no code. Everything here is derivable from commander ALONE, and
 * the omissions are a seam rather than a gap: a consumer that binds commands to
 * the public API contract maps a node into its own richer type and adds that
 * field there. This directory is the gate `Tests: Vitest` runs, so it must not
 * be able to go red because a contract projection somewhere else broke.
 *
 * WHAT BELONGS HERE: the four shapes a walk yields — `CommandOption`,
 * `CommandNode`, `CommandModule`, `CommandNamespace` — and the reasoning about
 * which facts are commander's and which are the root program's.
 * `CommandNode.help` is LAZY and its docblock is the argument for that; read it
 * before touching the getter.
 *
 * WHAT DOES NOT: the v1-contract binding, and no field a consumer could compute
 * for itself. Also no walk: `build-node.ts` is what fills these in.
 */

export interface CommandOption {
  readonly flags: string;
  readonly description: string;
  /** `.choices()`, when the option declares them. */
  readonly choices?: readonly string[];
}

export interface CommandNode {
  /** Space-joined path from the ROOT, e.g. `apps list`. Keys {@link COMMAND_CLASSIFICATION}. */
  readonly path: string;
  /** The final segment only, e.g. `list`. */
  readonly name: string;
  readonly description: string;
  /** Commander `.alias()` values. Never their own commands — see the note below. */
  readonly aliases: readonly string[];
  /** `true` for a `{ hidden: true }` registration, which no `--help` renders. */
  readonly hidden: boolean;
  /**
   * The rendered `--help` of the REAL root program's command at this path —
   * byte-for-byte what a terminal receives, `addHelpText` blocks included.
   *
   * 🚨 IT IS CAPTURED FROM `buildRootProgram()`, NEVER FROM THE THROWAWAY
   * PROGRAM THE REGISTRAR RAN AGAINST, and that distinction is the whole of this
   * field. `index.ts` installs two help blocks on the FINISHED tree, after every
   * registrar has run — the known-issues pointer and the help-scope footer — so a
   * per-registrar program cannot carry either by construction. Capturing there
   * dropped both lines from all 565 documented paths while the text still read
   * as real `--help` output, and the docblock that used to sit here promised the
   * `addHelpText` blocks were included.
   *
   * {@link helpSource} says which program a given node's text came from. Do not
   * re-apply the root decorations to a throwaway program instead: that is a
   * second list of root-level help registrations to keep in step with
   * `buildRootProgram`, and the next one anyone adds diverges in silence.
   *
   * Lazy and memoized. Capturing it eagerly for EVERY node in the tree would
   * put the cost on the classification gate, which never reads it. The node
   * count is deliberately not quoted — it moves with every command anyone adds,
   * the figure that used to sit here read ~582 against a live 642, and the
   * laziness is a property `command-universe.test.ts` asserts directly rather
   * than a cost this comment can size.
   */
  readonly help: string;
  /**
   * Which program {@link help} was captured from.
   *
   * `registrar-fallback` is a REPORTABLE fact, not a graceful degradation: it
   * means the real root program has no command at this path, so the registrar
   * that produced the node is defined and never wired. Its help would read
   * exactly like a real one, which is why the discriminator exists rather than a
   * silent fallback. `docs-help-matches-the-real-cli.test.ts` fails on any node
   * carrying it.
   */
  readonly helpSource: "root-program" | "registrar-fallback";
  readonly options: readonly CommandOption[];
  readonly children: readonly CommandNode[];
  readonly isLeaf: boolean;
  /** The `src/commands/*.ts` basename whose registrar produced this node. */
  readonly sourceModule: string;
}

/**
 * One `src/commands/*.ts` module and every TOP-LEVEL command it registers.
 *
 * Roots are plural and hidden ones are included, because a module may register
 * more than one. `upgrade.ts` registered ONE visible namespace and EIGHTEEN
 * hidden top-level aliases — each a childless `Command` rather than a commander
 * `.alias()`, with nothing distinguishing it from a real command except
 * `hidden`. Those are gone and the shape still carries the fact, because a
 * module registering a hidden root is a thing this walk has to be able to see.
 */
export interface CommandModule {
  readonly sourceModule: string;
  readonly sourcePath: string;
  readonly registrar: string;
  readonly roots: readonly CommandNode[];
}

/**
 * A visible top-level namespace, with the hidden siblings its module registered
 * beside it.
 */
export interface CommandNamespace extends CommandNode {
  /**
   * Sibling TOP-LEVEL commands the same module registered hidden. Absent from
   * every `--help`, which is why they are carried here rather than discovered.
   * Empty across the whole tree today.
   *
   * Empty when the module registers more than one VISIBLE namespace, because
   * arity alone cannot say which of them owns the hidden ones. Those cases are
   * reported by {@link unattributedHiddenSiblings} rather than guessed at.
   */
  readonly hiddenSiblings: readonly string[];
  readonly sourcePath: string;
  readonly registrar: string;
}
