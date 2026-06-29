import fs from "node:fs";
import path from "node:path";

import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { color, formatFolder, isJsonMode, printList, printRecord, printSuccess } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { runFollow, shortTag } from "../util/run-follow";
import { parseSampleConfig } from "../util/sample-config";
import { registerWorkflowBuilderCommands } from "./workflow-builder";

/** Commander collector for repeatable options. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function registerWorkflowCommands(program: Command): void {
  const workflow = program.command("workflow").description("Manage workflows");

  // ── list ──────────────────────────────────────────────────────────────
  addPaginationOptions(
    workflow
      .command("list")
      .description("List workflows")
      .option("--status <status>", "Filter by status (DRAFT, PUBLISHED)")
      .option("--search <query>", "Search by name")
      .option("--folder <name|id>", "Filter by folder name or id")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus workflow list
  $ nexus workflow list --status PUBLISHED --limit 10
  $ nexus workflow list --search "onboarding" --json
  $ nexus workflow list --folder "Notion"`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.workflows.list({
        ...getPaginationParams(opts),
        status: opts.status,
        search: opts.search,
        folder: opts.folder
      } as any);

      printList(
        data as unknown as Record<string, unknown>[],
        meta as unknown as Record<string, unknown>,
        [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "status", label: "STATUS", width: 12 },
          { key: "folder", label: "FOLDER", width: 20, format: formatFolder },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]
      );
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
  $ nexus workflow get wf-123
  $ nexus workflow get wf-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const wf = await client.workflows.get(id);
        printRecord(wf as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "status", label: "Status" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" }
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
  $ nexus workflow create --body '{"name":"Pipeline","description":"ETL"}'`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description })
        });

        const wf = await client.workflows.create(body as any);
        printSuccess("Workflow created.", {
          id: (wf as any).id,
          name: (wf as any).name
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
  $ nexus workflow update wf-123 --name "Renamed Workflow"
  $ nexus workflow update wf-123 --description "Updated description"
  $ nexus workflow update wf-123 --body '{"name":"Renamed"}'`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description })
        });

        await client.workflows.update(id, body as any);
        printSuccess("Workflow updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  workflow
    .command("delete")
    .description("Delete a workflow")
    .argument("<id>", "Workflow ID")
    .option("--yes", "Skip confirmation")
    .option("--dry-run", "Preview without deleting")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow delete wf-123
  $ nexus workflow delete wf-123 --yes
  $ nexus workflow delete wf-123 --dry-run`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (opts.dryRun) {
          const wf = await client.workflows.get(id);
          console.log(
            color.yellow("DRY RUN:") + ` Would delete workflow "${(wf as any).name}" (${id})`
          );
          return;
        }

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          const answer = await rl.question(`Delete workflow ${id}? This cannot be undone. [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

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
  $ nexus workflow duplicate wf-123`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const wf = await client.workflows.duplicate(id);
        printSuccess("Workflow duplicated.", {
          id: (wf as any).id,
          name: (wf as any).name
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
  $ nexus workflow publish wf-123

Notes:
  Workflows must be PUBLISHED before they can be attached to agents as tools.
  Use "nexus workflow validate <id>" first to check for configuration errors.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.publish(id);
        printSuccess("Workflow published.", { id, ...(result as any) });
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
  $ nexus workflow unpublish wf-123`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.unpublish(id);
        printSuccess("Workflow unpublished.", { id, ...(result as any) });
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
  $ nexus workflow validate wf-123
  $ nexus workflow validate wf-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const report = await client.workflows.validate(id);
        printRecord(report as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── test ──────────────────────────────────────────────────────────────
  workflow
    .command("test")
    .description("Run a test execution of a workflow")
    .argument("<id>", "Workflow ID")
    .option("--input <json>", "Input JSON for the test")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
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
  $ nexus workflow test wf-123 --input '{"message": "hello"}'
  $ nexus workflow test wf-123 --body '{"message": "hello"}'
  $ nexus workflow test wf-123 --follow
  $ nexus workflow test wf-123 --sample 5 --sample-node loop-abc --follow
  $ nexus workflow test wf-123 --limit-array loop-abc=5 --limit-array rows=10
  $ nexus workflow test wf-123 --json`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const input = opts.input ? JSON.parse(opts.input) : (base ?? {});

        const flagSampleConfig = parseSampleConfig({
          sample: opts.sample,
          sampleNode: opts.sampleNode,
          limitArray: opts.limitArray
        });
        // Merge flag-derived caps onto any sampleConfig already in the body so
        // per-node caps supplied via --body are preserved; flags win on conflict.
        let body = input;
        if (flagSampleConfig) {
          const bodySampleConfig =
            input && typeof input === "object" && typeof input.sampleConfig === "object"
              ? (input.sampleConfig as Record<string, unknown>)
              : undefined;
          body = { ...input, sampleConfig: { ...bodySampleConfig, ...flagSampleConfig } };
        }

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
          const finalStatus = await runFollow(client as any, executionId, {
            interval,
            wfTag: shortTag(id),
            json: isJsonMode()
          });
          if (!isJsonMode()) {
            const paint =
              finalStatus === "COMPLETED"
                ? color.green
                : finalStatus === "FAILED" ||
                    finalStatus === "ERROR" ||
                    finalStatus === "CANCELLED"
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
  $ nexus workflow test-node wf-123 node-456
  $ nexus workflow test-node wf-123 node-456 --input '{"key": "value"}'
  $ nexus workflow test-node wf-123 node-456 --body input.json
  $ nexus workflow test-node wf-123 node-456 --json`
    )
    .action(async (workflowId: string, nodeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const input = opts.input ? JSON.parse(opts.input) : (base ?? undefined);
        const result = await client.workflows.testNode(workflowId, nodeId, input);
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── batch ─────────────────────────────────────────────────────────────
  workflow
    .command("batch")
    .description("Batch-create nodes, edges, and branches in a workflow")
    .argument("<id>", "Workflow ID")
    .requiredOption("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow batch wf-123 --body '{"nodes":[{"ref":"@n1","type":"llm"}]}'
  $ nexus workflow batch wf-123 --body batch.json
  $ cat batch.json | nexus workflow batch wf-123 --body -
  $ nexus workflow batch wf-123 --body - --json`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);
        const result = await client.workflows.batch(id, body ?? {});
        if (isJsonMode()) {
          printRecord(result as unknown as Record<string, unknown>);
        } else {
          const { created } = result as any;
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
  $ nexus workflow upload-icon wf-123 --file ./icon.png
  $ nexus workflow upload-icon wf-123 --file ./logo.svg`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const absPath = path.resolve(opts.file);

        if (!fs.existsSync(absPath)) {
          console.error(`Error: File not found: ${absPath}`);
          process.exitCode = 1;
          return;
        }

        const buffer = fs.readFileSync(absPath);
        const blob = new Blob([buffer]);

        const result = await client.workflows.uploadIcon(id, blob);
        printSuccess("Workflow icon uploaded.", {
          id,
          iconUrl: (result as any).iconUrl ?? (result as any).url
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── builder sub-commands (nodes, edges, branches) ────────────────────
  registerWorkflowBuilderCommands(workflow, program);
}
