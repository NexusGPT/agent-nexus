import type { ReplaceTriggerBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import {
  WORKFLOW_NODE_REPLACE_TRIGGER__BODY_TYPE,
  WORKFLOW_NODE_REPLACE_TRIGGER_CONTRACT
} from "../workflow.contract.generated";
import { isTriggerType, TRIGGER_TYPES } from "./_shared/trigger-types";
import { TRIGGER_NOTES } from "./copy/trigger-notes";

/** `nexus workflow trigger` */
export function registerWorkflowTriggerCommand(workflow: Command, program: Command): void {
  const replaceTrigger = workflow
    .command("trigger")
    .description("Replace the trigger node of a workflow")
    .argument("<wf-id>", "Workflow ID")
    .addOption(
      enumOption(
        "--type <type>",
        "New trigger type",
        WORKFLOW_NODE_REPLACE_TRIGGER__BODY_TYPE
      ).makeOptionMandatory()
    )
    .option("--body <json-or-file-or-->", "Additional body JSON")
    .addHelpText("after", TRIGGER_NOTES)
    .action(async (wfId: string, opts: { type: string; body?: string }) => {
      try {
        // Commander refuses anything outside the contract list before this runs,
        // so this narrow is a second gate rather than the only one: `TRIGGER_TYPES`
        // is annotated as the SDK union, so a value that survives the check is a
        // member of it.
        if (!isTriggerType(opts.type)) {
          throw new Error(
            `--type must be one of: ${TRIGGER_TYPES.join(", ")} (got '${opts.type}')`
          );
        }
        // An ANNOTATED binding, not an assertion. `opts.type` is `ApiTriggerType`
        // by control flow after the guard, so the compiler checks this line;
        // delete the guard and it stops compiling. It is redundant to the naked
        // eye and it is the thing that binds the runtime narrow to the type.
        const triggerType: ReplaceTriggerBody["type"] = opts.type;
        const client = createClient(program.optsWithGlobals());
        const extra = await resolveBody(opts.body);
        // `--body` is operator JSON that nothing here can narrow, so it crosses
        // into a typed SDK argument at `asRequestBody` — the ONE named boundary
        // for that crossing, which every other call in this file already uses.
        // Spelling the same double cast inline is what that helper exists to
        // stop: it reads as a local shortcut instead of as the one door.
        const body = asRequestBody<ReplaceTriggerBody>(
          mergeBodyWithFlags(extra, { type: triggerType })
        );
        const result = await client.workflows.replaceTrigger(wfId, body);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and after the hand-written prose.
  bindCommand(replaceTrigger, WORKFLOW_NODE_REPLACE_TRIGGER_CONTRACT);
}
