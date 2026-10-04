import type { CreateBranchBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../../util/body";

/** `nexus workflow branch create` */
export function registerWorkflowBranchCreateCommand(branch: Command, program: Command): void {
  branch
    .command("create")
    .description("Create a branch on a node")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .requiredOption("--name <name>", "Branch name")
    // NOT "(conditions, etc.)": `CreateBranchBodySchema` takes name and
    // description only, and a `conditions` array is stripped by the parse — the
    // shipped description advertised a field the endpoint drops.
    .option("--body <json-or-file-or-->", "Additional body JSON (description)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow branch create 11111111-1111-4111-8111-111111111111 node-456 --name "Has email"
  $ nexus workflow branch create 11111111-1111-4111-8111-111111111111 node-456 --name "VIP" --body '{"description":"Tier is vip"}'

Notes:
  ONLY name AND description ARE ACCEPTED. A "conditions" array in --body is
  SILENTLY DROPPED — the branch is created with an EMPTY condition set, which
  matches nothing, and the 200 looks identical to a configured one.
  Set the conditions afterwards on the NODE:
  "nexus workflow node update <wf> <node> --body '{"data":{"logic":[…]}}'",
  using the logic entry this command created for the branch. That entry is
  {branchId, id, operator: "and" | "or", conditions: []}, and a condition is:

    {"id":"<any>","operator":"equals","value":"vip",
     "field":{"id":"<upstream-node>.tier","label":"Tier","type":"string"}}

  🚨 field IS AN OBJECT, NEVER A STRING. A bare string, an object missing
  id or label, and an unrecognised type are all 400 VALIDATION_ERROR at every
  write door now. Write one of string|number|boolean|object|array|null. A
  malformed field already stored on the node is passed through unchanged so an
  unrelated edit is not refused — "nexus workflow validate <wf>" reports that
  one as a critical error.
  Answers the new branch, including the br-NNN id an edge's --source-handle needs.
  The branch reaches nothing until an edge leaves it, and an unreached branch is a
  silent dead end at run time.
  BRANCHES DO NOT MAKE THE NODE VALID. A branching node has its own required
  field, data.instructions, and no number of branches fills it: with the branches
  created and wired, validate still refuses to publish because instructions is
  not configured. Set it with
  "nexus workflow node update <wf> <node> --body '{"data":{"instructions":"…"}}'".`
    )
    .action(async (wfId: string, nodeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const extra = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(extra, { name: opts.name });
        const result = await client.workflows.createBranch(
          wfId,
          nodeId,
          asRequestBody<CreateBranchBody>(body)
        );
        printRecord(result, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
