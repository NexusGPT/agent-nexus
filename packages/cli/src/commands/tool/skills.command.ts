import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printEnvelope, printTable } from "../../output";
import {
  TOOL_DISCOVERY_SKILLS__PARAMS_TYPE,
  TOOL_DISCOVERY_SKILLS_CONTRACT
} from "../tool.contract.generated";

/** `nexus tool skills` — the tools exposed as agent skills. */
export function registerToolSkillsCommand(tool: Command, program: Command): void {
  const skills = tool
    .command("skills")
    .description("List organization skills (workflows, tasks, collections)")
    // A SHORTER list than `tool search --type`, and the contract says so: the
    // skills route accepts the three org-owned kinds, the search route every
    // marketplace kind. Neither is a narrowing declared here.
    .addOption(enumOption("--type <type>", "Filter by type", TOOL_DISCOVERY_SKILLS__PARAMS_TYPE))
    .option("--search <query>", "Search by name")
    .option("--limit <number>", "Max results", parseInt)
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool skills
  $ nexus tool skills --type WORKFLOW --search "onboarding"
  $ nexus tool skills --json

Notes:
  THIS LISTS YOUR ORGANIZATION'S OWN SKILLS, NOT MARKETPLACE TOOLS. Despite
  sitting under "tool", it returns the workflows, AI tasks and collections your
  organization has built — the things you attach to an agent alongside a
  marketplace tool. It lives here because that is the catalogue an agent picks
  from. For marketplace tools use "nexus tool search".

  --json ANSWERS THE ROUTE'S OWN OBJECT: {skills, total}. The rows are under
  .skills — jq '.[]' selects nothing — and .total is how many exist against how
  many --limit returned.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tools.skills({
          type: opts.type,
          search: opts.search,
          limit: opts.limit
        });
        const skills = result.skills ?? [];
        printEnvelope(result, () => {
          printTable(skills, [
            { key: "id", label: "ID", width: 36 },
            { key: "name", label: "NAME", width: 30 },
            { key: "type", label: "TYPE", width: 14 },
            { key: "description", label: "DESCRIPTION", width: 40 }
          ]);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(skills, TOOL_DISCOVERY_SKILLS_CONTRACT);
}
