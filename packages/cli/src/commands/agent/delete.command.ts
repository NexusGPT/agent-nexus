import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printDryRun, printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";

/** `nexus agent delete` */
export function registerAgentDeleteCommand(agent: Command, program: Command): void {
  confirmable(agent.command("delete"))
    .description("Delete an agent")
    .argument("<id>", "Agent ID")
    .option("--dry-run", "Preview without deleting")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent delete 11111111-1111-4111-8111-111111111111
  $ nexus agent delete 11111111-1111-4111-8111-111111111111 --yes
  $ nexus agent delete 11111111-1111-4111-8111-111111111111 --dry-run

Notes:
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  --dry-run previews without deleting.
  Answers 200 with {id, deleted: true} — NOT 204, and not the deleted record.
  SOFT BY DEFAULT. The organization's deletion policy decides, its seeded value
  is SOFT, and a DeletedAgent tombstone keeps preserved agentId references
  resolvable. A second delete of the same id is a 404.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (opts.dryRun) {
          const agent = await client.agents.get(id);
          printDryRun(`Would delete agent "${agent.firstName} ${agent.lastName}" (${id})`, { id });
          return;
        }

        if (!(await confirmDestructive(`Delete agent ${id}? This cannot be undone.`, opts))) return;

        await client.agents.delete(id);
        printSuccess("Agent deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
