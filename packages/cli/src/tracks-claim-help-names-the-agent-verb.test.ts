import type { Command } from "commander";
import { describe, expect, it } from "vitest";

import { captureHelp, deriveCommandLeaves } from "./command-universe";
import { buildRootProgram } from "./root-program";

/**
 * `tracks task claim` DEMANDS AN AGENT ID AND MUST NAME WHERE ONE COMES FROM.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS FOR (NEX-4542)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `--agent <agentId>` is a REQUIRED option, and the id is not something a caller
 * can derive, guess or read off the task: it is minted by a different verb in a
 * different namespace. A reader who arrives at `claim --help` holding no agent
 * is at a dead end unless this screen names the verb that mints one.
 *
 * NEX-4542 was filed against exactly that dead end. Its headline claim — that
 * no client command opens an agent row — is FALSE and was false when it was
 * filed: `tracks agent open` has shipped in every published version that has a
 * tracks namespace at all (0.32.0 onward), it renders in `tracks agent --help`,
 * it has a generated docs page, and it carries a line in
 * {@link COMMAND_CLASSIFICATION}. What was true is the gap this file gates: the
 * one screen that REQUIRES the id never said which verb produces it.
 *
 * ── WHY BOTH HALVES ARE ASSERTED, AND WHY EITHER ALONE IS WORTHLESS ──────────
 *
 * The two assertions fail on opposite mutations, and neither covers the other:
 *
 *   - "the help names it" alone goes green over a sentence naming a command
 *     that does not exist. That is the strictly worse failure — a dead end is
 *     visibly a dead end, while an instruction that refuses in the reader's
 *     hands reads as authority until they paste it.
 *   - "the command resolves" alone goes green over a help screen that never
 *     mentions it, which is the state this ticket was filed about.
 *
 * So the sentence is pinned to the TREE rather than to itself. Rename the verb
 * without touching the prose and the resolve arm reds; delete the prose and the
 * naming arm reds.
 *
 * ── THE CONTROL IS NOT DECORATION ────────────────────────────────────────────
 *
 * A broken walk returns no leaves, and every `registered` assertion below would
 * then report "the CLI does not register this command" for commands that are
 * registered perfectly — the same red a genuine rename produces, pointing at the
 * wrong file. The floor fires first. It is a floor and not an exact count
 * because an exact count is a second inventory to maintain.
 *
 * Help is captured from `buildRootProgram()`, never from a throwaway program:
 * `docs-help-matches-the-real-cli.test.ts` owns why, and a capture from the
 * wrong program reads exactly like real `--help` output.
 */

/** The verb that MINTS an agent id, and the verb that lists existing ones. */
const MINT_PATH = "tracks agent open";
const LIST_PATH = "tracks agent list";

/** The screen under test — the one that requires an id it cannot produce. */
const CLAIM_PATH = "tracks task claim";

/**
 * The rendered `--help` at a path in the REAL root program.
 *
 * Walking `command.commands` rather than re-deriving: this asks the shipped tree
 * what it would print, which is the only thing a reader ever sees.
 */
function helpAt(path: string): string {
  let node: Command = buildRootProgram();
  for (const segment of path.split(" ")) {
    const next: Command | undefined = node.commands.find(
      (child) => child.name() === segment || child.aliases().includes(segment)
    );
    if (next === undefined) {
      throw new Error(`no command registered at "${path}" — the walk stopped at "${segment}"`);
    }
    node = next;
  }
  return captureHelp(node);
}

describe("tracks task claim names the verb that mints the id it requires", () => {
  it("CONTROL: the leaf walk found the whole tree, not a fragment", async () => {
    const leaves = await deriveCommandLeaves();

    expect(leaves.length).toBeGreaterThan(400);
  });

  it("CONTROL: the screen under test really does require an agent id", () => {
    // If `--agent` ever stops being required, this whole gate is about a
    // problem that no longer exists, and it should fail rather than keep
    // asserting prose nobody needs.
    const help = helpAt(CLAIM_PATH);

    expect(help).toContain("--agent <agentId>");
  });

  it.each([
    [MINT_PATH, "mints one"],
    [LIST_PATH, "lists the open ones"]
  ])("the claim help names `nexus %s`, the verb that %s", (path) => {
    const help = helpAt(CLAIM_PATH);

    // The full invocation as a reader would type it. Asserting the bare path
    // would be satisfied by the words appearing in unrelated prose.
    expect({ path, named: help.includes(`nexus ${path}`) }).toEqual({ path, named: true });
  });

  it.each([
    [MINT_PATH, "mints one"],
    [LIST_PATH, "lists the open ones"]
  ])("and `nexus %s`, the verb that %s, resolves to a command this CLI registers", async (path) => {
    const leaves = new Set(await deriveCommandLeaves());

    expect({ path, registered: leaves.has(path) }).toEqual({ path, registered: true });
  });
});
