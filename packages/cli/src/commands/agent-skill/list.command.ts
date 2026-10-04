import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { AGENT_SKILL_LIST_CONTRACT } from "../agent-skill.contract.generated";

/** `nexus agent-skill list` */
export function registerAgentSkillListCommand(skill: Command, program: Command): Command {
  const leaf = skill
    .command("list")
    .description("List the skills attached to an agent")
    .argument("<agent-id>", "Agent ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-skill list 11111111-1111-4111-8111-111111111111
  $ nexus agent-skill list 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE TWO TOTALS ARE ABOUT THE AGENT, NOT THE PAGE. totalCount and
  totalSizeBytes come back beside the rows and describe everything attached to
  this agent, so they are the figures to read when you care how much this agent
  is carrying rather than what one skill weighs.
  A row is id, name, description, fileCount, sizeBytes, createdAt and updatedAt;
  the table prints the first five and --json carries all seven. The ID column is
  what every other agent-skill verb takes — the NAME is display only.
  sizeBytes is the UNCOMPRESSED size of the bundle, not the ZIP's size on disk.`
    )
    .action(async (agentId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.agents.skills.list(agentId);
        printList(
          result.skills,
          { totalCount: result.totalCount, totalSizeBytes: result.totalSizeBytes },
          [
            { key: "id", label: "ID", width: 36 },
            { key: "name", label: "NAME", width: 24 },
            { key: "fileCount", label: "FILES", width: 7 },
            { key: "sizeBytes", label: "SIZE", width: 10 },
            { key: "description", label: "DESCRIPTION", width: 40 }
          ]
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, AGENT_SKILL_LIST_CONTRACT);
  return leaf;
}
