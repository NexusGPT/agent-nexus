import type { CreateTaskBody, ExecuteTaskBody, UpdateTaskBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient, seconds } from "../client";
import { handleError } from "../errors";
import { formatFolder, isJsonMode, printRecord, printSuccess, printTable } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { resolveInputValue } from "../util/stdin";

/**
 * Default timeout for `task execute`, in seconds. Structured-JSON generations
 * on slow frontier models routinely exceed the SDK's 30 s default, and the
 * server keeps processing after the client gives up — so this command waits
 * far longer by default. An explicit global `--timeout` still wins.
 */
const EXECUTE_DEFAULT_TIMEOUT_SECONDS = seconds(600);

export function registerTaskCommands(program: Command): void {
  const task = program.command("task").description("Manage AI tasks");

  task.addHelpText(
    "after",
    `
An AI task is a saved prompt plus the model and the input/output contract it
runs under. Three facts about the body decide whether a write lands:

  • CREATE REQUIRES A "generation" OBJECT, and an empty one is not enough. With
    the default formats it must carry expectedInput AND expectedOutput. The
    flags for those are --expected-input and --expected-output, so a create
    without them is a 400 no matter what else you pass.
  • FORMATS ARE LOWERCASE GOING IN, UPPERCASE COMING BACK. Send "json"; "task
    get" answers "JSON", and echoing that value back into update is a 400.
  • WRITES TAKE THE FORMATS FROM THE BODY ROOT AND THE SCHEMAS FROM
    "generation"; READS PUT EVERYTHING AT THE ROOT. "task get" has no
    "generation" key at all, so a get/edit/put round trip must move the fields.

Every field below is settable through --body. The flags cover the common ones;
allowDuplicate, temperature, inputFormat, outputFormat, the JSON schemas and
multimodal have no flag and are --body only.`
  );

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
  $ nexus task list --folder "Notion"

Notes:
  INPUT and OUTPUT print UPPERCASE ("TEXT", "JSON", "TEMPLATE") because that is
  how they are stored. Writes take the lowercase spellings — see "task create".

  This list carries no prompt and no schemas; "nexus task get <id> --json" does.
  --search matches the NAME only, not the prompt.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.skills.listTasks({
          search: opts.search,
          limit: opts.limit,
          folder: opts.folder
        });

        const items = result.items ?? [];
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
  $ nexus task get task-123 --json | jq -r '.prompt'
  $ nexus task get task-123 --json | jq '.jsonOutputSchema'

Notes:
  EVERYTHING IS AT THE TOP LEVEL. prompt, jsonInputSchema, jsonOutputSchema,
  multimodal and documentTemplateId all sit on the response root, and there is
  NO "generation" key on a read — reading ".generation.jsonOutputSchema" gets
  you null, not the schema.

  THIS READ IS NOT A WRITE BODY. inputFormat and outputFormat come back
  UPPERCASE ("TEXT", "JSON", "TEMPLATE") while writes accept only lowercase, and
  the schemas have to move back under "generation". Feeding this response
  straight into "task update" returns a 400 on the format alone.

  The human-readable view prints a subset. Use --json for the schemas.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const t = await client.skills.getTask(id);
        printRecord(t, [
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
Every example carries --expected-input and --expected-output (or a "generation"
object). None of them is optional decoration — see the first note below.

Examples:
  $ cat task-prompt.md | nexus task create --name "Classify" --model-name gpt-4o \\
      --model-provider OPEN_AI --prompt - \\
      --expected-input "A support ticket" --expected-output "One of: bug, billing, other"
  $ nexus task create --name "Summarize" --model-name gpt-4o --model-provider OPEN_AI \\
      --prompt "Summarize the following:" \\
      --expected-input "An email body" --expected-output "Three bullet points"
  $ nexus task create --body '{"name":"Extract","modelName":"gpt-4o","modelProvider":"OPEN_AI","prompt":"Extract the city.","outputFormat":"json","generation":{"expectedInput":"An address","jsonOutputSchema":{"city":{"type":"string"}}}}'

Notes:
  "generation" IS REQUIRED AND CANNOT BE EMPTY. Omitting it is a 400, and with
  the default formats (both "text") it must carry expectedInput and
  expectedOutput too. The flags that populate it are --expected-input and
  --expected-output; a create with neither sends no "generation" at all and is
  refused. This is the most common first-time 400 on this command.

  THE PROMPT GOES AT THE BODY ROOT, or under "generation.prompt" — both are
  accepted and fold to the same field. What is NOT accepted: promptText,
  systemPrompt, instructions and text. Those are rejected with a 400 naming the
  right field, rather than being dropped.

  A BYTE-IDENTICAL PROMPT IS REFUSED WITH 409 DUPLICATE_TASK_PROMPT, and the
  error carries the id of the task that already has it. Edit that task, or pass
  allowDuplicate to create a deliberate copy — there is no flag for it:
    --body '{"...":"...","allowDuplicate":true}'

  inputFormat ("text" | "json") and outputFormat ("text" | "json" | "template")
  are LOWERCASE and live at the body ROOT. Uppercase is rejected, not ignored.
  Each one makes a different "generation" field required:
    inputFormat  text -> expectedInput      json -> jsonInputSchema
    outputFormat text -> expectedOutput     json -> jsonOutputSchema
                                        template -> documentTemplateId

  A SCHEMA WITHOUT ITS FORMAT IS A 400, NOT A SILENT DROP. Sending
  jsonOutputSchema while outputFormat is still the default "text" is refused
  with a message naming the fix — set the format at the body root.

  The JSON schemas take EITHER a full JSON Schema document
  ({"type":"object","properties":{...}}) OR the bare field map
  ({"city":{"type":"string"}}); the bare form is wrapped server-side. What is
  refused, at save and again at execute, is a root that is not an object — a
  top-level array or scalar cannot be a structured output.

  On ANTHROPIC models the validation keywords — maxItems, maxLength, minimum,
  uniqueItems, minItems above 1 — are STRIPPED into the field's description and
  become advice the model may ignore. OpenAI enforces them mechanically. The
  same schema is therefore stricter on OpenAI than on Anthropic.

  multimodal (image, PDF, video input) belongs under "generation"; it is also
  accepted at the body root for compatibility. There is no flag:
    --body '{"...":"...","generation":{"multimodal":true,"...":"..."}}'

  temperature defaults to 0.7 and is --body only.`
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

        const t = await client.skills.createTask(asRequestBody<CreateTaskBody>(body));
        printSuccess("Task created.", {
          id: t.id,
          name: t.name
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
  $ nexus task update task-123 --model-name gpt-4o --model-provider OPEN_AI
  $ nexus task update task-123 --body '{"outputFormat":"json","jsonOutputSchema":{"city":{"type":"string"}}}'

Notes:
  SEND outputFormat LOWERCASE, AT THE BODY ROOT. "task get" returns "JSON";
  echoing that value back here is a 400. The accepted values are "text", "json"
  and "template" for outputFormat, "text" and "json" for inputFormat.

  Unlike create, "generation" is OPTIONAL here and its sub-fields are accepted
  at the body ROOT as well — jsonOutputSchema, expectedInput, multimodal and the
  rest are folded in for you. When you send both, the nested value wins.

  A PATCH ONLY TOUCHES WHAT IT NAMES. Omitting "generation" leaves the whole
  generation config alone; it does not reset it. An explicit null on
  jsonInputSchema or jsonOutputSchema is the one way to clear a field.

  CHANGING outputFormat DOES NOT CHANGE THE SCHEMA — send the matching schema in
  the same call, or the task keeps the one it had. Naming a NON-json format and
  a schema together in one body is refused with a 400, because that combination
  could never take effect. A schema on its own is always persisted.

  CHANGING --model-provider DISCARDS THE PROVIDER-SPECIFIC MODEL SETTINGS —
  thinking level, thinking display and reasoning effort are stripped, because
  they mean nothing to the new provider. Nothing in the response says so.

  The printed versionId is null WHEN NOTHING CHANGED — a no-op update
  deliberately creates no version. A null there means your edit was identical to
  what was stored, not that versioning failed.

  The duplicate-prompt check does NOT apply to update: two tasks can end up with
  identical prompts by editing one into the other.`
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
        const t = await client.skills.updateTask(id, asRequestBody<UpdateTaskBody>(body));
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
  Detach it from those dependents (listed in the error) before deleting.

  THE CONFIRMATION PROMPT ONLY APPEARS ON A TERMINAL. Piped, redirected or run
  in CI there is no prompt and no --yes is needed: the delete just happens.`
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
  In non-JSON mode, only the output text is printed (not the full response object).
  Long generations are given ${EXECUTE_DEFAULT_TIMEOUT_SECONDS}s by default; override with the global --timeout <seconds>.

  "Prompt is required" HERE MEANS THE TASK WAS CREATED WITHOUT A PROMPT, not
  that --input is wrong. Check with "nexus task get <id> --json | jq -r .prompt"
  and set it with "nexus task update <id> --prompt ...".

  A TASK WHOSE inputFormat IS "JSON" NEEDS A JSON OBJECT, not a string. Pass it
  through --body: --body '{"input":{"city":"Paris"}}'. The schema the task
  expects is jsonOutputSchema/jsonInputSchema on "task get".

  A CLIENT TIMEOUT DOES NOT STOP THE SERVER. The generation keeps running and is
  still billed after this command gives up — raise --timeout rather than
  re-running, since a re-run starts a second generation.

  A jsonOutputSchema whose root is not an object (a top-level array or scalar)
  fails here with a 400 EVERY time, however well the task saved.`
    )
    .action(async (id: string, opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient({
          ...globals,
          timeout: globals.timeout ?? EXECUTE_DEFAULT_TIMEOUT_SECONDS
        });
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.input) flags.input = await resolveInputValue(opts.input);

        const execBody = mergeBodyWithFlags(base, flags);
        const result = await client.skills.executeTask(
          id,
          asRequestBody<ExecuteTaskBody>(execBody)
        );

        if (isJsonMode()) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.output ?? JSON.stringify(result, null, 2));
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
