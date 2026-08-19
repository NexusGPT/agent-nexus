import { createHash } from "node:crypto";

import type { Argument, Command, Option } from "commander";

import type {
  ConfirmationKind,
  SurfaceDisposition,
  SurfaceLeaf,
  SurfaceTier
} from "./cli-surface.model";
import { COMMAND_CLASSIFICATION, type CommandNode, deriveCommandNodes } from "./command-universe";
import { JSON_SHAPES } from "./json-shape.generated";
import { buildRootProgram, VERSION } from "./root-program";
import { isConfirmable } from "./util/confirm";

/**
 * PROJECT THE WHOLE PUBLIC SURFACE OF `nexus` — one function, two readers.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The CLI registers hundreds of invocable leaves and nothing put them in one
 * place. So the question a reviewer most needs answered — *did this pull request
 * change the public surface?* — had no artefact to answer it. A removed flag, a renamed
 * subcommand, a new required positional and a leaf turning hidden all landed as
 * a diff in a registration file that reads like any other edit.
 *
 * `cli-surface.generated.ts` is that artefact. `scripts/generate-cli-surface.ts`
 * writes it; `cli-surface.codegen.test.ts` recomputes it and fails on any
 * difference. Both call THIS function, so the writer and its gate cannot answer
 * differently — the defect `command-universe.ts` documents next door.
 *
 * The gate is not the value. THE DIFF IS. A pull request that changes the
 * surface goes red until its author regenerates, and the regenerated diff is
 * then a line-per-leaf statement of exactly what the surface gained or lost.
 *
 * ── THE TWO WALKS, AND WHY THERE ARE TWO ────────────────────────────────────
 *
 * `deriveCommandNodes()` is the POPULATION and the ATTRIBUTION: it unions the
 * per-registrar walks, which is the only way to learn WHICH module produced a
 * namespace. What a `CommandNode` cannot carry is the structural detail this
 * manifest is about — positionals, option mandatoriness, option hiddenness,
 * `.choices()` on either — because none of that is on the node type.
 *
 * So the live `Command` objects of the REAL root program supply the detail, and
 * the join is by path. `docs-help-matches-the-real-cli.test.ts` walks the root
 * program the same way and for the same reason; this is the house pattern, not
 * a shortcut around `command-universe.ts`.
 *
 * ⚠️ TWO WALKS OF ONE TREE IS EXACTLY HOW TWO ANSWERS START DISAGREEING, which
 * is why {@link Projection.unjoined} is a FIELD rather than an assumption. A
 * leaf the root program does not carry is REPORTED, never dropped and never
 * guessed at, and the spec asserts the two sets are equal in both directions.
 * Measured today: 586 nodes, 586 root-program paths, 0 either way.
 *
 * ── WHAT IS DERIVED, AND WHAT COULD NOT BE ──────────────────────────────────
 *
 * Every field on every row is read off commander. Two joins reach outside it,
 * and both are onto artefacts that are themselves derived:
 *
 *   - `disposition` joins `COMMAND_CLASSIFICATION`, which is DECLARED. Intent
 *     is not derivable — only a human knows `agent delete` must never run in a
 *     sweep. A leaf that declaration does not name is rendered `"(unclassified)"`
 *     rather than defaulted to a plausible word; `command-universe.test.ts` is
 *     what REFUSES that state, and this manifest only has to report it.
 *   - `json` joins `JSON_SHAPES`, itself generated and gated next door. Its
 *     abstentions arrive here as `"(abstains)"` rather than as an absent key,
 *     because an absent key and an unclassified command look identical in a
 *     diff and only one of them is news.
 *
 * Nothing here greps source. The package ships a 9 MB prose bundle in
 * `skills-content.generated.json`, and a `grep` over `src/` for a flag name
 * counts the prose — which has already produced two false census readings in
 * this package.
 */

/** The `--json` envelope a leaf prints, or the honest absence. */
const ABSTAINS = "(abstains)" as const;

/**
 * A leaf `COMMAND_CLASSIFICATION` does not name — the state a NEW command is in
 * before anyone declares its disposition. Rendered, never crashed on, and never
 * silently defaulted to a real disposition: guessing `registration-only` here
 * would put a plausible word in a review artefact that nobody declared.
 */
const UNCLASSIFIED = "(unclassified)" as const;

/**
 * Namespaces `COMPATIBILITY.md` carves out of STABLE by name.
 *
 * `vibe` and `admin` are named under UNSTABLE — "visible because operators need
 * to find them, not because they are stable". `nexus api` has its own UNSTABLE
 * section. This is a transcription of that document, so a leaf's tier is a
 * CHECKABLE consequence of the promise rather than a second opinion about it.
 */
