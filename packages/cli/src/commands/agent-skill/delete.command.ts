import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";

/** `nexus agent-skill delete` */
export function registerAgentSkillDeleteCommand(skill: Command, program: Command): Command {
  const leaf = confirmable(skill.command("delete"))
    .description("Remove a skill from an agent")
    .argument("<agent-id>", "Agent ID")
    .argument("<skill-id>", "Skill ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-skill delete 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus agent-skill delete 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --yes

Notes:
  THE FILES GO WITH IT. There is no archive and no undo — re-attach means
  uploading the bundle again, so run 'nexus agent-skill download' first if the
  ZIP is not also kept somewhere else.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  This is one of the reads-stay-open routes: it works on an agent that has since
  been moved off a code-interpreter model.`
    )
    .action(async (agentId: string, skillId: string, opts: { yes?: boolean }) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (
          !(await confirmDestructive(
            `Remove skill ${skillId} from agent ${agentId}? This deletes its files.`,
            opts
          ))
        )
          return;

        await client.agents.skills.delete(agentId, skillId);
        printSuccess("Skill removed.", { id: skillId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
