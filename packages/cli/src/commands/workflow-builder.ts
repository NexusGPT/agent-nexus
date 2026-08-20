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
import { judgeNodeTest, reportNodeTestRefusal } from "../node-test-verdict";
import { isJsonMode, printList, printRecord, printSuccess, printWarning } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody, resolveRequiredBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import {
  WORKFLOW_EDGE_CREATE_CONTRACT,
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
  $ nexus workflow node get 11111111-1111-4111-8111-111111111111 node-456
  $ nexus workflow node get 11111111-1111-4111-8111-111111111111 node-456 --json

Notes:
  THE VERIFICATION READ for every node write, and the required step between the
  two halves of configuring a plugin node (set the action, read it back, then set
  the credential).
  --json is ONE FLAT OBJECT — the node's own fields at the top level, with no
  {data, meta} envelope, no {success} wrapper and no "node" key to unwrap.
  🚨 THE CONFIGURATION IS ONE LEVEL DOWN, UNDER "data". The top level carries
  id, type, configStatus, missingFields, errors and data; everything you SET on
  the node is inside data. So it is .data.label, NOT .label — and the same for
  instructions, code, message and every other node field. jq reading the
  shallow path finds nothing and prints null, which reads as an empty field
  rather than as a wrong path:

    $ nexus workflow node get 11111111-1111-4111-8111-111111111111 node-456 --json | jq '{configStatus, label: .data.label}'

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
  $ nexus workflow node update 11111111-1111-4111-8111-111111111111 node-456 --body '{"data":{"label":"Summarize"}}'
  $ nexus workflow node update 11111111-1111-4111-8111-111111111111 node-456 --body '{"parentId":"<loop-node-id>"}'
  $ nexus workflow node update 11111111-1111-4111-8111-111111111111 node-456 --body '{"parentId":null}'
  $ nexus workflow node update 11111111-1111-4111-8111-111111111111 node-456 --body config.json
  $ echo '{"data":{"key":"val"}}' | nexus workflow node update 11111111-1111-4111-8111-111111111111 node-456 --body -

Notes:
  ONLY data AND parentId ARE WRITABLE, AND THE BODY MUST CARRY ONE OF THEM. A
  body naming neither is a 400, so --body '{"label":"NOPE"}' is refused outright
  rather than accepted as a no-op. The silent drop applies only ALONGSIDE a real
  field: send data AND a top-level "label" and the label goes without comment
  while the data lands.
  A TOP-LEVEL "type" IS THE ONE EXCEPTION — IT IS REFUSED BY NAME, WITH OR
  WITHOUT data. A node's type is fixed when it is created. To change the
  workflow's trigger use "nexus workflow trigger <wf-id> --type <triggerType>",
  which replaces the trigger node and reconnects its edges; any other node's type
  is changed by creating the replacement and deleting the old one.
  parentId MOVES THE NODE'S LOOP SCOPE: an id puts it inside that loop, null takes
  it out, and omitting it leaves the scope alone. A cycle, or a loopStart /
  doWhileStart / trigger node, is refused.
  data is MERGED into the stored data, so send only what changes. THE MERGE IS
  RECURSIVE, so this holds INSIDE a nested map too: writing one entry of
  parametersSetup, or one parameter of an agentInputTrigger, leaves the other
  entries alone instead of replacing the map.
  TO REMOVE A NESTED ENTRY, SEND IT AS null:
  --body '{"data":{"parametersSetup":{"city":null}}}' drops "city" and keeps the
  rest. A null at the TOP level of data stores null instead, because several node
  types read a top-level key that is present-and-null differently from an absent
  one. An ARRAY always replaces wholesale, at every depth — send it complete.
  A PARTIAL WRITE IS REFUSED WHEN THE STORED VALUE CANNOT BE MERGED: if the key
  you are writing into holds a string or an array on the stored node rather than
  an object, the call fails and NOTHING is written, so the drifted value is left
  intact for you to read with "workflow node get" and send back whole.
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
  confirmable(node.command("delete"))
    .description("Delete a node from a workflow")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node delete 11111111-1111-4111-8111-111111111111 node-456
  $ nexus workflow node delete 11111111-1111-4111-8111-111111111111 node-456 --yes

Notes:
  DELETING A LOOP OR doWhile DELETES EVERY NODE INSIDE IT, and every node inside
  a loop nested in that one. The whole body goes in one call.
  EVERY EDGE TOUCHING A DELETED NODE GOES TOO — INCLUDING THE CONTAINER'S OWN
  INBOUND AND OUTBOUND EDGES, which connect nodes OUTSIDE it. Those nodes stay
  but are left unconnected, and validate will report them as DISCONNECTED_NODE.
  THE OUTPUT IS THE ONLY ACCOUNT OF WHAT WENT, and it is a server response, not
  a CLI confirmation: the verdict line counts the casualties and
  deletedNodeIds / deletedEdgeIds name them, on both channels. severedNodeIds is
  the third list and the one you act on — the SURVIVING nodes an edge was taken
  from, i.e. the repair list; a warning on stderr repeats it. Nothing else
  reports the cascade; before this existed the only way to see it was to diff
  "nexus workflow get" before and after.
  A TRIGGER CANNOT BE DELETED: 403 NODE_TRIGGER_DELETE_FORBIDDEN. Replace it with
  "nexus workflow trigger <wf-id> --type <triggerType>".
  THE ONE EXCEPTION REPAIRS A DAMAGED GRAPH: a trigger-typed node CAN be deleted
  while another REAL trigger remains. That covers a workflow left holding two
  triggers — it runs only the first and silently skips the rest, and "nexus
  workflow validate" names the extras as graphIssues MULTIPLE_TRIGGERS — and a
  stale selectTrigger placeholder left beside a real trigger, which blocks test
  and publish forever. The 403 returns the moment the last real trigger is what
  you are deleting. Both still read deletable:false; that field records the node
  type, not this repair path.
  A loopStart / doWhileStart cannot be deleted either (400) — delete its parent
  loop, which takes the start node with it.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (wfId: string, nodeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete node ${nodeId} from workflow ${wfId}?`, opts)))
          return;

        const result = await client.workflows.deleteNode(wfId, nodeId);

        // A server that has not shipped the enumeration yet answers 204, and the
        // transport synthesizes `{}` for an empty body — so these three arrays
        // are typed present and CAN be absent across a version skew, which is
        // the one direction a published CLI cannot control. Reading `.length`
        // off `undefined` would throw AFTER the delete already happened, which
        // reads as a failed command and invites a retry of a destructive call.
        // Printing zeroes instead would be the exact lie this command was fixed
        // for, so the fallback says the server did not report rather than
        // reporting nothing removed.
        if (!Array.isArray(result.deletedNodeIds)) {
          printSuccess("Node deleted.", { workflowId: wfId, nodeId });
          printWarning(
            "This server did not report what the deletion removed.",
            "Deleting a loop or doWhile takes its whole body and the edges either side of it.",
            `Check with "nexus workflow get ${wfId}".`
          );
          return;
        }

        // The enumeration is carried out rather than dropped: one call on a loop
        // removes its whole body and the edges either side of it, and this used
        // to print a fixed "Node deleted." over a 204 with nothing in it
        // (NEX-4047) — the same defect `asset delete` had with objectRemoved.
        //
        // The counts live in the MESSAGE, which `printSuccess` carries into the
        // JSON document too, so no `deletedNodes` key restates what
        // `deletedNodeIds.length` already answers. The ids themselves are printed
        // on both channels rather than only under --json: this is a one-shot
        // destructive command, the nodes are gone by the time it prints, and a
        // human asking "what did I just lose?" has no second place to look.
        printSuccess(
          `Deleted ${result.deletedNodeIds.length} node(s) and ${result.deletedEdgeIds.length} edge(s).`,
          {
            workflowId: wfId,
            nodeId,
            deletedNodeIds: result.deletedNodeIds,
            deletedEdgeIds: result.deletedEdgeIds,
            severedNodeIds: result.severedNodeIds
          }
        );

        if (result.severedNodeIds.length > 0) {
          // STDERR, exit code stays 0 — the deletion succeeded. This is the half
          // of the damage that is NOT in the deleted lists: nodes that are still
          // there and just lost a connection, which is what leaves the graph
          // severed rather than merely shortened.
          printWarning(
            `${result.severedNodeIds.length} surviving node(s) lost an edge to this deletion and are now unconnected on that side.`,
            `Severed: ${result.severedNodeIds.join(", ")}`,
            'Re-wire them with "nexus workflow edge create", or check the damage with "nexus workflow validate".'
          );
        }
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
Examples:
  $ nexus workflow node test 11111111-1111-4111-8111-111111111111 node-456
  $ nexus workflow node test 11111111-1111-4111-8111-111111111111 node-456 --body '{"input":{"human-node-id":{"rasp_note":"X"}}}'
  $ nexus workflow node test 11111111-1111-4111-8111-111111111111 node-456 --body '{"input":{"human":{"decision":"CANCEL"}}}'
  $ nexus workflow node test 11111111-1111-4111-8111-111111111111 node-456 --body '{"input":{"name":"Acme","website":"acme.com"}}'

Notes:
  THIS RUNS THE NODE FOR REAL against live systems — there is no dry mode.
  Mock data is nested under "input" and keyed by upstream node ID OR the input
  variable name (e.g. a customScript input's variableName). Each value becomes
  the mocked output of that upstream node. Unknown keys are rejected with 400.
  Without mocks, each {{upstream.field}} resolves from that upstream node's LAST
  TEST RESULT, so an untested upstream contributes nothing and a green result
  proves only that the node did not crash. Mocking is how you make the input
  deterministic.
  It WRITES BACK this node's testExecutionId and inferred outputFormat — that is
  what lets downstream nodes see this node's shape, and it overwrites the previous
  test's pointer. Mock data itself is never persisted.
  A FAILED RUN WRITES BACK NOTHING BUT testExecutionId. status is "FAILED" and the
  error envelope is in data; outputFormat and runOutput keep whatever the last
  SUCCESSFUL test left, so a broken run never becomes this node's contract.
  runOutput IS NOT KEPT ON MOST NODES, AND A null THERE IS NOT A FAILED TEST. The
  test result is stored only for an agentInputTrigger, a humanInput or a
  newsMonitorTrigger; on every other node type — customScript, aiTask, plugin —
  the snapshot is stripped before the graph is saved, so "workflow get" shows
  runOutput null right after a green test. testExecutionId is the pointer that
  survives; read the actual output from this command's own response.
  A trigger node is refused with 400 NODE_IS_TRIGGER; use "nexus workflow test".
  The returned executionId is a per-node test id, so "nexus execution get" on it
  fails — the output is already in this response.
  THE EXIT CODE CARRIES THE NODE'S OUTCOME, NOT status. status reads COMPLETED for
  a run whose node threw, so the outcome is read from data instead: a node that
  failed exits non-zero and its error is in data.errorDetails. A node type that
  runs in the background answers status PENDING with data null — nothing was
  measured, so that exits non-zero under the UNMEASURED category, which is
  neither a pass nor a failure. Identical to "nexus workflow test-node", which is
  the same endpoint.`
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
        // The SAME judgement as `workflow test-node`, from the same module. Two
        // spellings of one operation cannot disagree about whether the node
        // passed — see `node-test-verdict.ts`.
        const verdict = judgeNodeTest(result);
        if (verdict.outcome === "passed") {
          printRecord(result);
        } else {
          // 🚨 UNDER --json A FAILURE IS THE ERROR DOCUMENT AND NOTHING ELSE.
          // Printing the record first takes stdout, and `emitDocument`'s
          // first-wins rule then diverts the refusal to stderr — so a consumer
          // reading stdout sees a payload and never learns the node failed.
          // `json-one-document.scan.ts` calls that `error-masked` and it is a
          // defect, not a trade-off. In prose the record is the only place
          // `data.errorDetails` is visible, so a human still gets it.
          if (!isJsonMode()) printRecord(result);
          process.exitCode = reportNodeTestRefusal(verdict);
        }
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
  $ nexus workflow node variables 11111111-1111-4111-8111-111111111111 node-456
  $ nexus workflow node variables 11111111-1111-4111-8111-111111111111 node-456 --json

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
  $ nexus workflow node output-format 11111111-1111-4111-8111-111111111111 node-456
  $ nexus workflow node output-format 11111111-1111-4111-8111-111111111111 node-456 --json

Notes:
  Answers {schema, source}, and SOURCE IS THE FIELD THAT MATTERS.
  source "manual" — the node's stored outputFormat, which a test run writes from
  the real output. This is a schema you can trust.
  source "nodeType" — NOTHING HAS RUN; you are reading the node TYPE's own
  declaration. Where the type declares what it emits — cueNode's five keys, a
  loop's array, a trigger's payload — that schema is real and can be wired before
  the first run. Where it declares nothing you get {"type":"object"}, which proves
  nothing about what this node will actually emit, and a downstream node tested
  against it runs on schema defaults.
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
Examples:
  $ nexus workflow node test-payload 11111111-1111-4111-8111-111111111111 node-456
  $ nexus workflow node test-payload 11111111-1111-4111-8111-111111111111 node-456 --json

Notes:
  Returns the test + production webhook URLs (available pre-publish) and the last
  payload a test event delivered. Fire a test event at the testWebhookUrl, then
  run this again to read it back.
  The node id must be a webhookTrigger. Read it from "nexus workflow overview" or
  "nexus workflow get" — the same two URLs also appear under "node get".`
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
  $ nexus workflow node reload-props 11111111-1111-4111-8111-111111111111 node-456 --body '{"configuredProps":{"account":"acc-1"}}'
  $ nexus workflow node reload-props 11111111-1111-4111-8111-111111111111 node-456 --body props.json

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

  // ── edge delete ────────────────────────────────────────────────────────
  confirmable(edge.command("delete"))
    .description("Delete an edge from a workflow")
    .argument("<wf-id>", "Workflow ID")
    .argument("<edge-id>", "Edge ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow edge delete 11111111-1111-4111-8111-111111111111 edge-789
  $ nexus workflow edge delete 11111111-1111-4111-8111-111111111111 edge-789 --yes

Notes:
  <edge-id> is NOT a UUID by rule — edges drawn on the canvas carry ids like
  "xy-edge__<source>-<target>". Read the exact id from "nexus workflow get".
  The API answers 204 with an empty body; this command prints its own
  {success, workflowId, edgeId} line, so --json is a CLI confirmation and never a
  server response. The nodes survive; only the connection goes, so the target may
  become a DISCONNECTED_NODE in validate.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (wfId: string, edgeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete edge ${edgeId} from workflow ${wfId}?`, opts)))
          return;

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
  $ nexus workflow branch list 11111111-1111-4111-8111-111111111111 node-456
  $ nexus workflow branch list 11111111-1111-4111-8111-111111111111 node-456 --json

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
  $ nexus workflow branch update 11111111-1111-4111-8111-111111111111 node-456 br-001 --body '{"name":"Renamed"}'
  $ nexus workflow branch update 11111111-1111-4111-8111-111111111111 node-456 br-001 --body branch.json

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
  confirmable(branch.command("delete"))
    .description("Delete a branch from a node")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .argument("<branch-id>", "Branch ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow branch delete 11111111-1111-4111-8111-111111111111 node-456 br-001
  $ nexus workflow branch delete 11111111-1111-4111-8111-111111111111 node-456 br-001 --yes

Notes:
  IT TAKES THREE THINGS, NOT ONE: the branch, its logic entry (the conditions), and
  EVERY EDGE that used this branch as its sourceHandle. Whatever those edges led to
  is now unreachable from this node and validate will report it as a
  DISCONNECTED_NODE.
  The API answers 204 with an empty body; this command prints its own
  {success, workflowId, nodeId, branchId} line, so --json is a CLI confirmation
  and never a server response.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (wfId: string, nodeId: string, branchId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete branch ${branchId} from node ${nodeId}?`, opts)))
          return;

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
  directly; trigger types are installed with "nexus workflow trigger", and
  "node create --type <anyTrigger>" answers 409 while the trigger slot is taken.
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
  A FIELD WITH A CLOSED SET OF LEGAL VALUES CARRIES 'values', and a write of
  anything else is refused with 400 NODE_FIELD_VALUE_INVALID. Read 'values', not
  'type' — 'type' is prose, and it can name FEWER values than the server accepts.
  The empty string is always accepted: it means the field is not configured yet.
  A field with NO 'values' is not value-checked at all, which is not the same as
  saying any value works.
  Read the configuration steps before configuring a plugin node: the order is
  load-bearing, and doing it out of order is accepted and produces nothing.
  MOST TYPES ALSO CARRY A 'guide' — a Markdown page written from live runs, saying
  which type to pick over which, a configuration that actually RUNS, and the writes
  the platform accepts and then fails at run time. It prints below the schema here
  and is the 'guide' string under --json. A type with no guide yet omits the key.`
    )
    .action(async (type: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getNodeTypeSchema(type);

        // --json must carry the WHOLE document, guide included: splitting the
        // rendering must never split the payload. `printRecord` short-circuits
        // to `emitDocument` under --json, so handing it `result` untouched is
        // what keeps the two channels in agreement.
        if (isJsonMode()) {
          printRecord(result);
          return;
        }

        // A guide is 4-13 KB of Markdown with its own newlines, and
        // `printRecord` pads a label then prints the value on one line — so as a
        // record field it would wreck the alignment of every row after it. It is
        // the same object either way; only where it is drawn differs.
        const { guide, ...schema } = result;
        printRecord(schema);

        if (guide !== undefined) {
          console.log(`\n${guide}`);
        }
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
Examples:
  $ nexus workflow platform-listener-events
  $ nexus workflow platform-listener-events --json
  $ nexus workflow platform-listener-events --json | jq '.events[] | select(.eventType=="conversation.idle")'

Notes:
  Use the eventType as 'platformEventType' on a platformListenerTrigger node.
  THE TABLE PRINTS 3 OF THE 6 FIELDS A ROW CARRIES. eventType, category and label
  are the columns; description, filterFields and samplePayload are --json only,
  and they are the three you actually need to author a subscription.
  filterFields enumerates the valid keys and operators for the trigger's
  filters.conditions[], so a filtered subscription needs no source reading.
  samplePayload mirrors what the workflow receives at fire time.
  THIS LISTING IS ALREADY FILTERED. Events marked comingSoon are dropped
  server-side and never appear, because subscribing to one that emits nothing
  would fail silently at run time rather than at subscribe time.`
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
  $ nexus workflow overview 11111111-1111-4111-8111-111111111111
  $ nexus workflow overview 11111111-1111-4111-8111-111111111111 --json

Notes:
  A SHAPE REPORT, NOT A READINESS REPORT. configStatus "complete" means the node's
  own required fields are filled. It says nothing about whether its inputs are
  wired, whether {{upstream.field}} resolves, or whether any value is correct.
  A webhookTrigger, an agentInputTrigger and a loopStart have no required fields
  at all, so they ALWAYS report complete. An outputNode used to be in that list;
  it now reports missingFields ["instructions"] when that field is empty, because
  it is the only field the node reads and it emits "" without one. Advisory only —
  publish is not refused for it.
  readyToTest / readyToPublish here are derived from configStatus and the trigger
  COUNT alone — both go false on a workflow holding more than one trigger, since a
  run starts from one of them and skips the rest, and readyToPublish also wants
  exactly one. "nexus workflow validate" computes the same two flags with the graph
  and variable checks included, so its answer is the one to trust before publishing.
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
  $ nexus workflow layout 11111111-1111-4111-8111-111111111111

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
  $ nexus workflow trigger 11111111-1111-4111-8111-111111111111 --type webhookTrigger
  $ nexus workflow trigger 11111111-1111-4111-8111-111111111111 --type scheduleTrigger
  $ nexus workflow trigger 11111111-1111-4111-8111-111111111111 --type platformListenerTrigger

Notes:
  THIS COMMAND IS TYPE-ONLY, IN TWO STEPS. It replaces the trigger node and takes
  NOTHING else: a --body carrying data, parameters, runOutput, cron or
  platformEventType is a 400 "Unrecognized key". Set the trigger's configuration
  afterwards with
  "nexus workflow node update <wf-id> <trigger-node-id> --body '{"data":{…}}'".
  REPLACE IS HOW YOU DELETE A TRIGGER — "node delete" refuses one with a 403.
  A response still showing type "selectTrigger" means nothing was installed.
  THE NEW TRIGGER'S ID IS AT .node.id, NOT AT THE TOP LEVEL. The response is
  {node, reconnectedEdges} — node is the whole node record, and reconnectedEdges
  is every edge re-pointed at the new trigger, always present and often empty.
  Step two below needs .node.id, so take it from here rather than going back to
  "workflow get".
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
  // `--source`, `--target` and `--source-handle` have flags; `type` does not,
  // and `--body` is the documented way to set it — the Examples above show
  // exactly that (`--body '{"type":"rewind"}'`). So it is body-only by design
  // rather than by omission, and the reason says which.
  bindCommand(edgeCreate, WORKFLOW_EDGE_CREATE_CONTRACT, {
    "Body.type": '--body only; the Examples show --body \'{"type":"rewind"}\''
  });
}