const UNSTABLE_NAMESPACES: ReadonlySet<string> = new Set(["admin", "api", "vibe"]);

/**
 * Which promise governs this leaf's path and required positionals.
 *
 * Hiddenness wins over everything: `COMPATIBILITY.md`'s INTERNAL tier opens with
 * "hidden commands", and a hidden command under `admin` is still hidden.
 */
export function tierOf(node: Pick<CommandNode, "path" | "hidden">): SurfaceTier {
  if (node.hidden) return "INTERNAL";
  return UNSTABLE_NAMESPACES.has(node.path.split(" ")[0]) ? "UNSTABLE" : "STABLE";
}

/** `{a|b|c}`, or nothing when the value is unrestricted. */
function choiceSuffix(choices: readonly string[] | undefined): string {
  return choices === undefined || choices.length === 0 ? "" : ` {${choices.join("|")}}`;
}

/**
 * One option, encoded.
 *
 * The `flags` string is commander's own and carries the short alias, the long
 * name, the value placeholder and negation. `!` and `~` carry the two facts it
 * does not: a MANDATORY option, and one hidden from `--help`.
 *
 * 🚨 EVERY FIELD HERE IS READ AS DECLARED, WITH NO CAST, AND THAT IS THE POINT.
 * `mandatory`, `hidden` and `argChoices` are all public on commander's `Option`,
 * as `required`, `variadic` and `argChoices` are on `Argument` and
 * `registeredArguments` is on `Command`. A cast would compile identically today
 * and fail SILENTLY on an upstream rename — the read yields `undefined`, the
 * comparison is `false`, and every mandatory option in the manifest quietly
 * reports as optional with no type error anywhere.
 *
 * `command-universe.ts` documents that failure beside `isHiddenCommand`, having
 * been bitten by it. This file is generated evidence about the public surface;
 * a fact that can go wrong without a compiler error is the defect, not the cast.
 */
export function encodeOption(option: Option): string {
  return `${option.mandatory ? "!" : ""}${option.hidden ? "~" : ""}${option.flags}${choiceSuffix(option.argChoices)}`;
}

/** One positional, in commander's own spelling: `<required>`, `[optional]`, `...` variadic. */
export function encodeArgument(argument: Argument): string {
  const name = `${argument.name()}${argument.variadic ? "..." : ""}`;
  return `${argument.required ? `<${name}>` : `[${name}]`}${choiceSuffix(argument.argChoices)}`;
}

/**
 * THE RENAME-STABLE IDENTITY. Everything except the path.
 *
 * The description is load-bearing and was measured rather than assumed. Without
 * it the fingerprint collapses to module + flags + arity, and that collides on
 * hundreds of leaves — `agent get <id>` and `agent delete <id>` are the same
 * shape under it. Including the description separates them.
 *
 * It does not make the field unique, and it cannot: leaves registered as aliases
 * of ONE action share every input this hashes. {@link Projection.shapeCollisions}
 * reports each such group and the generated header names them, so the current
 * answer is read there rather than from a number written down here.
 */
export function shapeOf(input: {
  readonly module: string;
  readonly description: string;
  readonly args: readonly string[];
  readonly flags: readonly string[];
}): string {
  // Joined on NUL, because no flag, argument or description can contain one, so
  // two different field splits can never hash to the same material. Written as
  // an ESCAPE rather than a literal: a raw NUL is invisible in an editor, and it
  // makes `grep` classify the whole file as binary and report zero matches.
  const material = [
    input.module,
    [...input.flags].sort().join("|"),
    input.args.join(" "),
    input.description
  ].join("\u0000");
  return createHash("sha256").update(material).digest("hex").slice(0, 12);
}

export interface Projection {
  /** Every invocable leaf, sorted by path. */
  readonly leaves: readonly SurfaceLeaf[];
  /** Options declared on the ROOT program — global, and STABLE by `COMPATIBILITY.md`. */
  readonly globals: readonly string[];
  /** Every node in the tree, leaves and namespaces alike. Sizes the tree. */
  readonly nodeCount: number;
  /** Top-level commands, and how many of those are hidden. */
  readonly topLevel: { readonly total: number; readonly visible: number; readonly hidden: number };
  /**
   * Leaves the root-program walk does not carry, by path. Reported rather than
   * dropped: an empty list is the CLAIM the spec checks, not a fact assumed here.
   */
  readonly unjoined: readonly string[];
  /**
   * Shapes shared by more than one leaf, each naming its members. The manifest's
   * rename signal cannot separate the leaves inside a group, and a reader must be
   * told which those are rather than discovering it during a review.
   */
  readonly shapeCollisions: readonly (readonly string[])[];
}

