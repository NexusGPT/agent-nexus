import type { Command } from "commander";

import { createClient } from "../../client";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";

/** `nexus agent duplicate` */
export function registerAgentDuplicateCommand(agent: Command, program: Command): void {
  agent
    .command("duplicate")
    .description("Duplicate an agent")
    .argument("<id>", "Agent ID to duplicate")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent duplicate 11111111-1111-4111-8111-111111111111
  $ nexus agent duplicate 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE COPY IS AS CAPABLE AS THE ORIGINAL. It carries the prompt and a fresh row
  for every tool config, credential ids included, so it can act on the same
  accounts from the moment it exists.
  Knowledge collections are RE-CONNECTED, not copied: both agents point at the
  same collection, so editing that collection changes both.
  The copy gets a new id and starts with no published version history.

  THREE THINGS DO NOT SURVIVE, AND NONE OF THEM RAISES AN ERROR:
  TOOL LABELS ARE REWRITTEN. Every label is lowercased and every character that
  is not a letter or digit becomes an underscore, so "Order lookup" and
  "zz-t5" arrive as "order_lookup" and "zz_t5". A collision gets a numeric
  suffix. Mentions inside the copied prompt are remapped for you, so the copy is
  self-consistent — but anything OUTSIDE Nexus that names a tool by its old
  label, a workflow, a script, a runbook, now names nothing.
  A TOOL CONFIG YOUR ORG CANNOT REACH IS DROPPED, NOT COPIED. Duplicating an
  agent from another organization keeps only the configs whose workflow, task,
  collection, plugin or template your org actually holds; the rest are skipped
  and their prompt mentions are rewritten to plain text. The copy answers 201
  with fewer tools than the original and nothing says which went — count with
  "nexus agent-tool list <new-id>" against the source before trusting it.
  ATTACHED CLAUDE CODE SKILLS ARE DROPPED. The copy starts with none; re-attach
  them with "nexus agent-skill add-preset" or "nexus agent-skill create".
  dashboardUrl in the payload is THE COPY'S page, added by this CLI rather than
  returned by the API. It is the fastest way to check what the copy inherited.`
    )
    .action(async (id: string) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const agent = await client.agents.duplicate(id);
        printSuccess("Agent duplicated.", {
          id: agent.id,
          name: `${agent.firstName} ${agent.lastName}`,
          dashboardUrl: dashboardUrlFor("agent", agent.id, globals)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
