import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printList } from "../../output";

/**
 * `nexus access-card available-actions`
 *
 * NOT bound to a contract — see the note beside the registration calls in
 * `commands/access-card.ts`.
 */
export function registerAccessCardAvailableActionsCommand(
  accessCard: Command,
  program: Command
): void {
  accessCard
    .command("available-actions")
    .description("List available actions for a credential")
    .requiredOption("--credential-id <id>", "Credential ID (required)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus access-card available-actions --credential-id 22222222-2222-4222-8222-222222222222
  $ nexus access-card available-actions --credential-id 22222222-2222-4222-8222-222222222222 --json

Notes:
  --credential-id IS REQUIRED, and this is the ONLY authoritative source of the
  action ids "access-card create/update" accept as policy keys.
  ACTION ID IS THE KEY, copied verbatim. A key that names no real action still
  saves — it simply matches nothing, so the card denies what you meant to allow
  and nothing reports the typo.
  Use --json to read each action's parameter names before writing a policy.
  THE ACTIONS DEPEND ON THE CREDENTIAL'S SOURCE, AND ARE NOT ALWAYS THE TOOL'S
  API OPERATIONS. Some credentials expose only INFRASTRUCTURAL actions — a
  single "use this in deployments" entry with no parameters, rather than the
  per-operation list you would expect. A short, oddly-shaped list is that, not
  a truncated response: whatever it returns is the complete set of keys a
  policy on this credential can name.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.credentials.cards.availableActions(opts.credentialId);
        const actions = result.actions ?? result;

        printList(actions, undefined, [
          { key: "actionId", label: "ACTION ID", width: 30 },
          { key: "name", label: "NAME", width: 30 },
          { key: "description", label: "DESCRIPTION", width: 40 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
