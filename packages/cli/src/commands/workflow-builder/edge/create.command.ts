import type { CreateEdgeBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../../util/body";
import { WORKFLOW_EDGE_CREATE_CONTRACT } from "../../workflow.contract.generated";

/** `nexus workflow edge create` */
export function registerWorkflowEdgeCreateCommand(edge: Command, program: Command): void {
  const edgeCreate = edge
    .command("create")
    .description("Create an edge between two nodes")
    .argument("<wf-id>", "Workflow ID")
    .requiredOption("--source <node-id>", "Source node ID")
    .requiredOption("--target <node-id>", "Target node ID")
    .option("--source-handle <handle>", "Source handle identifier")
    .option("--body <json-or-file-or-->", "Additional body JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow edge create 11111111-1111-4111-8111-111111111111 --source node-1 --target node-2
  $ nexus workflow edge create 11111111-1111-4111-8111-111111111111 --source node-1 --target node-2 --source-handle br-001
  $ nexus workflow edge create 11111111-1111-4111-8111-111111111111 --source node-2 --target node-1 --body '{"type":"rewind"}'

Notes:
  type is "main" (the default) or "rewind", the edge that sends a doWhile body
  back to its start. There is no third value: anything else is a 400.
  --source-handle IS REQUIRED WHEN THE SOURCE IS A branching NODE and must equal
  an existing branch id from "nexus workflow branch list" — otherwise 400
  EDGE_INVALID_SOURCE_HANDLE. It must never be "input".
  FAN-IN IS ALLOWED: several edges may target one node. What is refused is a
  self-loop (EDGE_SELF_LOOP), a duplicate of an existing edge with the same handle
  (EDGE_DUPLICATE), the reverse of an existing edge (EDGE_BIDIRECTIONAL_CYCLE, it
  would deadlock), an unknown endpoint (EDGE_NODES_NOT_FOUND) and an edge crossing
  a loop boundary (EDGE_SCOPE_VIOLATION) — source and target must share a parentId
  unless one of them IS the loop container.
  Creating an edge re-lays-out the graph, so node positions move.
  "branch delete" DELETES EDGES TOO. Removing a branch removes every edge using
  that branch id as its sourceHandle, in the same call, and nothing on the branch
  page enumerates them — the branch's whole downstream goes unwired. Re-read
  "workflow edge list" after any branch delete and re-wire what went.
  Answers 201 with the edge, whose id is what "edge delete" takes.`
    )
    .action(async (wfId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const extra = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(extra, {
          source: opts.source,
          target: opts.target,
          ...(opts.sourceHandle ? { sourceHandle: opts.sourceHandle } : {})
        });
        const result = await client.workflows.createEdge(wfId, asRequestBody<CreateEdgeBody>(body));
        printRecord(result, [
          { key: "id", label: "ID" },
          { key: "source", label: "Source" },
          { key: "target", label: "Target" },
          { key: "sourceHandle", label: "Source Handle" },
          { key: "type", label: "Type" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // `--source`, `--target` and `--source-handle` have flags; `type` does not,
  // and `--body` is the documented way to set it — the Examples above show
  // exactly that (`--body '{"type":"rewind"}'`). So it is body-only by design
  // rather than by omission, and the reason says which.
  bindCommand(edgeCreate, WORKFLOW_EDGE_CREATE_CONTRACT, {
    "Body.type": '--body only; the Examples show --body \'{"type":"rewind"}\''
  });
}
