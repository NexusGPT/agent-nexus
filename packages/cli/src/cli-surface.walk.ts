import type { Command } from "commander";

import { encodeArgument, encodeOption, shapeOf, tierOf } from "./cli-surface.encode";
import type { ConfirmationKind, SurfaceDisposition, SurfaceLeaf } from "./cli-surface.model";
import { ABSTAINS, type Projection, UNCLASSIFIED } from "./cli-surface.projection.model";
import { indexCommandTree } from "./command-tree-index";
import { COMMAND_CLASSIFICATION, type CommandNode, deriveCommandNodes } from "./command-universe";
import { JSON_SHAPES } from "./json-shape.generated";
import { buildRootProgram, VERSION } from "./root-program";
import { isConfirmable } from "./util/confirm";

/**
 * THE TWO WALKS AND THE JOIN BETWEEN THEM. `cli-surface.project.ts` is the
 * module header for this whole family and documents why there are two; this
 * file is the half that performs them.
 */

/** Every command the SHIPPED binary parses with, keyed by space-joined path. */
export function realRootProgram(): ReadonlyMap<string, Command> {
  return indexCommandTree(buildRootProgram(VERSION));
}

/** One joined pair — a derived node and its live `Command` — projected onto a row. */
function toSurfaceLeaf(node: CommandNode, command: Command): SurfaceLeaf {
  const args = command.registeredArguments.map(encodeArgument);
  const flags = command.options.map(encodeOption);
  const declaresYes = command.options.some((option) => option.long === "--yes");
  const confirm: ConfirmationKind | null = !declaresYes
    ? null
    : isConfirmable(command)
      ? "confirmable"
      : "hand-rolled";

  const disposition: SurfaceDisposition = COMMAND_CLASSIFICATION[node.path] ?? UNCLASSIFIED;

  return {
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
  };
}

/** Shapes carried by more than one leaf, each group in first-seen order. */
function collisionsByShape(leaves: readonly SurfaceLeaf[]): readonly (readonly string[])[] {
  const byShape = new Map<string, string[]>();
  for (const leaf of leaves) {
    const group = byShape.get(leaf.shape);
    if (group === undefined) byShape.set(leaf.shape, [leaf.path]);
    else group.push(leaf.path);
  }
  return [...byShape.values()].filter((group) => group.length > 1);
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

    leaves.push(toSurfaceLeaf(node, command));
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
    shapeCollisions: collisionsByShape(leaves)
  };
}
