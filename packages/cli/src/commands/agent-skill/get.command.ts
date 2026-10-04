import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/** `nexus agent-skill get` */
export function registerAgentSkillGetCommand(skill: Command, program: Command): Command {
  const leaf = skill
    .command("get")
    .description("Show one skill's details")
    .argument("<agent-id>", "Agent ID")
    .argument("<skill-id>", "Skill ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-skill get 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus agent-skill get 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --json

Notes:
  THIS IS METADATA ONLY — the same fields the 'list' row already carries. It
  reads NOTHING out of the bundle: no file list, no SKILL.md text, no
  frontmatter. To see what the skill actually instructs the agent to do, run
  'nexus agent-skill download <agent-id> <skill-id>' and open the ZIP.`
    )
    .action(async (agentId: string, skillId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.agents.skills.get(agentId, skillId);
        printRecord(result, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "fileCount", label: "Files" },
          { key: "sizeBytes", label: "Size" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
