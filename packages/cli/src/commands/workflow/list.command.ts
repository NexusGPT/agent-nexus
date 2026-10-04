import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { formatFolder, printList } from "../../output";
import { addPaginationOptions, getPaginationParams } from "../../util/pagination";
import {
  WORKFLOW_LIST__PARAMS_STATUS,
  WORKFLOW_LIST_CONTRACT
} from "../workflow.contract.generated";
import { WORKFLOW_LIST_HELP } from "./copy/list-help";

/** `nexus workflow list` — one row per workflow. */
export function registerWorkflowListCommand(workflow: Command, program: Command): void {
  const workflowList = addPaginationOptions(
    workflow
      .command("list")
      .description("List workflows")
      .addOption(enumOption("--status <status>", "Filter by status", WORKFLOW_LIST__PARAMS_STATUS))
      .option("--search <query>", "Search by name")
      .option("--folder <name|id>", "Filter by folder name or id")
      .addHelpText("after", WORKFLOW_LIST_HELP)
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.workflows.list({
        ...getPaginationParams(opts),
        status: opts.status,
        search: opts.search,
        folder: opts.folder
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "name", label: "NAME", width: 30 },
        { key: "status", label: "STATUS", width: 12 },
        { key: "folder", label: "FOLDER", width: 20, format: formatFolder },
        { key: "createdAt", label: "CREATED", width: 20 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // Bound LAST, after every option and after the hand-written prose.
  bindCommand(workflowList, WORKFLOW_LIST_CONTRACT);
}
