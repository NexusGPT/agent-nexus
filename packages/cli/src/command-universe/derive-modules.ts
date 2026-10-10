/**
 * THE ATTRIBUTION SOURCE — every module, and the top-level commands it registers.
 *
 * Each registrar runs against its OWN throwaway program, which is the only
 * way to learn WHICH module produced a namespace and which hidden siblings sit
 * beside it. This is the one function in this directory that runs a registrar.
 *
 * WHAT BELONGS HERE: `deriveCommandModules` and nothing else. It is the single
 * walk every projection is built from, which is why it is its own file: a
 * reader looking for "where does the population come from" lands on one
 * function.
 *
 * WHAT DOES NOT: reshaping of the result, or judgement about whether a
 * registrar is actually wired into the real CLI — `command-universe.test.ts`
 * asserts that separately, and this walk cannot see it.
 */

import { Command } from "commander";

import { buildNode, rootProgramHelpIndex } from "./build-node";
import type { CommandModule } from "./command-node";
import { discoverRootRegistrars } from "./registrar-discovery";

/**
 * Every module, and every top-level command each one registers.
 *
 * ⚠️ THIS IS THE ATTRIBUTION SOURCE, NOT THE POPULATION SOURCE. Each registrar
 * runs against its OWN throwaway program, which is the only way to learn WHICH
 * module produced a namespace and which hidden siblings sit beside it. What it
 * cannot know is whether the real CLI calls that registrar at all — so the tree
 * itself is the union of these walks, and the spec beside this module asserts
 * separately that every registrar it finds is actually CALLED somewhere in
 * `src/` — a registrar defined in `src/commands/` and never wired would
 * otherwise contribute a command nobody can run.
 */
export async function deriveCommandModules(): Promise<CommandModule[]> {
  const modules: CommandModule[] = [];
  // Resolved ONCE, here, and threaded down. Every node's `help` getter closes
  // over it and stays lazy and synchronous. The memo lives with the index it
  // guards — see `rootProgramHelpIndex` in `build-node.ts`.
  const rootProgram = await rootProgramHelpIndex();

  for (const registrar of await discoverRootRegistrars()) {
    const program = new Command();
    program.name("nexus").exitOverride();
    registrar.register(program);

    modules.push({
      sourceModule: registrar.module,
      sourcePath: registrar.sourcePath,
      registrar: registrar.name,
      roots: program.commands
        .filter((child) => child.name() !== "help")
        .map((child) => buildNode(child, [], registrar.module, rootProgram))
    });
  }

  return modules;
}