/** Every command the SHIPPED binary parses with, keyed by space-joined path. */
export function realRootProgram(): ReadonlyMap<string, Command> {
  const index = new Map<string, Command>();

  const visit = (command: Command, prefix: readonly string[]): void => {
    const path = [...prefix, command.name()];
    index.set(path.join(" "), command);
    for (const child of command.commands) {
      if (child.name() !== "help") visit(child, path);
    }
  };

  for (const root of buildRootProgram(VERSION).commands) {
    if (root.name() !== "help") visit(root, []);
  }

  return index;
}

/** Walk the real tree and project every leaf onto one row. */
export async function projectCliSurface(): Promise<Projection> {
  const nodes = await deriveCommandNodes();
  const program = buildRootProgram(VERSION);
  const index = realRootProgram();

  const leaves: SurfaceLeaf[] = [];
  const unjoined: string[] = [];

  for (const node of nodes) {
    if (!node.isLeaf) continue;

    const command = index.get(node.path);
    if (command === undefined) {
      // NEVER a guess. A row invented from the node alone would carry no
      // positionals at all, which reads exactly like a command that takes none.
      unjoined.push(node.path);
      continue;
    }

    const args = command.registeredArguments.map(encodeArgument);
    const flags = command.options.map(encodeOption);
    const declaresYes = command.options.some((option) => option.long === "--yes");
    const confirm: ConfirmationKind | null = !declaresYes
      ? null
      : isConfirmable(command)
        ? "confirmable"
        : "hand-rolled";

    const disposition: SurfaceDisposition = COMMAND_CLASSIFICATION[node.path] ?? UNCLASSIFIED;

    leaves.push({
      path: node.path,
      tier: tierOf(node),
      module: node.sourceModule,
      disposition,
      args,
      flags,
      aliases: node.aliases,
      hidden: node.hidden,
      confirm,
      json: JSON_SHAPES[node.path] ?? ABSTAINS,
      shape: shapeOf({ module: node.sourceModule, description: node.description, args, flags })
    });
  }

  const byShape = new Map<string, string[]>();
  for (const leaf of leaves) {
    const group = byShape.get(leaf.shape);
    if (group === undefined) byShape.set(leaf.shape, [leaf.path]);
    else group.push(leaf.path);
  }

  // The top-level tally comes from the DERIVED NODES, never from a second read
  // of commander's private `_hidden`.
  //
  // 🚨 THE PRIVATE READ FAILS SILENTLY, AND THIS FILE IS THE WORST PLACE FOR IT.
  // `_hidden` is undeclared, so a cast is the only way to reach it — and if
  // commander renames the field the read yields `undefined`, `undefined === true`
  // is `false`, and EVERY hidden command reports as visible. No type error, no
  // crash: just a header overstating the visible top-level count and a tier
  // column with no INTERNAL rows in it. `command-universe.ts` documents that
  // exact failure beside `isHiddenCommand`, which asks commander's own
  // `visibleCommands` filter what it would render.
  //
  // Taking it from the nodes is better than calling `isHiddenCommand` here,
  // because it removes the SECOND SOURCE rather than correcting it: every row's
  // `hidden` field already came through that helper, so the header can no longer
  // disagree with the rows underneath it.
  const top = nodes.filter((node) => !node.path.includes(" "));
  const hidden = top.filter((node) => node.hidden);

  return {
    leaves,
    globals: program.options.map(encodeOption),
    nodeCount: nodes.length,
    topLevel: { total: top.length, visible: top.length - hidden.length, hidden: hidden.length },
    unjoined,
    shapeCollisions: [...byShape.values()].filter((group) => group.length > 1)
  };
}

