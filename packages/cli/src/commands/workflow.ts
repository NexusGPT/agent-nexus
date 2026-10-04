import { Command } from "commander";

import { registerWorkflowBatchCommand } from "./workflow/batch.command";
import { registerWorkflowCreateCommand } from "./workflow/create.command";
import { registerWorkflowDeleteCommand } from "./workflow/delete.command";
import { registerWorkflowDuplicateCommand } from "./workflow/duplicate.command";
import { registerWorkflowGetCommand } from "./workflow/get.command";
import { registerWorkflowListCommand } from "./workflow/list.command";
import { registerWorkflowPublishCommand } from "./workflow/publish.command";
import { registerWorkflowTestCommand } from "./workflow/test.command";
import { registerWorkflowTestNodeCommand } from "./workflow/test-node.command";
import { registerWorkflowUnpublishCommand } from "./workflow/unpublish.command";
import { registerWorkflowUpdateCommand } from "./workflow/update.command";
import { registerWorkflowUploadIconCommand } from "./workflow/upload-icon.command";
import { registerWorkflowValidateCommand } from "./workflow/validate.command";
import { registerWorkflowBuilderCommands } from "./workflow-builder";

export function registerWorkflowCommands(program: Command): void {
  const workflow = program.command("workflow").description("Manage workflows");

  workflow.addHelpText(
    "after",
    `
Lifecycle: DRAFT --(validate + publish)--> PUBLISHED --(unpublish)--> DRAFT, and
"workflow delete" moves it to ARCHIVED. A workflow must be PUBLISHED before an
agent can use it as a tool.

Two facts that decide whether a build works:
  • DELETING A LOOP DELETES ITS BODY. "workflow node delete" on a loop or doWhile
    removes every node inside it, and every edge touching any of them, and the
    200 ENUMERATES WHAT WENT: deletedNodeIds, deletedEdgeIds, and severedNodeIds
    for the survivors that lost an edge.
  • A GREEN configStatus PROVES SHAPE ONLY. "workflow overview" reports complete
    once a node's own required fields are filled — not that its inputs are wired,
    that {{upstream.field}} resolves, or that any value is right. Use
    "workflow validate" for the graph and variable checks. An outputNode with an
    empty data.instructions now reports incomplete rather than complete — it is
    the only field it reads and it emits "" without one — but that is advisory:
    publish is not refused for it.

PUBLISH DOES NOT RUN "workflow validate", AND THAT IS THE GAP THAT BITES. Publish
checks required fields, parameter setups and the outputNode's outputType — it
does NOT check variable references. A {{ghost.field}} written into a TEXT field
(a node's instructions, message or prompt) is stored at 201, survives "node
get", "overview" and publish, and resolves to nothing at run time. "workflow
validate" is the ONLY command that reports it. Run validate before every
publish; nothing runs it for you.

THE API'S NAMED ERROR CODES DO REACH THIS CLI — BRANCH ON THE CODE, NOT THE
MESSAGE. Every refusal below (EDGE_SELF_LOOP, EDGE_DUPLICATE, BRANCH_NOT_FOUND,
NODE_IS_TRIGGER, WORKFLOW_ALREADY_PUBLISHED and the rest) carries a
machine-readable code on the HTTP response, and this CLI passes that code
through unchanged. Under --json the payload is {"error":{"message","hint","code"}}
— all three keys ALWAYS present, hint null when there is none — and without
--json the code is printed dim in brackets after the message.
A code is always there; it is not always one of the names above. A refusal the
API sent without one falls back to HTTP_<status>, and a CLI_ prefix means the
failure never reached the server at all (bad arguments, a timeout, a dropped
connection). So treat an unrecognised code as "not a case I handle" rather than
falling back to matching the message, which is prose and gets rewritten. Call
the route through "nexus api" when you need a response field this document does
not carry.`
  );

  registerWorkflowListCommand(workflow, program);
  registerWorkflowGetCommand(workflow, program);
  registerWorkflowCreateCommand(workflow, program);
  registerWorkflowUpdateCommand(workflow, program);
  registerWorkflowDeleteCommand(workflow, program);
  registerWorkflowDuplicateCommand(workflow, program);
  registerWorkflowPublishCommand(workflow, program);
  registerWorkflowUnpublishCommand(workflow, program);
  registerWorkflowValidateCommand(workflow, program);
  registerWorkflowTestCommand(workflow, program);
  registerWorkflowTestNodeCommand(workflow, program);
  registerWorkflowBatchCommand(workflow, program);
  registerWorkflowUploadIconCommand(workflow, program);

  // ── builder sub-commands (nodes, edges, branches) ────────────────────
  // `workflow trigger` lives there and binds itself to
  // `WorkflowNodeReplaceTrigger`, so the ledger entry for this namespace names
  // both descriptors.
  registerWorkflowBuilderCommands(workflow, program);
}
