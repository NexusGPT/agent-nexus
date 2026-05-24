import type { ReplaceTriggerBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";

// `satisfies readonly ReplaceTriggerBody["type"][]` forces this runtime tuple
// to track the SDK union 1:1 — adding a new trigger type to the SDK without
// updating this array becomes a compile error instead of a silent CLI gap.
const TRIGGER_TYPES = [
  "webhookTrigger",
  "agentInputTrigger",
  "scheduleTrigger",
  "pluginTrigger",
  "manualTrigger",
  "platformListenerTrigger"
] as const satisfies readonly ReplaceTriggerBody["type"][];

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
    .requiredOption("--type <type>", "Node type")
    .option("--body <json-or-file-or-->", "Additional body JSON (merged with --type)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node create wf-123 --type action
  $ nexus workflow node create wf-123 --type condition --body '{"position":{"x":100,"y":200}}'
  $ nexus workflow node create wf-123 --type action --body payload.json`
    )
    .action(async (wfId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const extra = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(extra, { type: opts.type });
        const result = await client.workflows.createNode(wfId, body as any);
        printRecord(result as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "type", label: "Type" },
          { key: "position", label: "Position" }
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
  $ nexus workflow node get wf-123 node-456 --json`
    )
    .action(async (wfId: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getNode(wfId, nodeId);
        printRecord(result as unknown as Record<string, unknown>);
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
  $ nexus workflow node update wf-123 node-456 --body '{"data":{"message":"hello"}}'
  $ nexus workflow node update wf-123 node-456 --body config.json
  $ echo '{"data":{"key":"val"}}' | nexus workflow node update wf-123 node-456 --body -`
    )
    .action(async (wfId: string, nodeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);
        const result = await client.workflows.updateNode(wfId, nodeId, body as any);
        printRecord(result as unknown as Record<string, unknown>);
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
  $ nexus workflow node delete wf-123 node-456 --yes`
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
    .option("--body <json-or-file-or-->", "Optional mock data JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node test wf-123 node-456
  $ nexus workflow node test wf-123 node-456 --body '{"input":"test"}'`
    )
    .action(async (wfId: string, nodeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);
        const result = await client.workflows.testNode(wfId, nodeId, body as any);
        printRecord(result as unknown as Record<string, unknown>);
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
  $ nexus workflow node variables wf-123 node-456 --json`
    )
    .action(async (wfId: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getAvailableVariables(wfId, nodeId);
        printRecord(result as unknown as Record<string, unknown>);
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
  $ nexus workflow node output-format wf-123 node-456 --json`
    )
    .action(async (wfId: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getOutputFormat(wfId, nodeId);
        printRecord(result as unknown as Record<string, unknown>);
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
  $ nexus workflow node reload-props wf-123 node-456 --body props.json`
    )
    .action(async (wfId: string, nodeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);
        const result = await client.workflows.reloadProps(wfId, nodeId, body as any);
        printRecord(result as unknown as Record<string, unknown>);
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
  $ nexus workflow edge create wf-123 --source node-1 --target node-2 --source-handle branch-a
  $ nexus workflow edge create wf-123 --source node-1 --target node-2 --body '{"type":"conditional"}'`
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
        const result = await client.workflows.createEdge(wfId, body as any);
        printRecord(result as unknown as Record<string, unknown>, [
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
  $ nexus workflow edge delete wf-123 edge-789 --yes`
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
  $ nexus workflow branch list wf-123 node-456 --json`
    )
    .action(async (wfId: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.listBranches(wfId, nodeId);
        const branches = Array.isArray(result) ? result : ((result as any).data ?? result);
        printList(branches as unknown as Record<string, unknown>[], undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "conditions", label: "CONDITIONS", width: 40 }
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
    .option("--body <json-or-file-or-->", "Additional body JSON (conditions, etc.)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow branch create wf-123 node-456 --name "Has email"
  $ nexus workflow branch create wf-123 node-456 --name "VIP" --body '{"conditions":[{"field":"tier","op":"eq","value":"vip"}]}'`
    )
    .action(async (wfId: string, nodeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const extra = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(extra, { name: opts.name });
        const result = await client.workflows.createBranch(wfId, nodeId, body as any);
        printRecord(result as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "conditions", label: "Conditions" }
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
    .requiredOption("--body <json-or-file-or-->", "Updated branch JSON (name, conditions)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow branch update wf-123 node-456 br-789 --body '{"name":"Renamed","conditions":[]}'
  $ nexus workflow branch update wf-123 node-456 br-789 --body branch.json`
    )
    .action(async (wfId: string, nodeId: string, branchId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);
        const result = await client.workflows.updateBranch(wfId, nodeId, branchId, body as any);
        printRecord(result as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "conditions", label: "Conditions" }
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
  $ nexus workflow branch delete wf-123 node-456 br-789
  $ nexus workflow branch delete wf-123 node-456 br-789 --yes`
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
  $ nexus workflow node-types --json`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.listNodeTypes();
        const types = Array.isArray(result) ? result : ((result as any).data ?? result);
        printList(types as unknown as Record<string, unknown>[], undefined, [
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
  $ nexus workflow node-type action
  $ nexus workflow node-type condition --json`
    )
    .action(async (type: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getNodeTypeSchema(type);
        printRecord(result as unknown as Record<string, unknown>);
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
        printList(result.events as unknown as Record<string, unknown>[], undefined, [
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
  $ nexus workflow overview wf-123 --json`
    )
    .action(async (wfId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getOverview(wfId);
        printRecord(result as unknown as Record<string, unknown>);
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
  $ nexus workflow layout wf-123`
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
  workflow
    .command("trigger")
    .description("Replace the trigger node of a workflow")
    .argument("<wf-id>", "Workflow ID")
    .requiredOption("--type <type>", `New trigger type. One of: ${TRIGGER_TYPES.join(", ")}`)
    .option("--body <json-or-file-or-->", "Additional body JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow trigger wf-123 --type webhookTrigger
  $ nexus workflow trigger wf-123 --type scheduleTrigger --body '{"cron":"0 9 * * *"}'
  $ nexus workflow trigger wf-123 --type platformListenerTrigger`
    )
    .action(async (wfId: string, opts: { type: string; body?: string }) => {
      try {
        // Client-side narrow: a typo ("webhook" instead of "webhookTrigger")
        // would otherwise round-trip to the API and return a verbose ZodError.
        // Rejecting here keeps the error CLI-shaped.
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
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
