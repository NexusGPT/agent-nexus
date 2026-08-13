import type {
  CreateBranchBody,
  CreateEdgeBody,
  CreateNodeBody,
  ReloadPropsBody,
  ReplaceTriggerBody,
  TestNodeBody,
  UpdateBranchBody,
  UpdateNodeBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody, resolveRequiredBody } from "../util/body";
import {
  WORKFLOW_NODE_REPLACE_TRIGGER__BODY_TYPE,
  WORKFLOW_NODE_REPLACE_TRIGGER_CONTRACT
} from "./workflow.contract.generated";

/**
 * The trigger types, from the v1 contract rather than retyped.
 *
 * This was a hand-written tuple of six strings kept in step with the SDK union
 * by a `satisfies`. It agreed with the contract when it was written, which is
 * the only guarantee a hand-copy ever gives: the compile-time link caught the
 * SDK drifting and nothing caught the CONTRACT drifting.
 *
 * The annotation below does the same job in the same place — assigning the
 * generated values to the SDK union is a compile error the moment the two stop
 * agreeing — while the values themselves now come from one source.
 */
const TRIGGER_TYPES: readonly ReplaceTriggerBody["type"][] =
  WORKFLOW_NODE_REPLACE_TRIGGER__BODY_TYPE.contractValues;

