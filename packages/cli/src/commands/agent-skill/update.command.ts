import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError, refuse } from "../../errors";
import { printSuccess } from "../../output";

/** `nexus agent-skill update` */
export function registerAgentSkillUpdateCommand(skill: Command, program: Command): Command {
  const leaf = skill
    .command("update")
    .description("Rename a skill or change its description")
    .argument("<agent-id>", "Agent ID")
    .argument("<skill-id>", "Skill ID")
    .option("--name <name>", "New skill name")
    .option("--description <text>", "New description")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-skill update 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --name invoice-parser-v2
  $ nexus agent-skill update 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --description "Parse supplier invoices"

Notes:
  THIS TOUCHES METADATA ONLY. The bundle is not re-read and SKILL.md is not
  rewritten — renaming a skill here does NOT rename it inside the ZIP, so the
  agent still sees whatever the packaged SKILL.md says. Use
  'nexus agent-skill upload' to change files.
  --name obeys the same rule as create; the rejection is the identical message.
  Send at least one of --name or --description, or the command refuses locally
  before any request.
  This is a WRITE route: it needs the agent to be on a code-interpreter model,
  unlike list, get, download and delete.`
    )
    .action(
      async (agentId: string, skillId: string, opts: { name?: string; description?: string }) => {
        try {
          if (opts.name === undefined && opts.description === undefined) {
            process.exitCode = refuse("Provide --name and/or --description.");
            return;
          }
          const client = createClient(program.optsWithGlobals());
          const updated = await client.agents.skills.update(agentId, skillId, {
            ...(opts.name !== undefined ? { name: opts.name } : {}),
            ...(opts.description !== undefined ? { description: opts.description } : {})
          });
          printSuccess("Skill updated.", { id: updated.id, name: updated.name });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  return leaf;
}
