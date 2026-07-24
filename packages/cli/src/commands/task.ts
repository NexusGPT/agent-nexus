import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { formatFolder, isJsonMode, printRecord, printSuccess, printTable } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";
import { resolveInputValue } from "../util/stdin";

export function registerTaskCommands(program: Command): void {
  const task = program.command("task").description("Manage AI tasks");

  // ── list ──────────────────────────────────────────────────────────────
  task
    .command("list")
    .description("List AI tasks")
    .option("--search <query>", "Search by name")
    .option("--limit <number>", "Max results", parseInt)
    .option("--folder <name|id>", "Filter by folder name or id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus task list
  $ nexus task list --search "summarize" --limit 10
  $ nexus task list --json
  $ nexus task list --folder "Notion"`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.skills.listTasks({
          search: opts.search,
          limit: opts.limit,
          folder: opts.folder
        });

        const items = (result as any).items ?? [];
        printTable(items, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "category", label: "CATEGORY", width: 15 },
          { key: "inputFormat", label: "INPUT", width: 10 },
          { key: "outputFormat", label: "OUTPUT", width: 10 },
          { key: "folder", label: "FOLDER", width: 20, format: formatFolder }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── get ───────────────────────────────────────────────────────────────
  task
    .command("get")
    .description("Get AI task details")
    .argument("<id>", "Task ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus task get task-123
  $ nexus task get task-123 --json
  $ nexus task get task-123 --json | jq -r '.prompt'`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const t = await client.skills.getTask(id);
        printRecord(t as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "category", label: "Category" },
          { key: "modelName", label: "Model" },
          { key: "modelProvider", label: "Provider" },
          { key: "inputFormat", label: "Input Format" },
          { key: "outputFormat", label: "Output Format" },
          { key: "prompt", label: "Prompt" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  task
    .command("create")
    .description("Create an AI task")
    .requiredOption("--name <name>", "Task name")
    .requiredOption("--model-name <model>", "Model name (e.g. gpt-4o)")
    .requiredOption("--model-provider <provider>", "Model provider (e.g. OPEN_AI)")
    .option("--description <text>", "Task description")
    .option("--prompt <file-or-->", "Task prompt (file path, or '-' for stdin)")
    .option("--expected-input <text>", "Description of expected input")
    .option("--expected-output <text>", "Description of expected output")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus task create --name "Summarize Email" --model-name gpt-4o --model-provider OPEN_AI
  $ nexus task create --name "Summarize" --model-name gpt-4o --model-provider OPEN_AI --prompt "Summarize the following:"
  $ cat task-prompt.md | nexus task create --name "Classify" --model-name gpt-4o --model-provider OPEN_AI --prompt -
  $ nexus task create --body '{"name":"Summarize","modelName":"gpt-4o","modelProvider":"OPEN_AI"}'`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.description !== undefined) flags.description = opts.description;
        if (opts.modelName !== undefined) flags.modelName = opts.modelName;
        if (opts.modelProvider !== undefined) flags.modelProvider = opts.modelProvider;
        if (opts.prompt) flags.prompt = await resolveInputValue(opts.prompt);

        if (opts.expectedInput || opts.expectedOutput) {
          flags.generation = {
            expectedInput: opts.expectedInput,
            expectedOutput: opts.expectedOutput
          };
        }

        const body = mergeBodyWithFlags(base, flags);

        const t = await client.skills.createTask(body as any);
        printSuccess("Task created.", {
          id: (t as any).id,
          name: (t as any).name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  task
    .command("update")
    .description("Update an AI task")
    .argument("<id>", "Task ID")
    .option("--name <name>", "Task name")
    .option("--description <text>", "Task description")
    .option("--prompt <file-or-->", "Task prompt (file path, or '-' for stdin)")
    .option("--model-name <model>", "Model name (e.g. gpt-4o)")
    .option("--model-provider <provider>", "Model provider (e.g. OPEN_AI)")
    .option("--expected-input <text>", "Description of expected input")
    .option("--expected-output <text>", "Description of expected output")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus task update task-123 --prompt "Summarize the following email:"
  $ cat task-prompt.md | nexus task update task-123 --prompt -
  $ nexus task update task-123 --body '{"prompt":"New prompt text"}'
  $ nexus task update task-123 --model-name gpt-4o --model-provider OPEN_AI`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.description !== undefined) flags.description = opts.description;
        if (opts.modelName !== undefined) flags.modelName = opts.modelName;
        if (opts.modelProvider !== undefined) flags.modelProvider = opts.modelProvider;
        if (opts.prompt) flags.prompt = await resolveInputValue(opts.prompt);

        if (opts.expectedInput !== undefined || opts.expectedOutput !== undefined) {
          flags.generation = {
            ...(opts.expectedInput !== undefined && { expectedInput: opts.expectedInput }),
            ...(opts.expectedOutput !== undefined && { expectedOutput: opts.expectedOutput })
          };
        }

        const body = mergeBodyWithFlags(base, flags);
        const t = await client.skills.updateTask(id, body as any);
        printSuccess("Task updated.", {
          id: t.id,
          name: t.name,
          // Null when nothing changed — that update deliberately creates no version.
          versionId: t.versionId,
          versionCreatedAt: t.versionCreatedAt
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  task
    .command("delete")
    .description("Delete an AI task")
    .argument("<id>", "Task ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus task delete task-123
  $ nexus task delete task-123 --yes

Notes:
  Fails with 409 if the task is still attached to an agent skill or workflow.
  Detach it from those dependents (listed in the error) before deleting.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete task ${id}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.skills.deleteTask(id);
        printSuccess("Task deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── execute ───────────────────────────────────────────────────────────
  task
    .command("execute")
    .description("Execute an AI task")
    .argument("<id>", "Task ID")
    .requiredOption("--input <text-or-->", "Input text (or '-' for stdin)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus task execute task-123 --input "Summarize this email..."
  $ cat document.txt | nexus task execute task-123 --input -
  $ nexus task execute task-123 --input "Hello world" --json
  $ nexus task execute task-123 --body '{"input":"Hello world"}'

Notes:
  --input accepts literal text, a file path (auto-detected), or '-' for stdin.
  In non-JSON mode, only the output text is printed (not the full response object).`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.input) flags.input = await resolveInputValue(opts.input);

        const execBody = mergeBodyWithFlags(base, flags);
        const result = await client.skills.executeTask(id, execBody as any);

        if (isJsonMode()) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log((result as any).output ?? JSON.stringify(result, null, 2));
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
