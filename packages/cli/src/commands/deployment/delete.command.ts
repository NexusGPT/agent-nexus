import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printDryRun, printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";

/** `nexus deployment delete` */
export function registerDeploymentDeleteCommand(deployment: Command, program: Command): void {
  confirmable(deployment.command("delete"))
    .description("Delete a deployment")
    .argument("<id>", "Deployment ID")
    .option("--dry-run", "Preview without deleting")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment delete 11111111-1111-4111-8111-111111111111
  $ nexus deployment delete 11111111-1111-4111-8111-111111111111 --yes
  $ nexus deployment delete 11111111-1111-4111-8111-111111111111 --dry-run

Notes:
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  Pass --dry-run first if the id came from anywhere but your own eyes.

  --dry-run IGNORES --json AND PRINTS PROSE. The line is
  'DRY RUN: Would delete deployment "<name>" (<id>)' on stdout, on every
  invocation, so a script piping this into jq gets a parse error rather than a
  document. The habit does not transfer from elsewhere in this CLI:
  "agent-skill sync --dry-run" and "claude-code ... --dry-run" both branch on
  --json and emit a real document. A dry run also READS the deployment first,
  so it needs deployments:read as well, and a 404 on that read is what it
  reports.

  ITS CONNECTIONS ARE DISCONNECTED, NOT DELETED. The OAuth or API-key
  connection this deployment used is detached and survives for other
  deployments; the agent's prompt loses this channel's tab. A WhatsApp or SMS
  number is freed and stays purchased — release it separately if you are done
  with it, or it keeps billing.

  Whether the row survives is an organization-wide policy (SOFT keeps it with
  deletedAt set, HARD drops it and keeps a tombstone). Either way it stops
  being visible to every read here, and conversations and analytics survive.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (opts.dryRun) {
          const dep = await client.deployments.get(id);
          printDryRun(`Would delete deployment "${dep.name}" (${id})`, { id });
          return;
        }

        if (!(await confirmDestructive(`Delete deployment ${id}? This cannot be undone.`, opts)))
          return;

        await client.deployments.delete(id);
        printSuccess("Deployment deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
