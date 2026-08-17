import fs from "node:fs";
import path from "node:path";

import type { BatchRequestBody, CreateWorkflowBody, UpdateWorkflowBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { dashboardUrlFor } from "../dashboard-url";
import { handleError, refuse } from "../errors";
import {
  color,
  formatFolder,
  isJsonMode,
  printDryRun,
  printList,
  printRecord,
  printSuccess
} from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { runFollow, shortTag } from "../util/run-follow";
import { parseSampleConfig } from "../util/sample-config";
import { buildTestNodeBody, buildTestWorkflowBody, parseInputFlag } from "../util/test-body";
import {
  WORKFLOW_BATCH_EXECUTE_CONTRACT,
  WORKFLOW_LIST__PARAMS_STATUS,
  WORKFLOW_LIST_CONTRACT
} from "./workflow.contract.generated";
import { registerWorkflowBuilderCommands } from "./workflow-builder";

/** Commander collector for repeatable options. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

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
    removes every node inside it, and every edge touching any of them, in one
    204. Nothing enumerates what went.
  • A GREEN configStatus PROVES SHAPE ONLY. "workflow overview" reports complete
    once a node's own required fields are filled — not that its inputs are wired,
    that {{upstream.field}} resolves, or that any value is right. Use
    "workflow validate" for the graph and variable checks, and remember an
    outputNode has no required fields, so it always reports complete.

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

  // ── list ──────────────────────────────────────────────────────────────
  const workflowList = addPaginationOptions(
    workflow
      .command("list")
      .description("List workflows")
      .addOption(enumOption("--status <status>", "Filter by status", WORKFLOW_LIST__PARAMS_STATUS))
      .option("--search <query>", "Search by name")
      .option("--folder <name|id>", "Filter by folder name or id")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus workflow list
  $ nexus workflow list --status PUBLISHED --limit 10
  $ nexus workflow list --search "onboarding" --json
  $ nexus workflow list --folder "Notion"

Notes:
  --page defaults to 1 and --limit to 20. A --limit above 100 is REFUSED with a
  400 rather than clamped.
  --status takes DRAFT, PUBLISHED or ARCHIVED. THE UNFILTERED LIST HIDES ARCHIVED
  — that is where "workflow delete" puts things, so a deleted workflow is still
  readable, but only with --status ARCHIVED.
  --folder accepts a folder id or its name, matched case-insensitively. A folder
  that matches nothing returns an empty list rather than ignoring the filter.
  Newest-updated first.
  --json IS {data: [...], meta: {total, page, hasMore}}, NOT A BARE ARRAY, and
  "nexus task list" — the other list you are most likely to read beside this
  one — IS a bare array. One parser cannot read both. Read meta.hasMore here
  rather than counting rows.`
      )
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

  // ── get ───────────────────────────────────────────────────────────────
  workflow
    .command("get")
    .description("Get workflow details")
    .argument("<id>", "Workflow ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow get 11111111-1111-4111-8111-111111111111
  $ nexus workflow get 11111111-1111-4111-8111-111111111111 --json

Notes:
  --json is ONE FLAT OBJECT — the workflow's own fields at the top level, no
  {data, meta} envelope and no {success} wrapper. It carries the whole graph:
  nodes, edges, publishedNodes, publishedEdges, agentInputSchema and the
  editor's data blob. The table shows six fields.
  🚨 A NODE'S CONFIGURATION IS ONE LEVEL DOWN, UNDER THE NODE'S OWN "data" KEY.
  A node object carries id, type and data — plus parentId inside a loop, and
  deletable only when it cannot be deleted. Everything you configured is inside
  data. So the label is .nodes[].data.label, NOT .nodes[].label, and the same
  holds for instructions, code, message and every other node field. jq reading
  the shallow path finds nothing and prints null, which reads as an empty label
  rather than as a wrong path:

    $ nexus workflow get 11111111-1111-4111-8111-111111111111 --json | jq '.nodes[] | {id, type, label: .data.label}'

  "data" THEREFORE MEANS TWO DIFFERENT THINGS ON THIS ONE DOCUMENT, and the
  next paragraph is about the OTHER one. .nodes[].data is the node's
  configuration and is always there; the workflow's own top-level .data is the
  canvas blob described below.
  data IS THE DASHBOARD EDITOR'S OWN BLOB AND IS null ON A WORKFLOW BUILT HERE.
  Only the canvas writes it, so its absence says nothing about the graph — nodes
  and edges are the graph. Never test data for emptiness to decide whether a
  workflow is built.
  publishedNodes / publishedEdges are the LAST-PUBLISHED SNAPSHOT and are null —
  not [] — until the first publish. Comparing them with nodes / edges is how you
  learn whether the live version still matches the draft you are editing, and it
  is the check to run right after "workflow publish": an edit made after a
  publish leaves the snapshot behind, with nothing reporting the drift.
  agentInputSchema is DERIVED from the agentInputTrigger node's parameters. It is
  read-only here and not writable through "workflow update".
  dashboardUrl IS ADDED BY THIS CLI AND IS NOT AN API FIELD. It is the canvas
  for this workflow, so nothing has to assemble a URL from a path pattern that
  can be renamed underneath it.`
    )
    .action(async (id: string) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const wf = await client.workflows.get(id);
        printRecord({ ...wf, dashboardUrl: dashboardUrlFor("workflow", wf.id, globals) }, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "status", label: "Status" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" },
          { key: "dashboardUrl", label: "Dashboard" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  workflow
    .command("create")
    .description("Create a new workflow")
    .requiredOption("--name <name>", "Workflow name")
    .option("--description <text>", "Workflow description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow create --name "Customer Onboarding"
  $ nexus workflow create --name "Data Pipeline" --description "ETL workflow"
  $ nexus workflow create --body '{"name":"Pipeline","description":"ETL"}'

Notes:
  --name is REQUIRED, is trimmed, and must be UNIQUE among the organization's
  non-archived workflows: a repeat is a 400, "A workflow with this name already
  exists". --description is capped at 1000 characters.
  THE NEW WORKFLOW IS NOT EMPTY AND HAS NO TRIGGER. It carries one non-deletable
  selectTrigger placeholder, which validate counts as no trigger at all. Turn it
  into a real one with "nexus workflow trigger <id> --type <triggerType>".
  THE PLACEHOLDER'S NODE ID IS NOT IN THIS RESPONSE, and every next step needs
  it. Follow every create with "nexus workflow get <id> --json" and read the
  node id out of .nodes before wiring anything — there is no way to derive it
  from the workflow id.
  Status is DRAFT. This command prints the id and the name; read the graph back
  with "workflow get".
  ARCHIVING IS THE ONLY DELETE. A workflow you create here cannot be destroyed
  later — see "nexus workflow delete --help" before you create a throwaway.
  dashboardUrl in the payload is the new workflow's canvas, added by this CLI
  rather than returned by the API — open it, or hand it to whoever asked.`
    )
    .action(async (opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description })
        });

        const wf = await client.workflows.create(asRequestBody<CreateWorkflowBody>(body));
        printSuccess("Workflow created.", {
          id: wf.id,
          name: wf.name,
          dashboardUrl: dashboardUrlFor("workflow", wf.id, globals)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  workflow
    .command("update")
    .description("Update a workflow")
    .argument("<id>", "Workflow ID")
    .option("--name <name>", "Workflow name")
    .option("--description <text>", "Workflow description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow update 11111111-1111-4111-8111-111111111111 --name "Renamed Workflow"
  $ nexus workflow update 11111111-1111-4111-8111-111111111111 --description "Updated description"
  $ nexus workflow update 11111111-1111-4111-8111-111111111111 --body '{"name":"Renamed"}'

Notes:
  ONLY name AND description ARE WRITABLE HERE, and the body is STRICT: nodes,
  edges, agentInputSchema, status or a typo is a 400 naming the key, never a
  silent strip. Change the graph with "workflow node/edge/branch" or
  "workflow batch"; agentInputSchema comes from the agentInputTrigger's
  parameters.
  A new --name is held to the same uniqueness rule as create.
  dashboardUrl in the payload is this workflow's canvas, added by this CLI
  rather than returned by the API.`
    )
    .action(async (id: string, opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description })
        });

        await client.workflows.update(id, asRequestBody<UpdateWorkflowBody>(body));
        printSuccess("Workflow updated.", {
          id,
          dashboardUrl: dashboardUrlFor("workflow", id, globals)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  confirmable(workflow.command("delete"))
    .description("Delete a workflow")
    .argument("<id>", "Workflow ID")
    .option("--dry-run", "Preview without deleting")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow delete 11111111-1111-4111-8111-111111111111
  $ nexus workflow delete 11111111-1111-4111-8111-111111111111 --yes
  $ nexus workflow delete 11111111-1111-4111-8111-111111111111 --dry-run

Notes:
  IT ARCHIVES, IT DOES NOT DESTROY. The workflow's status becomes ARCHIVED and
  EVERY TRIGGER IT DEPLOYED IS REMOVED — a live webhook or schedule stops firing
  the moment this returns. The graph itself survives and is still readable with
  "workflow list --status ARCHIVED" and "workflow get".
  ARCHIVING IS THE END OF THE ROAD. There is no hard delete here and no route
  behind one — an archived workflow is a permanent row. Running this again on an
  archived id re-archives it and reports success, which is not a second, harder
  delete. Every throwaway workflow you build is kept forever, so reuse one
  scratch workflow rather than creating a new one per experiment.
  The API answers 200 with {id, status: "ARCHIVED", archivedAt}; this command
  prints only the id, so read the archive back with "workflow get" if you need
  the timestamp.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  --dry-run only reads the workflow back and prints its name.
  It frees the name: uniqueness ignores archived workflows.
  It also releases any AI task the workflow was holding: an archived workflow no
  longer counts as a dependent, so a "task delete" that 409'd now succeeds.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (opts.dryRun) {
          const wf = await client.workflows.get(id);
          printDryRun(`Would delete workflow "${wf.name}" (${id})`, { id });
          return;
        }

        if (!(await confirmDestructive(`Delete workflow ${id}? This cannot be undone.`, opts)))
          return;

        await client.workflows.delete(id);
        printSuccess("Workflow deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── duplicate ─────────────────────────────────────────────────────────
  workflow
    .command("duplicate")
    .description("Duplicate a workflow")
    .argument("<id>", "Workflow ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow duplicate 11111111-1111-4111-8111-111111111111

Notes:
  EVERY NODE AND EDGE ID IS REGENERATED. The copy is a different graph with the
  same shape, so any id you held from the original addresses nothing in it — read
  the new ids from the response or "workflow get".
  The copy starts in DRAFT with no deployed triggers, so nothing fires until you
  publish it, and its transient test state (runOutput, loop test data) is stripped.
  It is named "<name> (copy)", numbered upward, so the uniqueness rule that
  create enforces never blocks a duplicate. Answers 201.
  dashboardUrl in the payload is THE COPY'S canvas, added by this CLI rather
  than returned by the API.`
    )
    .action(async (id: string) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const wf = await client.workflows.duplicate(id);
        printSuccess("Workflow duplicated.", {
          id: wf.id,
          name: wf.name,
          dashboardUrl: dashboardUrlFor("workflow", wf.id, globals)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── publish ───────────────────────────────────────────────────────────
  workflow
    .command("publish")
    .description("Publish a workflow")
    .argument("<id>", "Workflow ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow publish 11111111-1111-4111-8111-111111111111

Notes:
  Workflows must be PUBLISHED before they can be attached to agents as tools.
  Use "nexus workflow validate <id>" first to check for configuration errors.
  PUBLISHING TWICE IS A 409, NOT A REFRESH. An already-PUBLISHED workflow answers
  WORKFLOW_ALREADY_PUBLISHED, so after editing a node on a live workflow the only
  way to move the change into the live snapshot is unpublish, publish, then check
  that publishedNodes matches nodes in "workflow get".
  It validates the graph and DEPLOYS THE TRIGGERS: a webhook starts accepting
  production calls and a schedule starts firing as soon as this returns.
  VALIDATE PASSING DOES NOT GUARANTEE PUBLISH SUCCEEDS. Publish runs checks
  validate does not — an agentInput workflow's parameter names are validated
  here, and a bad one is a 400 naming the parameter and its schema errors.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.publish(id);
        printSuccess("Workflow published.", { ...result });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── unpublish ─────────────────────────────────────────────────────────
  workflow
    .command("unpublish")
    .description("Unpublish a workflow")
    .argument("<id>", "Workflow ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow unpublish 11111111-1111-4111-8111-111111111111

Notes:
  Back to DRAFT, and THE PRODUCTION TRIGGERS ARE DEACTIVATED — a live webhook or
  schedule stops firing, and agents holding this workflow as a tool stop being
  able to run it. It is a disabling, not a tidy-up.
  Unpublishing a workflow that is not published is a 409.
  This is the first half of the only refresh path: unpublish, then publish.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.unpublish(id);
        printSuccess("Workflow unpublished.", { ...result });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── validate ──────────────────────────────────────────────────────────
  workflow
    .command("validate")
    .description("Validate a workflow")
    .argument("<id>", "Workflow ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow validate 11111111-1111-4111-8111-111111111111
  $ nexus workflow validate 11111111-1111-4111-8111-111111111111 --json

Notes:
  Answers isValid, readyToTest, readyToPublish, hasCriticalErrors, errors[] with a
  severity, warnings[], nodeStatuses keyed by node id, graphIssues[] and
  variableIssues[]. Read readyToPublish, not isValid.
  WARNINGS DO NOT BLOCK. isValid is just "errors is empty"; a workflow with no
  trigger and no output node collects warnings only, and still publishes.
  graphIssues names the two structural faults: DISCONNECTED_NODE (no incoming
  edges) and ORPHANED_NODE (inside a loop with no connections at all, so it is
  invisible on the canvas and will never run).
  variableIssues names every {{node.field}} that no upstream node exposes, AND
  THIS IS THE ONLY COMMAND IN THE CLI THAT MAKES THAT CHECK. "node create",
  "node update", "node get", "workflow overview" and "workflow publish" all pass
  a workflow carrying an unresolvable reference in a text field. So a run of
  validate is not optional politeness before publish — it is the only thing
  standing between a ghost reference and run time.
  This is a READ. It changes nothing and never publishes.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const report = await client.workflows.validate(id);
        printRecord(report);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── test ──────────────────────────────────────────────────────────────
  workflow
    .command("test")
    .description("Run a test execution of a workflow")
    .argument("<id>", "Workflow ID")
    .option("--input <json>", "Trigger payload JSON for the test (fed to the trigger node)")
    .option(
      "--body <json>",
      "Request body as JSON, .json file, or '-' for stdin. A flat object is used as the trigger payload; { triggerData, sampleConfig } is used as-is"
    )
    .option("--follow", "Stream per-node progress as the execution runs")
    .option("--stream", "Alias for --follow")
    .option("--interval <ms>", "Follow polling interval in milliseconds (default: 1500)", "1500")
    .option(
      "--sample <n>",
      "Cap the --sample-node loop to at most N items for this test run (no workflow edit)"
    )
    .option("--sample-node <nodeId>", "The loop node id to cap (used with --sample)")
    .option(
      "--limit-array <nodeId=N>",
      "Cap a node's array to N items for this test run (repeatable)",
      collect,
      []
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow test 11111111-1111-4111-8111-111111111111 --input '{"message": "hello"}'
  $ nexus workflow test 11111111-1111-4111-8111-111111111111 --body '{"message": "hello"}'
  $ nexus workflow test 11111111-1111-4111-8111-111111111111 --follow
  $ nexus workflow test 11111111-1111-4111-8111-111111111111 --sample 5 --sample-node loop-abc --follow
  $ nexus workflow test 11111111-1111-4111-8111-111111111111 --limit-array loop-abc=5 --limit-array rows=10
  $ nexus workflow test 11111111-1111-4111-8111-111111111111 --json

Notes:
  A SUCCESSFUL TEST RUN IS A REAL RUN. Every node executes against live systems —
  emails send, rows are written, plugins charge. There is no dry mode; cap the
  expensive parts with --sample / --limit-array instead.
  WHERE --input LANDS DEPENDS ON THE TRIGGER TYPE, and getting it wrong resolves
  {{TRIGGER…}} to nothing rather than erroring:
    webhookTrigger      — wrapped as {body: <your input>}: {{TRIGGER.body.name}}
    agentInputTrigger   — used as the trigger's own output, so references are the
                          parameter names directly: {{TRIGGER.customer_email}}
    scheduleTrigger /
    manualTrigger       — takes no input at all
    newsMonitorTrigger  — your input, else the stored runOutput, else a synthesized
                          {events: […]} sample
  A WEBHOOK OR PLUGIN TRIGGER WITH NO INPUT IS REFUSED, not silently parked: 422
  TRIGGER_NOT_SYNC_TESTABLE. Pass --input, or put exampleData on the trigger node,
  or publish and fire the real event.
  --input wins over --body and is the trigger payload verbatim. A flat --body is
  treated as that payload; a --body carrying triggerData / sampleConfig is used as
  given. An EMPTY object is treated as absent, so the node's stored runOutput
  survives rather than being clobbered with {}.
  --sample needs --sample-node (the loop node's id). Caps only apply to runs that
  start immediately — they cannot reach a run an external event starts later.
  Answers {executionId, status:"RUNNING"}. Follow it with --follow, or later with
  "nexus execution diagnose <executionId>".
  WITH --follow, --json EMITS NDJSON — one JSON object per node state change, not
  a single document. Read it line by line; piping it to a jq that expects one
  document fails on the second line. Without --follow, --json is one document as
  usual.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const input = parseInputFlag(opts.input);

        const flagSampleConfig = parseSampleConfig({
          sample: opts.sample,
          sampleNode: opts.sampleNode,
          limitArray: opts.limitArray
        });
        // The /test endpoint expects { triggerData, sampleConfig } and strips
        // any other top-level keys. Normalize --input / --body into that shape
        // so a flat payload feeds the trigger instead of being silently dropped
        // (NEX-2483). Flag-derived caps merge onto body caps; flags win.
        const body = buildTestWorkflowBody(base, input, flagSampleConfig);

        const result = (await client.workflows.testWorkflow(id, body)) as unknown as Record<
          string,
          unknown
        >;

        const follow = !!(opts.follow || opts.stream);
        const executionId = result?.executionId as string | null | undefined;

        if (follow && executionId) {
          if (!isJsonMode()) {
            printRecord(result, [
              { key: "executionId", label: "Execution ID" },
              { key: "status", label: "Status" }
            ]);
            console.log();
          }
          const interval = Math.max(500, parseInt(opts.interval, 10) || 1500);
          const finalStatus = await runFollow(client, executionId, {
            interval,
            wfTag: shortTag(id),
            json: isJsonMode()
          });
          if (!isJsonMode()) {
            const paint =
              finalStatus === "COMPLETED"
                ? color.green
                : finalStatus === "FAILED" || finalStatus === "ERROR" || finalStatus === "CANCELLED"
                  ? color.red
                  : color.yellow;
            console.log(`\n${color.dim("Final status:")} ${paint(finalStatus)}`);
          }
          return;
        }

        if (follow && !executionId) {
          printRecord(result);
          if (!isJsonMode()) {
            console.log(
              color.dim(
                "\nNothing to follow — this trigger has no immediate execution (e.g. it is awaiting an external call)."
              )
            );
          }
          return;
        }

        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── test-node ────────────────────────────────────────────────────────
  workflow
    .command("test-node")
    .description("Test-execute a single node in a workflow")
    .argument("<workflowId>", "Workflow ID")
    .argument("<nodeId>", "Node ID")
    .option("--input <json>", "Input JSON for the node")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow test-node 11111111-1111-4111-8111-111111111111 node-456
  $ nexus workflow test-node 11111111-1111-4111-8111-111111111111 node-456 --input '{"upstream-node-id":{"rows":[]}}'
  $ nexus workflow test-node 11111111-1111-4111-8111-111111111111 node-456 --body input.json
  $ nexus workflow test-node 11111111-1111-4111-8111-111111111111 node-456 --json

Notes:
  THE SAME ENDPOINT AS "nexus workflow node test", which documents the mock shape
  in full. This spelling adds --input as sugar; both send {input: …}.
  --input IS A MAP OF UPSTREAM OUTPUTS, not this node's arguments. Each key is an
  upstream node id (or an input variable's name) and its value becomes that node's
  mocked output, which is how {{upstream.field}} resolves. An unknown key is a 400.
  WITHOUT MOCKS, UPSTREAM REFERENCES RESOLVE FROM EACH UPSTREAM NODE'S LAST TEST
  RESULT. An upstream that has never run exposes nothing, so the node under test
  runs on empty values and a green result proves only that it did not crash.
  A trigger node is refused here with 400 NODE_IS_TRIGGER — use "workflow test".
  IT WRITES BACK. The node's testExecutionId, runOutput and inferred outputFormat
  are persisted, which is what lets downstream nodes see this node's shape — and
  which overwrites the previous test's pointer.
  The returned executionId is a per-node test id, so "nexus execution get" on it
  fails. The output you want is already in this response's data field.`
    )
    .action(async (workflowId: string, nodeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const input = parseInputFlag(opts.input);
        // The node-test endpoint expects { input } and strips other top-level
        // keys; normalize a flat --input / --body so it isn't dropped (NEX-2483).
        const body = buildTestNodeBody(base, input);
        const result = await client.workflows.testNode(workflowId, nodeId, body);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── batch ─────────────────────────────────────────────────────────────
  const batch = workflow
    .command("batch")
    .description("Batch-create nodes, edges, and branches in a workflow")
    .argument("<id>", "Workflow ID")
    .requiredOption("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow batch 11111111-1111-4111-8111-111111111111 --body '{"nodes":[{"ref":"summarize","type":"aiTask"}],"edges":[{"source":"@trigger","target":"@summarize"}]}'
  $ nexus workflow batch 11111111-1111-4111-8111-111111111111 --body '{"nodes":[{"ref":"rows","type":"loop"},{"ref":"score","type":"aiTask","parentId":"@rows"}],"edges":[{"source":"@rowsStart","target":"@score"}]}'
  $ nexus workflow batch 11111111-1111-4111-8111-111111111111 --body batch.json
  $ cat batch.json | nexus workflow batch 11111111-1111-4111-8111-111111111111 --body -
  $ nexus workflow batch 11111111-1111-4111-8111-111111111111 --body - --json

Notes:
  DECLARE A ref BARE, REFERENCE IT WITH @. {"ref":"summarize"} is declared, and
  every source / target / parentId / sourceHandle that means it writes "@summarize".
  A value with no @ is taken as an existing node or edge UUID, so a bare typo
  becomes "not found in workflow" rather than an unresolved ref.
  Refs must be unique within the batch, and three kinds are reserved or generated:
  @trigger is the workflow's existing trigger node; a loop or doWhile named "rows"
  also creates @rowsStart, its body's entry point; and each branch you declare
  gets its own ref. Use GET /workflows/node-types ("nexus workflow node-types")
  for the type names — "llm", "action" and "condition" are not among them.
  label is OPTIONAL. Node types carry their own default label, and data is merged
  over the type's defaults. RE-DECLARING AN EXISTING NODE MERGES RECURSIVELY over
  its stored data, so one entry of a nested map (parametersSetup, an
  agentInputTrigger's parameters) no longer replaces the whole map; send a nested
  entry as null to drop it, and send an array complete because arrays replace.
  IT IS ATOMIC. Everything is validated in memory and written once, so a refusal
  anywhere leaves the workflow exactly as it was — no orphan nodes to clean up.
  Refusals are literal: "Duplicate ref 'X'", "Unknown node type: 'X'",
  "Unresolved reference '@X' in <context>. Available refs: …" and
  "Edge(s) not found: <id>". Edges are also held to every rule
  "workflow edge create" applies (EDGE_SELF_LOOP, EDGE_SCOPE_VIOLATION, …).
  Re-firing the same batch REUSES an identical existing edge instead of failing,
  so a retry after a partial network failure is safe.
  PLUGIN NODES COME BACK UNCONFIGURED — batch creates the shell only. Set toolId,
  then selectedAction (which populates the parameters), verify with
  "workflow node get", and only then toolCredentialId. Configuring parameters
  before the action is accepted and silently produces nothing.
  Created ids arrive at data.created.{nodes,edges,branches}, keyed by your refs.
  The default table output prints only the three counts — use --json for the ids.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);
        const result = await client.workflows.batch(
          id,
          asRequestBody<BatchRequestBody>(body ?? {})
        );
        if (isJsonMode()) {
          printRecord(result);
        } else {
          const { created } = result;
          printSuccess("Batch applied.", {
            nodes: Object.keys(created.nodes ?? {}).length,
            edges: (created.edges ?? []).length,
            branches: Object.keys(created.branches ?? {}).length
          });
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── upload-icon ───────────────────────────────────────────────────────
  workflow
    .command("upload-icon")
    .description("Upload an icon image for a workflow")
    .argument("<id>", "Workflow ID")
    .requiredOption("--file <path>", "Path to the image file (PNG, JPG, or SVG)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow upload-icon 11111111-1111-4111-8111-111111111111 --file ./icon.png
  $ nexus workflow upload-icon 11111111-1111-4111-8111-111111111111 --file ./logo.svg

Notes:
  The file is read locally first, so a missing path fails before any request.
  Maximum 2 MB — larger is a 413, with the upload aborted mid-flight.
  It REPLACES the current icon and answers {id, iconUrl}.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const absPath = path.resolve(opts.file);

        if (!fs.existsSync(absPath)) {
          process.exitCode = refuse(
            `File not found: ${absPath}`,
            "Pass a path that exists, relative to the current directory or absolute."
          );
          return;
        }

        const buffer = fs.readFileSync(absPath);
        const blob = new Blob([buffer]);

        const result = await client.workflows.uploadIcon(id, blob);
        printSuccess("Workflow icon uploaded.", {
          id,
          iconUrl: result.iconUrl
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and after the hand-written prose.
  bindCommand(workflowList, WORKFLOW_LIST_CONTRACT);
  // A pure `--body` command: `--body` IS the whole request, so both enums are
  // genuinely reachable and neither has, or should have, a flag. The Notes above
  // already name the six trigger types nowhere — they point at "workflow
  // node-types" for node type names and say nothing about `triggerType` at all,
  // so the contract block is the first place an operator can read either list.
  bindCommand(batch, WORKFLOW_BATCH_EXECUTE_CONTRACT, {
    "Body.edges[].type": "--body only; one type per edge, inside the edges array",
    "Body.triggerType": "--body only; batch takes no flags but --body"
  });

  // ── builder sub-commands (nodes, edges, branches) ────────────────────
  // `workflow trigger` lives there and binds itself to
  // `WorkflowNodeReplaceTrigger`, so the ledger entry for this namespace names
  // both descriptors.
  registerWorkflowBuilderCommands(workflow, program);
}