export function registerWorkflowBuilderCommands(workflow: Command, program: Command): void {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Node sub-group
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const node = workflow.command("node").description("Manage workflow nodes");

  // ── node create ────────────────────────────────────────────────────────
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
  $ nexus workflow node create wf-123 --type aiTask
  $ nexus workflow node create wf-123 --type branching --body '{"data":{"label":"Route by tier"}}'
  $ nexus workflow node create wf-123 --type aiTask --body '{"parentId":"<loop-node-id>"}'
  $ nexus workflow node create wf-123 --type aiTask --body payload.json

Notes:
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

  // ── node get ───────────────────────────────────────────────────────────
  node
    .command("get")
    .description("Get node details")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node get wf-123 node-456
  $ nexus workflow node get wf-123 node-456 --json

Notes:
  THE VERIFICATION READ for every node write, and the required step between the
  two halves of configuring a plugin node (set the action, read it back, then set
  the credential).
  configStatus and missingFields say whether the node's OWN required fields are
  filled — not that its inputs resolve. deletable appears only when the node
  cannot be deleted, parentId only when it lives inside a loop.
  A webhookTrigger also reports its test and production URLs here.`
    )
    .action(async (wfId: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getNode(wfId, nodeId);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── node update ────────────────────────────────────────────────────────
  node
    .command("update")
    .description("Update node data/config")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .requiredOption("--body <json-or-file-or-->", "Node data/config JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node update wf-123 node-456 --body '{"data":{"label":"Summarize"}}'
  $ nexus workflow node update wf-123 node-456 --body '{"parentId":"<loop-node-id>"}'
  $ nexus workflow node update wf-123 node-456 --body '{"parentId":null}'
  $ nexus workflow node update wf-123 node-456 --body config.json
  $ echo '{"data":{"key":"val"}}' | nexus workflow node update wf-123 node-456 --body -

Notes:
  ONLY data AND parentId ARE WRITABLE, AND THE BODY MUST CARRY ONE OF THEM. A
  body naming neither is a 400, so --body '{"label":"NOPE"}' is refused outright
  rather than accepted as a no-op. The silent drop applies only ALONGSIDE a real
  field: send data AND a top-level "label" and the label goes without comment
  while the data lands.
  parentId MOVES THE NODE'S LOOP SCOPE: an id puts it inside that loop, null takes
  it out, and omitting it leaves the scope alone. A cycle, or a loopStart /
  doWhileStart / trigger node, is refused.
  data is MERGED into the stored data, so send only what changes.
  FIVE data FIELDS ARE READ-ONLY AND SILENTLY STRIPPED FROM YOUR WRITE:
  runOutput, testExecutionId, outputFormat, testWebhookUrl and the editor's own
  state. runOutput is the exception that matters — it IS writable, but only on an
  agentInputTrigger, a webhookTrigger or a humanInput node. On any other node,
  scheduleTrigger included, it is dropped and the 200 says nothing.
  Set trigger seed data on the trigger node here; "workflow trigger" refuses it.`
    )
    .action(async (wfId: string, nodeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveRequiredBody(opts.body);
        const result = await client.workflows.updateNode(
          wfId,
          nodeId,
          asRequestBody<UpdateNodeBody>(body)
        );
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── node delete ────────────────────────────────────────────────────────
  node
    .command("delete")
    .description("Delete a node from a workflow")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node delete wf-123 node-456
  $ nexus workflow node delete wf-123 node-456 --yes

Notes:
  DELETING A LOOP OR doWhile DELETES EVERY NODE INSIDE IT. The whole body goes,
  in one 204, and nothing in the response enumerates what went — read the body
  with "nexus workflow get" before you run this.
  EVERY EDGE TOUCHING A DELETED NODE GOES TOO, so the nodes either side are left
  unconnected and validate will report them as DISCONNECTED_NODE.
  A TRIGGER CANNOT BE DELETED: 403 NODE_TRIGGER_DELETE_FORBIDDEN. Replace it with
  "nexus workflow trigger <wf-id> --type <triggerType>".
  A loopStart / doWhileStart cannot be deleted either (400) — delete its parent
  loop, which takes the start node with it.
  The API answers 204 with an empty body; this command prints its own
  {success, workflowId, nodeId} line, so --json is a CLI confirmation and never a
  server response — there is nothing from the server to parse.
  THE PROMPT ONLY APPEARS ON A TTY. In a script, a pipeline or CI there is no
  confirmation and no --yes is needed.`
    )
    .action(async (wfId: string, nodeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          const answer = await rl.question(`Delete node ${nodeId} from workflow ${wfId}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.workflows.deleteNode(wfId, nodeId);
        printSuccess("Node deleted.", { workflowId: wfId, nodeId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── node test ──────────────────────────────────────────────────────────
  node
    .command("test")
    .description("Run a test execution of a single node")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .option(
      "--body <json-or-file-or-->",
      'Optional mock data: {"input":{"<upstreamNodeId|variableName>":<value>}} — replaces the node\'s resolved input'
    )
    .addHelpText(
      "after",
      `
Mock data is nested under "input" and keyed by upstream node ID OR the input
variable name (e.g. a customScript input's variableName). Each value becomes
the mocked output of that upstream node. Unknown keys are rejected with 400.

THIS RUNS THE NODE FOR REAL against live systems — there is no dry mode.

Without mocks, each {{upstream.field}} resolves from that upstream node's LAST
TEST RESULT, so an untested upstream contributes nothing and a green result
proves only that the node did not crash. Mocking is how you make the input
deterministic.

It WRITES BACK this node's testExecutionId and inferred outputFormat — that is
what lets downstream nodes see this node's shape, and it overwrites the previous
test's pointer. Mock data itself is never persisted.

runOutput IS NOT KEPT ON MOST NODES, AND A null THERE IS NOT A FAILED TEST. The
test result is stored only for an agentInputTrigger, a humanInput or a
newsMonitorTrigger; on every other node type — customScript, aiTask, plugin —
the snapshot is stripped before the graph is saved, so "workflow get" shows
runOutput null right after a green test. testExecutionId is the pointer that
survives; read the actual output from this command's own response.

A trigger node is refused with 400 NODE_IS_TRIGGER; use "nexus workflow test".
The returned executionId is a per-node test id, so "nexus execution get" on it
fails — the output is already in this response.

Examples:
  $ nexus workflow node test wf-123 node-456
  $ nexus workflow node test wf-123 node-456 --body '{"input":{"human-node-id":{"rasp_note":"X"}}}'
  $ nexus workflow node test wf-123 node-456 --body '{"input":{"human":{"decision":"CANCEL"}}}'
  $ nexus workflow node test wf-123 node-456 --body '{"input":{"name":"Acme","website":"acme.com"}}'`
    )
    .action(async (wfId: string, nodeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // `--body` is genuinely optional here (`node test` with no mock data is
        // a documented invocation), and every field of `TestNodeBody` is
        // optional, so `{}` is a usable value of the right type rather than an
        // invented one. The wire delta is an empty JSON object in place of no
        // body at all; the endpoint parses both to the same `{}`.
        const body = (await resolveBody(opts.body)) ?? {};
        const result = await client.workflows.testNode(
          wfId,
          nodeId,
          asRequestBody<TestNodeBody>(body)
        );
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── node variables ─────────────────────────────────────────────────────
  node
    .command("variables")
    .description("List available upstream variables for a node")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node variables wf-123 node-456
  $ nexus workflow node variables wf-123 node-456 --json

Notes:
  This is the list of {{…}} references this node may legally use: every node
  reachable backwards through the edges, with the fields each one exposes.
  A NODE WITH NO CHILDREN IN THIS LIST IS NOT A NODE WITH NO OUTPUT — it is one
  whose shape is unknown, because it has neither a declared outputFormat nor a
  stored test result. Test it first, then read this again.
  Inside a loop, the container exposes the PER-ITERATION item, and the reference
  path stays rooted at the loop node's id: the iterator name is a label only.`
    )
    .action(async (wfId: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getAvailableVariables(wfId, nodeId);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── node output-format ─────────────────────────────────────────────────
  node
    .command("output-format")
    .description("Show node output schema")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node output-format wf-123 node-456
  $ nexus workflow node output-format wf-123 node-456 --json

Notes:
  Answers {schema, source}, and SOURCE IS THE FIELD THAT MATTERS.
  source "manual" — the node's stored outputFormat, which a test run writes from
  the real output. This is a schema you can trust.
  source "nodeType" — NOTHING HAS RUN. You are reading the static per-type default
  ({"type":"object"} for most types), which proves nothing about what this node
  will actually emit. A downstream node tested against it runs on schema defaults.
  An outputNode has no output schema at all, so its schema is null.`
    )
    .action(async (wfId: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getOutputFormat(wfId, nodeId);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── node test-payload ──────────────────────────────────────────────────
  node
    .command("test-payload")
    .description("Get a webhook trigger's URLs and the last received test payload")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Webhook trigger node ID")
    .addHelpText(
      "after",
      `
Returns the test + production webhook URLs (available pre-publish) and the last
payload a test event delivered. Fire a test event at the testWebhookUrl, then
run this again to read it back.

Examples:
  $ nexus workflow node test-payload wf-123 node-456
  $ nexus workflow node test-payload wf-123 node-456 --json`
    )
    .action(async (wfId: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getWebhookTestPayload(wfId, nodeId);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── node reload-props ──────────────────────────────────────────────────
  node
    .command("reload-props")
    .description("Reload dynamic props for a Pipedream node")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .requiredOption("--body <json-or-file-or-->", "Configured props JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node reload-props wf-123 node-456 --body '{"configuredProps":{"account":"acc-1"}}'
  $ nexus workflow node reload-props wf-123 node-456 --body props.json

Notes:
  For Pipedream plugin nodes only. Some props only exist once an earlier prop is
  chosen (pick a spreadsheet, then its sheets appear) — this asks the provider for
  the next set, given what is configured so far.
  Send the props you have already chosen in configuredProps; dynamicPropsId chains
  a second reload onto the first reload's answer.`
    )
    .action(async (wfId: string, nodeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveRequiredBody(opts.body);
        const result = await client.workflows.reloadProps(
          wfId,
          nodeId,
          asRequestBody<ReloadPropsBody>(body)
        );
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Edge sub-group
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const edge = workflow
    .command("edge")
    .description("Manage workflow edges (connections between nodes)");

  // ── edge create ────────────────────────────────────────────────────────
  edge
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
  $ nexus workflow edge create wf-123 --source node-1 --target node-2
  $ nexus workflow edge create wf-123 --source node-1 --target node-2 --source-handle br-001
  $ nexus workflow edge create wf-123 --source node-2 --target node-1 --body '{"type":"rewind"}'

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

  // ── edge delete ────────────────────────────────────────────────────────
  edge
    .command("delete")
    .description("Delete an edge from a workflow")
    .argument("<wf-id>", "Workflow ID")
    .argument("<edge-id>", "Edge ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow edge delete wf-123 edge-789
  $ nexus workflow edge delete wf-123 edge-789 --yes

Notes:
  <edge-id> is NOT a UUID by rule — edges drawn on the canvas carry ids like
  "xy-edge__<source>-<target>". Read the exact id from "nexus workflow get".
  The API answers 204 with an empty body; this command prints its own
  {success, workflowId, edgeId} line, so --json is a CLI confirmation and never a
  server response. The nodes survive; only the connection goes, so the target may
  become a DISCONNECTED_NODE in validate.
  THE PROMPT ONLY APPEARS ON A TTY. In a script, a pipeline or CI there is no
  confirmation and no --yes is needed.`
    )
    .action(async (wfId: string, edgeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          const answer = await rl.question(`Delete edge ${edgeId} from workflow ${wfId}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.workflows.deleteEdge(wfId, edgeId);
        printSuccess("Edge deleted.", { workflowId: wfId, edgeId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Branch sub-group
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const branch = workflow
    .command("branch")
    .description("Manage branches on condition/router nodes");

  // ── branch list ────────────────────────────────────────────────────────
  branch
    .command("list")
    .description("List branches on a node")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow branch list wf-123 node-456
  $ nexus workflow branch list wf-123 node-456 --json

Notes:
  Branch operations only work on a "branching" node — anything else is 400
  BRANCH_NODE_NOT_BRANCHING.
  READ IDS FROM HERE, ALWAYS, AND RE-READ THEM AFTER EVERY DELETE. A branch id is
  assigned as br-001, br-002 … from the branch COUNT at creation time, so ids are
  reused: delete br-002 from three branches and the next create is handed br-003
  again, which the surviving br-003 already answers to. An id you held across a
  delete now addresses a different branch, and every command accepts it happily.
  Track branches by NAME through this command and look the id up each time you
  need one. An edge's --source-handle must equal an id this command reports.
  NEXT STEP is the branch's own pointer and is null until an edge leaves the branch.`
    )
    .action(async (wfId: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { branches } = await client.workflows.listBranches(wfId, nodeId);
        printList(branches, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "description", label: "DESCRIPTION", width: 40 },
          { key: "nextStep", label: "NEXT STEP", width: 36 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── branch create ──────────────────────────────────────────────────────
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
  $ nexus workflow branch create wf-123 node-456 --name "Has email"
  $ nexus workflow branch create wf-123 node-456 --name "VIP" --body '{"description":"Tier is vip"}'

Notes:
  ONLY name AND description ARE ACCEPTED. A "conditions" array in --body is
  SILENTLY DROPPED — the branch is created with an EMPTY condition set, which
  matches nothing, and the 200 looks identical to a configured one.
  Set the conditions afterwards on the NODE:
  "nexus workflow node update <wf> <node> --body '{"data":{"logic":[…]}}'",
  using the logic entry this command created for the branch.
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

  // ── branch update ──────────────────────────────────────────────────────
  branch
    .command("update")
    .description("Update a branch")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .argument("<branch-id>", "Branch ID")
    // See `branch create`: conditions are not writable through this endpoint.
    .requiredOption("--body <json-or-file-or-->", "Updated branch JSON (name, description)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow branch update wf-123 node-456 br-001 --body '{"name":"Renamed"}'
  $ nexus workflow branch update wf-123 node-456 br-001 --body branch.json

Notes:
  RENAMES ONLY. name and description are the whole writable surface; a "conditions"
  array is silently dropped here exactly as on create. Conditions live in the
  node's data.logic — change them with "nexus workflow node update".
  <branch-id> is the br-NNN id from "nexus workflow branch list". An unknown one
  is 404 BRANCH_NOT_FOUND; a node that is not a branching node is a 400.`
    )
    .action(async (wfId: string, nodeId: string, branchId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveRequiredBody(opts.body);
        const result = await client.workflows.updateBranch(
          wfId,
          nodeId,
          branchId,
          asRequestBody<UpdateBranchBody>(body)
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

  // ── branch delete ──────────────────────────────────────────────────────
  branch
    .command("delete")
    .description("Delete a branch from a node")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .argument("<branch-id>", "Branch ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow branch delete wf-123 node-456 br-001
  $ nexus workflow branch delete wf-123 node-456 br-001 --yes

Notes:
  IT TAKES THREE THINGS, NOT ONE: the branch, its logic entry (the conditions), and
  EVERY EDGE that used this branch as its sourceHandle. Whatever those edges led to
  is now unreachable from this node and validate will report it as a
  DISCONNECTED_NODE.
  The API answers 204 with an empty body; this command prints its own
  {success, workflowId, nodeId, branchId} line, so --json is a CLI confirmation
  and never a server response.
  THE PROMPT ONLY APPEARS ON A TTY. In a script, a pipeline or CI there is no
  confirmation and no --yes is needed.`
    )
    .action(async (wfId: string, nodeId: string, branchId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          const answer = await rl.question(`Delete branch ${branchId} from node ${nodeId}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.workflows.deleteBranch(wfId, nodeId, branchId);
        printSuccess("Branch deleted.", { workflowId: wfId, nodeId, branchId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Top-level workflow builder commands
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ── node-types ─────────────────────────────────────────────────────────
  workflow
    .command("node-types")
    .description("List available node types")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node-types
  $ nexus workflow node-types --json

Notes:
  THE AUTHORITATIVE LIST for "node create --type" and for a batch node's "type".
  Names are camelCase and specific — aiTask, branching, loop, doWhile, customScript,
  plugin, outputNode, humanInput — never the generic "action", "condition" or "llm".
  loopStart, doWhileStart and selectTrigger appear here but cannot be created
  directly; trigger types are installed with "nexus workflow trigger".
  Read one type's full schema, including its required fields and connection rules,
  with "nexus workflow node-type <type>".`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.listNodeTypes();
        const types = result;
        printList(types, undefined, [
          { key: "type", label: "TYPE", width: 30 },
          { key: "category", label: "CATEGORY", width: 20 },
          { key: "label", label: "LABEL", width: 30 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── node-type ──────────────────────────────────────────────────────────
  workflow
    .command("node-type")
    .description("Get full schema for a node type")
    .argument("<type>", "Node type identifier")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node-type aiTask
  $ nexus workflow node-type branching --json

Notes:
  Carries the type's fields with their defaults, its configuration steps in ORDER,
  and its connection rules (how many inputs and outputs it takes, whether it can
  live inside a loop, what children it creates).
  Read the configuration steps before configuring a plugin node: the order is
  load-bearing, and doing it out of order is accepted and produces nothing.`
    )
    .action(async (type: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getNodeTypeSchema(type);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── platform-listener-events ──────────────────────────────────────────
  workflow
    .command("platform-listener-events")
    .description("List event types a platformListenerTrigger can subscribe to")
    .addHelpText(
      "after",
      `
Each entry carries an event key, label, category, description, and a
samplePayload showing what the workflow receives when the event fires.
Use the event key as 'platformEventType' on a platformListenerTrigger node.

Examples:
  $ nexus workflow platform-listener-events
  $ nexus workflow platform-listener-events --json
  $ nexus workflow platform-listener-events --json | jq '.events[] | select(.eventType=="conversation.idle")'`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.listPlatformListenerEvents();
        printList(result.events, undefined, [
          { key: "eventType", label: "EVENT", width: 36 },
          { key: "category", label: "CATEGORY", width: 18 },
          { key: "label", label: "LABEL", width: 36 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── overview ───────────────────────────────────────────────────────────
  workflow
    .command("overview")
    .description("Get high-level workflow overview with per-node config status")
    .argument("<wf-id>", "Workflow ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow overview wf-123
  $ nexus workflow overview wf-123 --json

Notes:
  A SHAPE REPORT, NOT A READINESS REPORT. configStatus "complete" means the node's
  own required fields are filled. It says nothing about whether its inputs are
  wired, whether {{upstream.field}} resolves, or whether any value is correct.
  An outputNode, a webhookTrigger, an agentInputTrigger and a loopStart have no
  required fields at all, so they ALWAYS report complete.
  readyToTest / readyToPublish here are derived from configStatus alone —
  "nexus workflow validate" computes the same two flags with the graph and variable
  checks included, so its answer is the one to trust before publishing.
  missingFields per node is what to fix; nodeCount / edgeCount are the totals.`
    )
    .action(async (wfId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getOverview(wfId);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── layout ─────────────────────────────────────────────────────────────
  workflow
    .command("layout")
    .description("Auto-position nodes in a workflow")
    .argument("<wf-id>", "Workflow ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow layout wf-123

Notes:
  Cosmetic only — it rewrites node positions and touches nothing else.
  You rarely need it: every node, edge, branch and batch write re-lays-out the
  graph already, which is also why hand-set positions do not persist as given.`
    )
    .action(async (wfId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.workflows.layout(wfId);
        printSuccess("Workflow layout applied.", { workflowId: wfId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── trigger ────────────────────────────────────────────────────────────
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
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow trigger wf-123 --type webhookTrigger
  $ nexus workflow trigger wf-123 --type scheduleTrigger
  $ nexus workflow trigger wf-123 --type platformListenerTrigger

Notes:
  THIS COMMAND IS TYPE-ONLY, IN TWO STEPS. It replaces the trigger node and takes
  NOTHING else: a --body carrying data, parameters, runOutput, cron or
  platformEventType is a 400 "Unrecognized key". Set the trigger's configuration
  afterwards with
  "nexus workflow node update <wf-id> <trigger-node-id> --body '{"data":{…}}'".
  REPLACE IS HOW YOU DELETE A TRIGGER — "node delete" refuses one with a 403.
  A response still showing type "selectTrigger" means nothing was installed.
  FOR AN agentInputTrigger, STEP TWO IS data.parameters AND IT IS LOAD-BEARING
  THREE TIMES OVER:
    $ nexus workflow node update <wf-id> <trigger-node-id> \\
        --body '{"data":{"parameters":{"city":{"type":"string","handler":"prompt"}}}}'
  That one write is what makes "workflow test --input" resolve, what publish
  derives the workflow's agentInputSchema from, and what an "agent-tool create
  --type WORKFLOW" schema is then checked against. Skip it and the trigger
  installs cleanly, the workflow publishes, and it accepts no parameters at all.
  A platformListenerTrigger needs its platformEventType from
  "nexus workflow platform-listener-events", set in step two.
  newsMonitorTrigger is deliberately absent: it needs provider configuration only
  the dashboard performs.`
    )
    .action(async (wfId: string, opts: { type: string; body?: string }) => {
      try {
        // Commander refuses anything outside the contract list before this runs,
        // so this narrow is what makes the assertion below honest rather than a
        // second gate: `TRIGGER_TYPES` is annotated as the SDK union, so a value
        // that survives the check is a member of it.
        if (!(TRIGGER_TYPES as readonly string[]).includes(opts.type)) {
          throw new Error(
            `--type must be one of: ${TRIGGER_TYPES.join(", ")} (got '${opts.type}')`
          );
        }
        const triggerType = opts.type as ReplaceTriggerBody["type"];
        const client = createClient(program.optsWithGlobals());
        const extra = await resolveBody(opts.body);
        // Narrow at the SDK boundary: `type` is runtime-validated above,
        // and `--body` may carry trigger-specific config the SDK type
        // intentionally elides. mergeBodyWithFlags returns a generic Record.
        const body = mergeBodyWithFlags(extra, {
          type: triggerType
        }) as unknown as ReplaceTriggerBody;
        const result = await client.workflows.replaceTrigger(wfId, body);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and after the hand-written prose.
  bindCommand(replaceTrigger, WORKFLOW_NODE_REPLACE_TRIGGER_CONTRACT);
}
