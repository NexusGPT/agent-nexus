import type { ExecutionSummary, ListExecutionsParams, PageResponse } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { addPaginationOptions, getPaginationParams } from "../../util/pagination";
import {
  WORKFLOW_EXECUTION_LIST__PARAMS_ORDER,
  WORKFLOW_EXECUTION_LIST__PARAMS_SORT_BY,
  WORKFLOW_EXECUTION_LIST__PARAMS_STATUS,
  WORKFLOW_EXECUTION_LIST_CONTRACT
} from "../execution.contract.generated";
import { EXECUTION_LIST_HELP } from "./copy/list-help";

// `--workflow-id` switches `list` to `WorkflowExecutionListForWorkflow`, which
// carries the SAME three enums and differs only by taking the workflow id in
// the path. One leaf, one shape: the default route binds and the twin is
// recorded `route-twin-bound-elsewhere`, exactly as `channel setup` is.

/** `nexus execution list` — runs, newest first, loop passes hidden by default. */
export function registerExecutionListCommand(execution: Command, program: Command): void {
  const list = addPaginationOptions(
    execution
      .command("list")
      .description("List workflow executions")
      .option("--workflow-id <id>", "Filter by workflow ID")
      .addOption(
        enumOption("--status <status>", "Filter by status", WORKFLOW_EXECUTION_LIST__PARAMS_STATUS)
      )
      .addOption(
        enumOption("--sort-by <field>", "Sort by field", WORKFLOW_EXECUTION_LIST__PARAMS_SORT_BY)
      )
      .addOption(enumOption("--order <dir>", "Sort order", WORKFLOW_EXECUTION_LIST__PARAMS_ORDER))
      .option(
        "--include-child-executions",
        "Also list loop / do-while body passes (one execution per iteration)"
      )
      .option("--include-test-runs", "Also list builder single-node test runs")
      .addHelpText("after", EXECUTION_LIST_HELP)
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      // Unset commander flags are `undefined`, which `appendQuery` drops — so an
      // ordinary `nexus execution list` sends neither scope parameter and gets
      // the server default (real runs only).
      const params: ListExecutionsParams = {
        ...getPaginationParams(opts),
        status: opts.status,
        sortBy: opts.sortBy,
        order: opts.order,
        includeChildExecutions: opts.includeChildExecutions,
        includeTestRuns: opts.includeTestRuns
      };
      // Typed, not `any`. An `any` row makes `Column.key` fall back to a bare
      // `string`, which is what let the STARTED column below name `createdAt`
      // — a field `ExecutionSummary` does not have — and render blank forever.
      const result: PageResponse<ExecutionSummary> = opts.workflowId
        ? await client.workflowExecutions.listByWorkflow(opts.workflowId, params)
        : await client.workflowExecutions.list(params);

      printList(result.data, result.meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "workflowId", label: "WORKFLOW", width: 36 },
        { key: "executionType", label: "TYPE", width: 15 },
        { key: "status", label: "STATUS", width: 12 },
        { key: "startedAt", label: "STARTED", width: 20 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  bindCommand(list, WORKFLOW_EXECUTION_LIST_CONTRACT);
}
