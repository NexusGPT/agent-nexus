#!/usr/bin/env tsx
/**
 * Publish the collision banner's command strings, READ OFF THE REAL COMMANDER
 * TREE, into `@nexus/types` where the renderer lives.
 *
 *   pnpm generate:track-banner-commands        (from the repository root)
 *
 * ── WHAT THIS CLOSES ─────────────────────────────────────────────────────────
 *
 * Every read of a track task carries a banner, and the banner names a runnable
 * command. A banner naming a command the CLI does not register is an instruction
 * that fails in the reader's hands — and that is exactly what a rename produces
 * when the string is typed into the renderer.
 *
 * 🚨 NO TEMPLATE, NO STRING LITERAL, NO INTERPOLATED VERB. Every word of the
 * emitted value comes off the commander node: the parent chain supplies the
 * words, and the node's registered arguments and required options supply the
 * placeholders. Nothing in the output is typed by a person.
 *
 * ── IT REFUSES AT GENERATION TIME, WHICH IS THE POINT ────────────────────────
 *
 * If a required action resolves to no command in the walk, this exits NON-ZERO
 * NAMING THE ACTION rather than emitting a map with a missing key or a stale
 * string. So renaming the command breaks the BUILD, not the banner.
 *
 * `generate-route-inventory.ts` is the model, line for line, including the
 * MINIMUM_PLAUSIBLE floor — here the floor matters more than there, because the
 * population is tiny: without it, a walk that discovered nothing would report
 * "the CLI does not register `tracks task claim`", which is the same message a
 * genuine rename produces and sends the reader to the wrong file.
 *
 * The tree is rebuilt from the root registrars rather than imported from
 * `src/index.ts`, which ends in `program.parseAsync(process.argv)` and would run
 * the CLI against this script's own argv. `command-universe.ts` owns that
 * reasoning.
 */

import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import { discoverRootRegistrars } from "../src/command-universe";
import { allRouteIds } from "../src/util/route-id";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const OUTPUT = join(
  REPO_ROOT,
  "packages/types/src/shared/domain/tracks/track-banner-commands.generated.ts"
);

/**
 * A floor, not a target. A walk that half works must FAIL rather than report a
 * missing command — the two failures have opposite remedies and identical text.
 */
const MINIMUM_PLAUSIBLE_ROUTES = 50;

/**
 * Every banner action, and the command path it must resolve to.
 *
 * The KEY is what the renderer asks for; the PATH is what this script looks up.
 * Adding a banner form means adding a row here, and the drift test's forward
 * direction fails until one exists — so a new form cannot ship with a blank.
 */
const REQUIRED_ACTIONS: ReadonlyMap<string, readonly string[]> = new Map([
  ["claimTask", ["tracks", "task", "claim"]]
]);

/** The whole CLI tree, rebuilt from its root registrars. */
async function buildProgram(): Promise<Command> {
  const program = new Command();
  program.name("nexus").exitOverride();

  for (const registrar of await discoverRootRegistrars()) {
    registrar.register(program);
  }

  return program;
}

/** Walk down `path` from the program root, or `null` at the first missing step. */
function resolveCommand(program: Command, path: readonly string[]): Command | null {
  let current: Command = program;

  for (const segment of path) {
    const next = (current.commands as Command[]).find(
      (child) => child.name() === segment || child.aliases().includes(segment)
    );
    if (next === undefined) return null;
    current = next;
  }

  return current;
}

/**
 * The invocation string for one node, assembled from the node itself.
 *
 * - the words are the parent chain, root first, with the program's own name;
 * - each registered argument contributes its usage form (`<taskId>`);
 * - each REQUIRED option contributes its long flag and its placeholder.
 *
 * Optional options are deliberately omitted: the banner is an instruction a
 * reader should be able to paste, and every flag past the required ones is noise
 * that makes the line wrap and the instruction easier to ignore.
 */
function renderInvocation(command: Command): string {
  const words: string[] = [];
  for (let node: Command | null = command; node !== null; node = node.parent) {
    words.unshift(node.name());
  }

  const parts = [...words];

  for (const argument of command.registeredArguments) {
    parts.push(argument.required ? `<${argument.name()}>` : `[${argument.name()}]`);
  }

  for (const option of command.options) {
    if (!option.required) continue;
    // `option.flags` is the whole declaration (`--agent <name>`), which already
    // carries the placeholder exactly as the registration spelled it.
    parts.push(option.flags.replace(/^-\w,\s*/, ""));
  }

  return parts.join(" ");
}

function render(commands: ReadonlyMap<string, string>): string {
  const rows = [...commands.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([action, invocation]) => `  ${action}: ${JSON.stringify(invocation)}`)
    .join(",\n");

  return `/**
 * GENERATED — DO NOT EDIT.
 *
 * Source: \`packages/cli/scripts/generate-track-banner-commands.ts\`, which walks
 * the REAL commander tree and reads every word of these strings off the
 * registered node — the parent chain supplies the words, the node's declared
 * arguments and required options supply the placeholders.
 *
 * Regenerate with \`pnpm generate:track-banner-commands\`. The generator EXITS
 * NON-ZERO NAMING THE ACTION when an action resolves to no command, so renaming
 * the command breaks the build rather than the banner.
 */

export const TRACK_BANNER_COMMANDS = {
${rows}
} as const;

export type TrackBannerAction = keyof typeof TRACK_BANNER_COMMANDS;
`;
}

async function main(): Promise<void> {
  const program = await buildProgram();

  const routeIds = new Set(allRouteIds(program));
  if (routeIds.size < MINIMUM_PLAUSIBLE_ROUTES) {
    console.error(
      `REFUSED: the tree walk produced ${routeIds.size} route id(s), below the floor of ` +
        `${MINIMUM_PLAUSIBLE_ROUTES}. That is a broken walk, not a small CLI.`
    );
    console.error(
      "  Without this floor the next message would blame a rename for a walk that " +
        "discovered nothing, and the two have opposite remedies."
    );
    process.exit(1);
  }

  const resolved = new Map<string, string>();
  const missing: string[] = [];

  for (const [action, path] of REQUIRED_ACTIONS) {
    const command = resolveCommand(program, path);
    if (command === null) {
      missing.push(`${action} -> nexus ${path.join(" ")}`);
      continue;
    }
    resolved.set(action, renderInvocation(command));
  }

  if (missing.length > 0) {
    console.error("REFUSED: a banner action resolves to no command the CLI registers.");
    for (const entry of missing) console.error(`  ${entry}`);
    console.error(
      "  The banner is the ONLY place this instruction lives, so emitting a stale or " +
        "empty string here ships an instruction that fails in the reader's hands."
    );
    console.error(
      "  Either restore the command's registration, or update REQUIRED_ACTIONS in this " +
        "script to the path it moved to."
    );
    process.exit(1);
  }

  writeFileSync(OUTPUT, render(resolved), "utf8");
  console.log(`Wrote ${resolved.size} track banner command(s) to ${OUTPUT}`);
}

void main();