/** One row, on one line, so a changed leaf is a readable one-line diff. */
export function renderLeaf(leaf: SurfaceLeaf): string {
  const cell = (values: readonly string[]): string =>
    `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
  return (
    `  { path: ${JSON.stringify(leaf.path)}` +
    `, tier: ${JSON.stringify(leaf.tier)}` +
    `, module: ${JSON.stringify(leaf.module)}` +
    `, disposition: ${JSON.stringify(leaf.disposition)}` +
    `, args: ${cell(leaf.args)}` +
    `, flags: ${cell(leaf.flags)}` +
    `, aliases: ${cell(leaf.aliases)}` +
    `, hidden: ${String(leaf.hidden)}` +
    `, confirm: ${leaf.confirm === null ? "null" : JSON.stringify(leaf.confirm)}` +
    `, json: ${JSON.stringify(leaf.json)}` +
    `, shape: ${JSON.stringify(leaf.shape)} }`
  );
}

function tally(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, count]) => `${count} ${label}`)
    .join(", ");
}

/** The generated module's text. One function, so the writer and the gate share it. */
export function renderCliSurfaceModule(projection: Projection): string {
  const { leaves } = projection;

  // A type PREDICATE, not a cast at the read below. `.filter()` does not narrow
  // on its own, and the alternative — `leaf.confirm as string` inside the tally
  // — would keep compiling if `confirm` ever became optional.
  const destructive = leaves.filter(
    (leaf): leaf is SurfaceLeaf & { readonly confirm: ConfirmationKind } => leaf.confirm !== null
  );
  const answered = leaves.filter((leaf) => leaf.json !== ABSTAINS);
  const collisions =
    projection.shapeCollisions.length === 0
      ? " *   none — every shape is unique.\n"
      : projection.shapeCollisions
          .map((group) => ` *   ${group.length} leaves: ${group.join(", ")}\n`)
          .join("");
  const unjoined =
    projection.unjoined.length === 0
      ? "none"
      : `${projection.unjoined.length} — ${projection.unjoined.join(", ")}`;

  return `import type { SurfaceLeaf } from "./cli-surface.model";

/**
 * GENERATED by \`scripts/generate-cli-surface.ts\`. DO NOT EDIT.
 *
 * THE PUBLIC SURFACE OF THE \`nexus\` BINARY, IN ONE FILE, SO A CHANGE TO IT IS A
 * DIFF. Walked off the real commander tree — never grepped — by
 * \`cli-surface.project.ts\`, which documents every join and every abstention.
 * \`cli-surface.codegen.test.ts\` recomputes this file and fails on any
 * difference, so a pull request that moves the surface stays red until its
 * author regenerates, and the regenerated diff is the review artefact.
 *
 * ── THE TREE TODAY ──────────────────────────────────────────────────────────
 *
 * ${projection.nodeCount} command nodes; ${leaves.length} invocable leaves.
 * ${projection.topLevel.total} top-level commands — ${projection.topLevel.visible} visible, ${projection.topLevel.hidden} hidden.
 * Leaves with no root-program binding: ${unjoined}.
 *
 *   tier         ${tally(leaves.map((leaf) => leaf.tier))}
 *   disposition  ${tally(leaves.map((leaf) => leaf.disposition))}
 *   --yes        ${destructive.length} destructive — ${tally(destructive.map((leaf) => leaf.confirm))}
 *   --json       ${answered.length} answered, ${leaves.length - answered.length} abstain
 *
 * ── THE TIER IS ABOUT THE PATH AND THE REQUIRED POSITIONALS ─────────────────
 *
 * Transcribed from \`COMPATIBILITY.md\`, not re-decided here: hidden is INTERNAL;
 * \`admin\`, \`api\` and \`vibe\` are UNSTABLE by name; everything else is STABLE.
 * On EVERY row, whatever its tier, the optional \`flags\` are EVOLVING and the
 * \`--json\` PAYLOAD FIELDS are UNSTABLE. A row is not "a STABLE thing".
 *
 * ── READING A ROW ───────────────────────────────────────────────────────────
 *
 *   args     positionals in DECLARATION ORDER. \`<x>\` required, \`[x]\` optional,
 *            \`...\` variadic, \` {a|b}\` restricted. The ORDER is the promise.
 *   flags    commander's own flag string, which already carries the short alias,
 *            the value placeholder and negation, plus \`!\` mandatory option,
 *            \`~\` hidden option, \` {a|b}\` restricted.
 *   confirm  how \`--yes\` is wired — \`confirmable\` by the helper, \`hand-rolled\`
 *            by the command itself, \`null\` when the leaf is not destructive.
 *   shape    a rename-stable identity: sha256 of module, flags, args and
 *            description, WITHOUT the path. A rename moves the row and keeps
 *            this; a removal takes it away.
 *
 * ── SHAPES SHARED BY MORE THAN ONE LEAF ─────────────────────────────────────
 *
 * The rename signal cannot separate the leaves inside a group.
 *
${collisions} *
 * ── THE GLOBAL OPTIONS ──────────────────────────────────────────────────────
 *
 * Declared on the ROOT program, so they work anywhere in the line and belong to
 * no leaf. STABLE by \`COMPATIBILITY.md\`.
 *
${projection.globals.map((flag) => ` *   ${flag}\n`).join("")} */
export const CLI_SURFACE: readonly SurfaceLeaf[] = [
${leaves.map(renderLeaf).join(",\n")}
];

/** The root program's own options, encoded exactly as a leaf's \`flags\` are. */
export const CLI_GLOBAL_OPTIONS: readonly string[] = [
${projection.globals.map((flag) => `  ${JSON.stringify(flag)}`).join(",\n")}
];
`;
}
