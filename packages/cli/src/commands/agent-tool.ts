import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printRecord, printSuccess, printTable } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";

export function registerAgentToolCommands(program: Command): void {
  const agentTool = program.command("agent-tool").description("Manage agent tool configurations");

  // ── list ──────────────────────────────────────────────────────────────
  agentTool
    .command("list")
    .description("List tools attached to an agent")
    .argument("<agent-id>", "Agent ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-tool list agt-123
  $ nexus agent-tool list agt-123 --json`
    )
    .action(async (agentId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const tools = await client.agents.tools.list(agentId);

        printTable(tools as unknown as Record<string, unknown>[], [
          { key: "id", label: "ID", width: 36 },
          { key: "label", label: "LABEL", width: 25 },
          { key: "type", label: "TYPE", width: 15 },
          { key: "isActive", label: "ACTIVE", width: 8, format: (v) => (v ? "yes" : "no") }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── get ───────────────────────────────────────────────────────────────
  agentTool
    .command("get")
    .description("Get tool configuration details")
    .argument("<agent-id>", "Agent ID")
    .argument("<tool-id>", "Tool config ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-tool get agt-123 tool-456
  $ nexus agent-tool get agt-123 tool-456 --json`
    )
    .action(async (agentId: string, toolId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const tool = await client.agents.tools.get(agentId, toolId);
        printRecord(tool as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  agentTool
    .command("create")
    .description("Add a tool to an agent")
    .argument("<agent-id>", "Agent ID")
    // --label and --type belong to the API contract (CreateAgentToolBody) but
    // can also come from --body, so neither is Commander-required — the API
    // returns a clean validation error if either is missing.
    .option("--label <label>", "Tool label")
    .option("--type <type>", "Tool type (PLUGIN, WORKFLOW, TASK, COLLECTION, etc.)")
    .option(
      "--config <json>",
      "Tool configuration as JSON object (becomes the nested config field, provider-specific shape)"
    )
    .option("--fire-and-forget", "Execute without waiting for result")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-tool create agt-123 --label "Gmail Send" --type PLUGIN
  $ nexus agent-tool create agt-123 --label "Workflow" --type WORKFLOW --config '{"workflowId":"wf-789"}'
  $ nexus agent-tool create agt-123 --body '{"label":"Search","type":"COLLECTION","config":{"collectionId":"col-1"},"agentInputSchema":{}}'
  $ nexus agent-tool create agt-123 --label "Notify" --type WEBHOOK --fire-and-forget`
    )
    .action(async (agentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.label !== undefined) flags.label = opts.label;
        if (opts.type !== undefined) flags.type = opts.type;
        if (opts.fireAndForget) flags.fireAndForget = true;
        // --config is the API's nested `config` field, not a flatten-into-body
        // alias. The original Object.assign behaviour silently sent the keys
        // at the top level, which the schema (config: z.record) rejected.
        if (opts.config) flags.config = JSON.parse(opts.config);

        const body = mergeBodyWithFlags(base, flags);

        const tool = await client.agents.tools.create(agentId, body as any);
        printSuccess("Tool added to agent.", {
          id: (tool as any).id,
          label: (tool as any).label
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  agentTool
    .command("update")
    .description("Update a tool configuration")
    .argument("<agent-id>", "Agent ID")
    .argument("<tool-id>", "Tool config ID")
    .option("--label <label>", "New label")
    .option("--config <json>", "Updated configuration as JSON")
    .option("--fire-and-forget", "Execute without waiting for result")
    .option("--no-fire-and-forget", "Wait for tool execution (default)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-tool update agt-123 tool-456 --label "Renamed Tool"
  $ nexus agent-tool update agt-123 tool-456 --fire-and-forget
  $ nexus agent-tool update agt-123 tool-456 --body '{"label":"Renamed"}'`
    )
    .action(async (agentId: string, toolId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.label !== undefined) flags.label = opts.label;
        if (opts.fireAndForget !== undefined) flags.fireAndForget = opts.fireAndForget;
        // See agent-tool create: --config is the nested API field, not a
        // flatten-into-body alias.
        if (opts.config) flags.config = JSON.parse(opts.config);

        const body = mergeBodyWithFlags(base, flags);

        await client.agents.tools.update(agentId, toolId, body as any);
        printSuccess("Tool updated.", { id: toolId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  agentTool
    .command("delete")
    .description("Remove a tool from an agent")
    .argument("<agent-id>", "Agent ID")
    .argument("<tool-id>", "Tool config ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-tool delete agt-123 tool-456
  $ nexus agent-tool delete agt-123 tool-456 --yes`
    )
    .action(async (agentId: string, toolId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Remove tool ${toolId} from agent? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.agents.tools.delete(agentId, toolId);
        printSuccess("Tool removed from agent.", { id: toolId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── attach-collection ──────────────────────────────────────────────────
  agentTool
    .command("attach-collection")
    .description("Attach a knowledge collection to an agent")
    .argument("<agent-id>", "Agent ID")
    .requiredOption("--collection-id <id>", "Collection ID")
    .option("--label <label>", "Tool label")
    .option("--instructions <text>", "Usage instructions")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-tool attach-collection agt-123 --collection-id col-456
  $ nexus agent-tool attach-collection agt-123 --collection-id col-456 --label "FAQ Search"
  $ nexus agent-tool attach-collection agt-123 --body '{"collectionId":"col-456","label":"FAQ"}'`
    )
    .action(async (agentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.collectionId !== undefined && { collectionId: opts.collectionId }),
          ...(opts.label !== undefined && { label: opts.label }),
          ...(opts.instructions !== undefined && { instructions: opts.instructions })
        });

        const tool = await (client.agents.tools as any).attachCollection(agentId, body);
        printSuccess("Collection attached to agent.", {
          id: (tool as any).id,
          label: (tool as any).label
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
