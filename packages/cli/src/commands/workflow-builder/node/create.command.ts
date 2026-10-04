import type { CreateNodeBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../../util/body";

/** `nexus workflow node create` */
export function registerWorkflowNodeCreateCommand(node: Command, program: Command): void {
  node
    .command("create")
    .description("Create a node in a workflow")
    .argument("<wf-id>", "Workflow ID")
    .requiredOption("--type <type>", "Node type, from 'nexus workflow node-types'")
    .option("--body <json-or-file-or-->", "Additional body JSON (merged with --type)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node create 11111111-1111-4111-8111-111111111111 --type aiTask
  $ nexus workflow node create 11111111-1111-4111-8111-111111111111 --type branching --body '{"data":{"label":"Route by tier"}}'
  $ nexus workflow node create 11111111-1111-4111-8111-111111111111 --type aiTask --body '{"parentId":"<loop-node-id>"}'

Notes:
  --body TAKES THREE FORMS: inline JSON, a path ending in .json, or "-" to read
  stdin. THIS COMMAND READS THE FILE BEFORE THE ACTION RUNS, because --type is a
  required flag and the pre-action check has to know which fields --body already
  supplies. So a missing .json file fails at parse time here, where on a command
  whose only required flag IS --body it fails in the action instead.
  --type must be a REGISTERED type — read them with "nexus workflow node-types".
  An unknown one is 400 NODE_TYPE_INVALID naming that endpoint.
  parentId (in --body) IS THE ONLY WAY TO PUT A NODE INSIDE A LOOP. It takes the
  loop or doWhile node's id; anything else is refused. There is no move-into-loop
  operation other than this and "node update --body '{"parentId":…}'".
  position is auto-computed when omitted — the whole graph is re-laid-out on every
  node write, so hand-set coordinates do not survive as given.
  data is MERGED over the node type's defaults, so you only send what differs.
  THE GHOST-REFERENCE GUARD COVERS STRUCTURED FIELDS ONLY. A {{ref}} to a node
  that does not exist is refused with 400 VARIABLE_REFERENCE_MALFORMED when it
  sits in a parameter setup, a variable array or a customScript input — but a
  {{ghost.field}} inside a TEXT field (instructions, message, jsonString,
  expression, a prompt) is not scanned and is stored verbatim at 201. "node get",
  "workflow overview" and PUBLISH all pass it. "nexus workflow validate" is the
  only command that names it, so run validate before publishing or the reference
  reaches run time and resolves to nothing.
  A customScript ARRIVES WITH A PLACEHOLDER FUNCTION BODY AND COUNTS AS
  UNCONFIGURED. "workflow get" shows real-looking code in data.code while
  "overview" and "validate" report the node incomplete with missingFields
  ["code"] — the completeness check recognises the default stub specifically, so
  the two are not in conflict. Replace data.code with your own function through
  "node update"; nothing else clears it.
  Creating a loop or doWhile ALSO creates its start child, returned as children[].
  loopStart, doWhileStart and selectTrigger cannot be created directly; install a
  trigger with "nexus workflow trigger" instead.
  A TRIGGER TYPE IS REFUSED HERE WITH 409 NODE_DUPLICATE_TRIGGER while the
  workflow's trigger slot is taken — and a new workflow's slot is taken from
  birth, by the selectTrigger placeholder it is created with. A trigger REPLACES
  that node ("nexus workflow trigger <wf-id> --type <type>"); it is never added
  beside it. The refusal names the occupant.
  Answers 201 with {id, type, configStatus} — configStatus is shape only.`
    )
    .action(async (wfId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const extra = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(extra, { type: opts.type });
        const result = await client.workflows.createNode(wfId, asRequestBody<CreateNodeBody>(body));
        printRecord(result, [
          { key: "id", label: "ID" },
          { key: "type", label: "Type" },
          { key: "configStatus", label: "Config" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
