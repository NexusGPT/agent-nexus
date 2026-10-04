import type { Command } from "commander";

import { createClient } from "../../client";
import { enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { addPaginationOptions, getPaginationParams } from "../../util/pagination";
import { AGENT_LIST__PARAMS_STATUS } from "../agent.contract.generated";

/** `nexus agent list` */
export function registerAgentListCommand(agent: Command, program: Command): Command {
  const list = addPaginationOptions(
    agent
      .command("list")
      .description("List agents")
      .addOption(enumOption("--status <status>", "Filter by status", AGENT_LIST__PARAMS_STATUS))
      .option("--search <query>", "Search by name or role")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus agent list
  $ nexus agent list --limit 5 --status ACTIVE
  $ nexus agent list --search "support" --json

Notes:
  Results are paginated. Use --page/--limit. Check meta.paging in --json output.
  --page defaults to 1 and --limit to 20. A --limit above 100 is REFUSED with a
  400 rather than clamped, so a script asking for 500 receives no rows at all.
  --status takes ACTIVE or DRAFT — the public spelling of the internal
  PUBLISHED / DRAFT. An agent created through this API is ACTIVE.
  --search matches first name, last name and role, case-insensitively.
  THE TABLE PRINTS NO MODEL COLUMN, and the --json row carries only the legacy
  "model" enum — never modelConfig. Read the model actually in use with
  "nexus agent get <id>" → modelConfig.modelName.
  THE TABLE IS ID / FIRST NAME / LAST NAME / ROLE / STATUS, and that is the
  whole of it — no bio, no tags, no created date. FIRST NAME and LAST NAME are
  15 characters wide and ROLE is 25; a value longer than its column is cut and
  the cut is MARKED, so a cell without the marker is the whole value. Widths are
  display only — --json carries every field at full length.`
      )
  );

  list.action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.agents.list({
        ...getPaginationParams(opts),
        status: opts.status,
        search: opts.search
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "firstName", label: "FIRST NAME", width: 15 },
        { key: "lastName", label: "LAST NAME", width: 15 },
        { key: "role", label: "ROLE", width: 25 },
        { key: "status", label: "STATUS", width: 10 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  return list;
}
