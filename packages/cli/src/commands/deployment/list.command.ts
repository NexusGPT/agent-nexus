import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError, refuse } from "../../errors";
import { printList } from "../../output";
import { getPaginationParams } from "../../util/pagination";
import {
  DEPLOYMENT_LIST__PARAMS_TYPE,
  DEPLOYMENT_LIST_CONTRACT
} from "../deployment.contract.generated";
import { CASE_INSENSITIVE, upperCase } from "./_shared/case-insensitive";
import { LIST_NOTES } from "./copy/list-notes";

/** `nexus deployment list` */
export function registerDeploymentListCommand(deployment: Command, program: Command): void {
  const list = deployment
    .command("list")
    .description("List deployments")
    .option("--search <query>", "Search by name")
    .addOption(
      enumOption(
        "--type <type>",
        "Filter by deployment type",
        DEPLOYMENT_LIST__PARAMS_TYPE,
        CASE_INSENSITIVE,
        upperCase
      )
    )
    .option("--active", "Show only active deployments")
    .option("--agent-id <id>", "Only deployments serving this agent (UUID)")
    // Declared here rather than through addPaginationOptions so the cap can be
    // stated: the server bounds limit at 1-100 and 400s outside it, which the
    // shared helper's "Items per page" cannot say without claiming the same
    // bound for every other namespace that calls it.
    .option("--page <number>", "Page number (default 1)", parseInt)
    .option("--limit <number>", "Items per page — 1-100, default 20", parseInt)
    .addHelpText("after", LIST_NOTES)
    .action(async (opts) => {
      // `--agent-id "$UNSET"` arrives as "". The API reads an empty `agentId` as
      // "no filter", like every optional query id, so sending it would list EVERY
      // agent's deployments to a caller who meant one.
      if (typeof opts.agentId === "string" && opts.agentId.trim() === "") {
        process.exitCode = refuse(
          "--agent-id is empty.",
          "Pass an agent id, or omit --agent-id to list every agent's deployments."
        );
        return;
      }
      try {
        const client = createClient(program.optsWithGlobals());
        const { data, meta } = await client.deployments.list({
          ...getPaginationParams(opts),
          search: opts.search,
          type: opts.type,
          isActive: opts.active ? true : undefined,
          agentId: opts.agentId
        });

        printList(data, meta, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 25 },
          { key: "type", label: "TYPE", width: 15 },
          { key: "isActive", label: "ACTIVE", width: 8, format: (v) => (v ? "yes" : "no") },
          { key: "agentId", label: "AGENT ID", width: 36 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists and after the hand-written prose, so
  // the generated reference lands below the Notes rather than above them.
  bindCommand(list, DEPLOYMENT_LIST_CONTRACT);
}
