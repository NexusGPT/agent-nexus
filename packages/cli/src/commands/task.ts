import {
  type CreateTaskBody,
  type DuplicateTaskBody,
  type ExecuteTaskBody,
  LONG_RUNNING_TIMEOUT_MS,
  type UpdateTaskBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient, seconds } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { dashboardUrlFor } from "../dashboard-url";
import { handleError } from "../errors";
import { formatFolder, isJsonMode, printRecord, printSuccess, printTable } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import { resolveInputValue } from "../util/stdin";
import {
  SKILLS_CREATE_TASK__BODY_MODEL_PROVIDER,
  SKILLS_CREATE_TASK_CONTRACT,
  SKILLS_DUPLICATE_TASK__BODY_MODEL_PROVIDER,
  SKILLS_DUPLICATE_TASK_CONTRACT,
  SKILLS_EXECUTE_TASK__BODY_MODEL_OVERRIDE_MODEL_PROVIDER,
  SKILLS_EXECUTE_TASK_CONTRACT,
  SKILLS_UPDATE_TASK__BODY_MODEL_PROVIDER,
  SKILLS_UPDATE_TASK_CONTRACT
} from "./task.contract.generated";

/**
 * Default timeout for `task execute`, in seconds. Structured-JSON generations
 * on slow frontier models routinely exceed the SDK's 30 s default, and the
 * server keeps processing after the client gives up — so this command waits
 * far longer by default. An explicit global `--timeout` still wins.
 *
 * DERIVED from the SDK's own deadline for this class of route rather than
 * restated, so the number in `--help` and the number a direct SDK caller gets
 * cannot drift apart. Stated in seconds because that is what `createClient`
 * takes — see the `Seconds` brand in `../client`.
 */
const EXECUTE_DEFAULT_TIMEOUT_SECONDS = seconds(LONG_RUNNING_TIMEOUT_MS / 1000);

/**
 * The `modelOverride` object for `task execute`, from its three model flags.
 *
 * Returns `undefined` when none of them was given, which is the ordinary case
 * and must send no `modelOverride` key at all — an empty object is a different
 * request, and the server refuses it for a missing `modelName`.
 *
 * 🚨 HALF A PAIR IS REFUSED HERE RATHER THAN SENT. `--model-name` alone would
 * reach the server as a 400 anyway, but the flag it names is the one thing about
 * this call that costs 15x, so the failure is worth stating in the terms the
 * operator typed. Completing the pair from the task's own provider is the one
 * thing this must never do: `claude-haiku-4-5` under a stored `OPEN_AI` would
 * address an OpenAI endpoint with an Anthropic model id.
 */
function buildModelOverrideFlags(opts: {
  modelName?: string;
  modelProvider?: string;
  customModelId?: string;
}): Record<string, unknown> | undefined {
  if (!opts.modelName && !opts.modelProvider && !opts.customModelId) return undefined;

  if (!opts.modelName || !opts.modelProvider) {
    throw new Error(
      "--model-name and --model-provider must be given together to override the model for this " +
        "call. Omit both to run the task on its own model."
    );
  }

  return {
    modelName: opts.modelName,
    modelProvider: opts.modelProvider,
    ...(opts.customModelId !== undefined && { customModelId: opts.customModelId })
  };
}

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

THE MODEL IS A PROPERTY OF THE CALL, NOT ONLY OF THE TASK. "task execute" takes
--model-name/--model-provider and runs THAT one invocation elsewhere without
touching the task, so one prompt can be swept cheaply in bulk and run on the
frontier model on demand. Reach for "task duplicate" only when the prompt itself
is about to diverge — two copies of one prompt drift, and the drift is silent.

Every field below is settable through --body. The flags cover the common ones;
allowDuplicate, temperature, inputFormat, outputFormat, the JSON schemas,
multimodal and fewShots have no flag and are --body only.`
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
  --search matches the NAME only, not the prompt.

  --json IS A BARE ARRAY WITH NO ENVELOPE AND NO meta. "workflow list" answers
  {"data":[…],"meta":{…}} and this one answers [ … ], so one parser cannot read
  both — index the array directly here.
  THERE IS NO --page AND NO --offset, only --limit (default 20, max 100). The
  route itself pages and reports a total; this command exposes neither, and the
  total is dropped from the output. So a result exactly the size of --limit
  means "at least that many", never "that is all of them". Raise --limit, or
  read the count with "nexus api GET /skills/tasks" → .data.total.`
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
  $ nexus task get 11111111-1111-4111-8111-111111111111
  $ nexus task get 11111111-1111-4111-8111-111111111111 --json
  $ nexus task get 11111111-1111-4111-8111-111111111111 --json | jq -r '.prompt'
  $ nexus task get 11111111-1111-4111-8111-111111111111 --json | jq '.jsonOutputSchema'

Notes:
  EVERYTHING IS AT THE TOP LEVEL. prompt, jsonInputSchema, jsonOutputSchema,
  multimodal and documentTemplateId all sit on the response root, and there is
  NO "generation" key on a read — reading ".generation.jsonOutputSchema" gets
  you null, not the schema.

  THIS READ IS NOT A WRITE BODY. inputFormat and outputFormat come back
  UPPERCASE ("TEXT", "JSON", "TEMPLATE") while writes accept only lowercase, and
  the schemas have to move back under "generation". Feeding this response
  straight into "task update" returns a 400 on the format alone.

  The human-readable view prints a subset. Use --json for the schemas and for
  "fewShots" — the task's few-shot examples, oldest first, in the order the
  model is shown them. It is [] when the task has none:
    $ nexus task get 11111111-1111-4111-8111-111111111111 --json | jq '.fewShots'

  dashboardUrl IS ADDED BY THIS CLI AND IS NOT AN API FIELD. It is this task's
  page. The evaluation view is a DIFFERENT path — /app/my-tools/<id>/evaluate,
  under my-tools rather than my-ai-tasks — which reads like a mistake and is
  what the dashboard declares.`
    )
    .action(async (id: string) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const t = await client.skills.getTask(id);
        printRecord({ ...t, dashboardUrl: dashboardUrlFor("aiTask", t.id, globals) }, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "category", label: "Category" },
          { key: "modelName", label: "Model" },
          { key: "modelProvider", label: "Provider" },
          { key: "inputFormat", label: "Input Format" },
          { key: "outputFormat", label: "Output Format" },
          { key: "prompt", label: "Prompt" },
          { key: "dashboardUrl", label: "Dashboard" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  const create = task
    .command("create")
    .description("Create an AI task")
    .requiredOption("--name <name>", "Task name")
    .requiredOption("--model-name <model>", "Model name (e.g. gpt-4o)")
    .addOption(
      enumOption(
        "--model-provider <provider>",
        "Model provider",
        SKILLS_CREATE_TASK__BODY_MODEL_PROVIDER
      ).makeOptionMandatory()
    )
    .option("--description <text>", "Task description")
    .option(
      "--custom-model-id <id>",
      "Run on a custom model (BYOM) — the id from 'nexus custom-model list'"
    )
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

  --prompt TAKES LITERAL TEXT, DESPITE ITS <file-or--> LABEL. The value is used
  as written unless it is "-" (stdin) or the path of a file that EXISTS and is
  readable — then the file's contents are read and trimmed. So the second
  example above is not a shortcut, it is the ordinary form, and the same rule
  governs "nexus task update --prompt".
  ⚠️ THAT DETECTION IS WHY A ONE-WORD PROMPT IS A HAZARD. --prompt README.md
  from a directory holding that file sends the FILE, not the string, and nothing
  reports the substitution. Pass "-" and pipe, or a path you meant.

  THE PROMPT GOES AT THE BODY ROOT, or under "generation.prompt" — both are
  accepted and fold to the same field. What is NOT accepted: promptText,
  systemPrompt, instructions and text. Those are rejected with a 400 naming the
  right field, rather than being dropped.

  A BYTE-IDENTICAL PROMPT IS REFUSED WITH 409 DUPLICATE_TASK_PROMPT, and the
  error carries the id of the task that already has it. There are three ways on:

    IF ONLY THE MODEL DIFFERS, DO NOT CREATE A SECOND TASK. Run the existing one
    on the model you want, per call, and keep one prompt:
      $ nexus task execute <existing-id> --input ... \\
          --model-name claude-haiku-4-5 --model-provider ANTHROPIC
    A workflow node does the same with modelOverride on its aiTask node.

    TO FORK THE PROMPT DELIBERATELY, copy it rather than re-sending it:
      $ nexus task duplicate <existing-id> --name "..." \\
          --model-name claude-haiku-4-5 --model-provider ANTHROPIC
    A copy keeps every field you do not name — temperature included. Re-creating
    the variant HERE does not: an unsent field takes THIS command's default, and
    an unsent temperature is 0.7 whatever the original was set to.

    OR pass allowDuplicate to create a second task from this body anyway — there
    is no flag for it:
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
  ({"city":{"type":"string"}}); the bare form is wrapped at GENERATION time, not
  at write time, so "task get" reads the bare map back exactly as you sent it.
  An unchanged readback is the expected result, not a dropped wrap. What is
  refused, at save and again at execute, is a root that is not an object — a
  top-level array or scalar cannot be a structured output.

  On ANTHROPIC models the validation keywords — maxItems, maxLength, minimum,
  uniqueItems, minItems above 1 — are STRIPPED into the field's description and
  become advice the model may ignore. OpenAI enforces them mechanically. The
  same schema is therefore stricter on OpenAI than on Anthropic.

  multimodal (image, PDF, video input) belongs under "generation"; it is also
  accepted at the body root for compatibility. There is no flag:
    --body '{"...":"...","generation":{"multimodal":true,"...":"..."}}'

  FEW-SHOT EXAMPLES GO IN "fewShots", NOT IN THE PROMPT. Each pair is replayed
  as a user/assistant exchange ahead of the real input, so the prompt keeps the
  instructions and the demonstrations stay structured. --body only, and stored
  in the order given:
    --body '{"...":"...","fewShots":[{"input":"2 + 2","output":"4"}]}'
  Both halves are required and must be non-empty. "examples",
  "fewShotExamples", "samples" and "demonstrations" are NOT the field name and
  are refused with a 400 naming it, rather than dropped.

  A CUSTOM MODEL IS SELECTED BY --custom-model-id, NEVER BY --model-provider.
  "nexus model list" reports your own endpoints with provider "CUSTOM_<PROTOCOL>"
  and modelId "custom:<uuid>", and NEITHER of those strings is accepted here:
  --model-provider takes the four platform values only. Pass the row's own id
  from "nexus custom-model list" instead. An id belonging to another
  organization is a 404 on this call, not a 403.
  --model-name and --model-provider stay REQUIRED alongside it. They are the
  platform fallback, and a stored config missing either is discarded whole at
  inference — the custom model with it.
  AI TASKS RUN "openai"-PROTOCOL CUSTOM ENDPOINTS ONLY, AND THIS COMMAND SAYS SO
  RATHER THAN LETTING YOU FIND OUT AT EXECUTE. An anthropic- or google-protocol
  custom model is a 400 here, naming the protocol. Agents serve all three, so
  the same model attaches fine with "nexus agent create --custom-model-id".

  temperature defaults to 0.7 and is --body only. IT IS STORED AND NEVER READ
  BACK: "task get" returns no temperature field at any value, so a missing
  temperature is not a discarded write and there is no way to confirm one from
  this API.

  Only one flag per command may read standard input. Passing "-" to two of them
  — "--body -" alongside "--prompt -", say — is refused with an error naming
  both, and no request is sent. Give one of them a literal value or a file path.

  THE CREATE RESPONSE ECHOES NOTHING BACK BUT id AND name. It answers
  {"success":true,"message":"…","id":"…","name":"…","dashboardUrl":"…"} whatever
  you sent — and dashboardUrl is this CLI's own addition, not an echo — so
  nothing in it says the prompt landed, which format was stored, or whether a
  schema was kept.
  VERIFY WITH "nexus task get <id> --json" — that read carries prompt,
  inputFormat, outputFormat and both schemas, and it is the only confirmation
  this API offers. temperature is the exception: it is stored and never read
  back, so no read can confirm one.

  THE PROMPT IS OPTIONAL HERE AND REQUIRED AT EXECUTE. A create carrying
  "generation" but no prompt answers 201 and leaves a task that cannot run —
  "nexus task execute" then refuses it for a missing prompt. That is a
  legitimate draft state, not a broken create; fill it in with
  "nexus task update <id> --prompt <file>" before executing.`
    )
    .action(async (opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.description !== undefined) flags.description = opts.description;
        if (opts.modelName !== undefined) flags.modelName = opts.modelName;
        if (opts.modelProvider !== undefined) flags.modelProvider = opts.modelProvider;
        if (opts.customModelId !== undefined) flags.customModelId = opts.customModelId;
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
          name: t.name,
          dashboardUrl: dashboardUrlFor("aiTask", t.id, globals)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  const update = task
    .command("update")
    .description("Update an AI task")
    .argument("<id>", "Task ID")
    .option("--name <name>", "Task name")
    .option("--description <text>", "Task description")
    .option("--prompt <file-or-->", "Task prompt (file path, or '-' for stdin)")
    .option("--model-name <model>", "Model name (e.g. gpt-4o)")
    .addOption(
      enumOption(
        "--model-provider <provider>",
        "Model provider",
        SKILLS_UPDATE_TASK__BODY_MODEL_PROVIDER
      )
    )
    .option(
      "--custom-model-id <id>",
      "Attach a custom model (BYOM) — the id from 'nexus custom-model list'"
    )
    .option("--expected-input <text>", "Description of expected input")
    .option("--expected-output <text>", "Description of expected output")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus task update 11111111-1111-4111-8111-111111111111 --prompt "Summarize the following email:"
  $ cat task-prompt.md | nexus task update 11111111-1111-4111-8111-111111111111 --prompt -
  $ nexus task update 11111111-1111-4111-8111-111111111111 --body '{"prompt":"New prompt text"}'
  $ nexus task update 11111111-1111-4111-8111-111111111111 --model-name gpt-4o --model-provider OPEN_AI
  $ nexus task update 11111111-1111-4111-8111-111111111111 --body '{"outputFormat":"json","jsonOutputSchema":{"city":{"type":"string"}}}'

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

  "fewShots" REPLACES THE WHOLE SET, IT DOES NOT APPEND. The array you send is
  the array the task ends up with, and [] removes every example. Omitting the
  key leaves them alone, like everything else here. --body only:
    --body '{"fewShots":[{"input":"2 + 2","output":"4"}]}'
  A fewShots-only PATCH counts as a change and writes a version — but the
  version snapshot covers the task's own fields, NOT its examples, so restoring
  it puts the prompt back and leaves the examples as this call left them.

  CHANGING outputFormat DOES NOT CHANGE THE SCHEMA — send the matching schema in
  the same call, or the task keeps the one it had. Naming a NON-json format and
  a schema together in one body is refused with a 400, because that combination
  could never take effect. A schema on its own is always persisted.

  CHANGING --model-provider DISCARDS THE PROVIDER-SPECIFIC MODEL SETTINGS —
  thinking level, thinking display and reasoning effort are stripped, because
  they mean nothing to the new provider. Nothing in the response says so.

  --custom-model-id ATTACHES A CUSTOM ENDPOINT; CHANGING THE MODEL WITHOUT IT
  DETACHES ONE. A PATCH carrying --model-name or --model-provider and no
  --custom-model-id clears the stored id, so "put this task back on a platform
  model" is exactly that call. A PATCH that touches neither leaves the
  attachment alone. Read it back with "nexus task get <id>" → .customModelId.
  An id belonging to another organization is a 404 here, not a 403, and an
  anthropic- or google-protocol endpoint is a 400 naming the protocol — this
  surface serves "openai" only and refuses at the write rather than at execute.

  EVERY ACCEPTED UPDATE CREATES A VERSION, INCLUDING ONE THAT CHANGES NOTHING.
  The check is whether the body named a recognized field, never whether the
  value differs, so re-sending a byte-identical prompt writes a fresh version
  with a new versionId. A null versionId therefore does NOT mean "your edit
  matched what was stored" — it means the body carried no field this route
  recognizes, and nothing at all was written. Never use it as a no-op detector.

  The duplicate-prompt check does NOT apply to update: two tasks can end up with
  identical prompts by editing one into the other.

  Only one flag per command may read standard input. Passing "-" to two of them
  — "--body -" alongside "--prompt -", say — is refused with an error naming
  both, and no request is sent. Give one of them a literal value or a file path.`
    )
    .action(async (id: string, opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.description !== undefined) flags.description = opts.description;
        if (opts.modelName !== undefined) flags.modelName = opts.modelName;
        if (opts.modelProvider !== undefined) flags.modelProvider = opts.modelProvider;
        if (opts.customModelId !== undefined) flags.customModelId = opts.customModelId;
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
          dashboardUrl: dashboardUrlFor("aiTask", t.id, globals),
          // Null only when the body named no recognized field, so nothing was
          // written. NOT a no-op detector — an update whose values are identical
          // to the stored ones still versions.
          versionId: t.versionId,
          versionCreatedAt: t.versionCreatedAt
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── duplicate ─────────────────────────────────────────────────────────
  const duplicate = task
    .command("duplicate")
    .description("Copy an AI task, optionally onto another model")
    .argument("<id>", "Task ID to copy")
    .option("--name <name>", 'Name for the copy (default: "<source name> (Copy)")')
    .option("--description <text>", "Description for the copy (default: the source's)")
    .option("--model-name <model>", "Run the copy on this model (e.g. claude-haiku-4-5)")
    .addOption(
      enumOption(
        "--model-provider <provider>",
        "Provider of --model-name",
        SKILLS_DUPLICATE_TASK__BODY_MODEL_PROVIDER
      )
    )
    .option(
      "--custom-model-id <id>",
      "Run the copy on a custom model (BYOM) — the id from 'nexus custom-model list'"
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus task duplicate 11111111-1111-4111-8111-111111111111
  $ nexus task duplicate 11111111-1111-4111-8111-111111111111 --name "Assessor v2"
  $ nexus task duplicate 11111111-1111-4111-8111-111111111111 \\
      --name "Assessor (haiku)" --model-name claude-haiku-4-5 --model-provider ANTHROPIC

Notes:
  THIS IS THE COMMAND THE 409 ON "task create" RECOMMENDS, and until this release
  it did not exist — following that error's advice answered
  "error: unknown command 'duplicate'".

  IF THE ONLY DIFFERENCE YOU WANT IS THE MODEL, YOU PROBABLY WANT NO COPY AT ALL.
  "task execute --model-name ... --model-provider ..." runs the existing task on
  another model for that one call, and a workflow's aiTask node takes the same
  override. Two copies of one prompt drift: a rubric change then has to land
  twice, or the bulk path and the on-demand path quietly stop agreeing. Duplicate
  is for a prompt that is genuinely going to diverge.

  THE COPY IS THE SOURCE FOR EVERY FIELD YOU DO NOT NAME — prompt, both JSON
  schemas, few-shots, formats, folder and temperature — everything except the
  task's knowledge collections, which are a permission decision this command does
  not make and so leaves unattached on the copy. That is the difference
  from re-creating the variant with "task create", where a field you leave out
  takes THAT command's default instead: an unsent temperature becomes 0.7 however
  the original was tuned, and nothing reports the change.

  NAMING A MODEL CLEARS THE PROVIDER TUNING, exactly as "task update" does.
  thinkingLevel, thinkingDisplay, reasoningEffort and the rest are specific to a
  provider and a model generation, so they are rebuilt from what you send rather
  than carried across a model change; send them under --body to set them on the
  copy. Omit the model flags and the copy keeps the source's model config whole.

  --model-name AND --model-provider TRAVEL TOGETHER. One without the other is
  refused, because completing the pair from the source task is exactly the silent
  inheritance this command removes. Omit both to copy the source's model.

  A CUSTOM MODEL IS NOT INHERITED WHEN YOU NAME A MODEL. A BYOM endpoint replaces
  the routing outright, so a copy re-pointed at a platform model runs the platform
  model; pass --custom-model-id to point the copy at a custom endpoint instead.

  The copy is a NEW task with a new id, and no version history — versions belong
  to the task they were taken on.`
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
        if (opts.customModelId !== undefined) flags.customModelId = opts.customModelId;

        const body = mergeBodyWithFlags(base, flags);
        const t = await client.skills.duplicateTask(id, asRequestBody<DuplicateTaskBody>(body));
        printSuccess("Task duplicated.", {
          id: t.id,
          name: t.name,
          modelName: t.modelName,
          modelProvider: t.modelProvider
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  confirmable(task.command("delete"))
    .description("Delete an AI task")
    .argument("<id>", "Task ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus task delete 11111111-1111-4111-8111-111111111111
  $ nexus task delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  Fails with 409 if the task is still attached to an agent skill or a
  NON-ARCHIVED workflow. Detach it from those dependents (listed in the error)
  before deleting.
  ARCHIVING THE WORKFLOW RELEASES THE TASK. A workflow stops counting as a
  dependent once it is archived, so "nexus workflow delete <workflow-id>" —
  which archives rather than destroys — clears a 409 you cannot otherwise get
  past. Archiving is permanent, so do it because you meant to retire the
  workflow, not merely to unblock this delete.

  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete task ${id}?`, opts))) return;

        await client.skills.deleteTask(id);
        printSuccess("Task deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── execute ───────────────────────────────────────────────────────────
  const execute = task
    .command("execute")
    .description("Execute an AI task")
    .argument("<id>", "Task ID")
    .requiredOption("--input <text-or-->", "Input text (or '-' for stdin)")
    .option("--model-name <model>", "Run THIS call on this model instead of the task's")
    .addOption(
      enumOption(
        "--model-provider <provider>",
        "Provider of --model-name",
        SKILLS_EXECUTE_TASK__BODY_MODEL_OVERRIDE_MODEL_PROVIDER
      )
    )
    .option(
      "--custom-model-id <id>",
      "Run THIS call on a custom model (BYOM) — the id from 'nexus custom-model list'"
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus task execute 11111111-1111-4111-8111-111111111111 --input "Summarize this email..."
  $ cat document.txt | nexus task execute 11111111-1111-4111-8111-111111111111 --input -
  $ nexus task execute 11111111-1111-4111-8111-111111111111 --input "Hello world" --json
  $ nexus task execute 11111111-1111-4111-8111-111111111111 --body '{"input":"Hello world"}'
  $ nexus task execute 11111111-1111-4111-8111-111111111111 --input "..." \\
      --model-name claude-haiku-4-5 --model-provider ANTHROPIC

Notes:
  --model-name/--model-provider RUN THIS ONE CALL ELSEWHERE AND CHANGE NOTHING.
  The task keeps its own model, its versions are untouched, and every other
  caller of it is unaffected — so one prompt can be swept in bulk on a cheap
  model and run on the frontier model when a human asks for it, instead of being
  copied into two tasks that then drift apart. Both flags are required together;
  one without the other is refused before any request is sent.

    temperature IS ALWAYS THE TASK'S, and is not overridable here. It is part of
    the reasoning rather than the routing, so a "same task, cheaper model" run
    that silently moved it would not be the same task.

    A CUSTOM MODEL IS NOT INHERITED BY AN OVERRIDE. If the task runs on a BYOM
    endpoint and you name a platform model here, the platform model runs; pass
    --custom-model-id to point this call at a custom endpoint instead.

    THE PROVIDER TUNING IS NOT INHERITED BY AN OVERRIDE — not even on the same
    provider. thinkingLevel, thinkingDisplay, reasoningEffort, geminiThinkingLevel
    and kimiReasoningEffort have no flag; name the one you want under --body, or
    the call runs with none:
      --body '{"input":"...","modelOverride":{"modelName":"gpt-5","modelProvider":"OPEN_AI","reasoningEffort":"low"}}'
    Same rule as "task update", because it is the same code — these knobs are
    specific to a provider AND to a model generation, so carrying one across a
    model change is not the safe default it looks like.

  --input accepts literal text, a file path (auto-detected), or '-' for stdin.
  In non-JSON mode, only the output text is printed (not the full response object).
  Long generations are given ${EXECUTE_DEFAULT_TIMEOUT_SECONDS}s by default; override with the global --timeout <seconds>.

  "Prompt is required" HERE MEANS THE TASK WAS CREATED WITHOUT A PROMPT, not
  that --input is wrong. Check with "nexus task get <id> --json | jq -r .prompt"
  and set it with "nexus task update <id> --prompt ...".

  A TASK WHOSE inputFormat IS "JSON" ALSO TAKES A PLAIN STRING. The route
  accepts a string or an object whatever the task's inputFormat, and a
  json-input task fed --input "Paris" still produces the structured output. Send
  an object only when the task genuinely needs several named fields, and send it
  through --body: --body '{"input":{"city":"Paris","country":"FR"}}'. The shape
  the task expects is jsonInputSchema on "task get".

  A CLIENT TIMEOUT DOES NOT STOP THE SERVER. The generation keeps running and is
  still billed after this command gives up — raise --timeout rather than
  re-running, since a re-run starts a second generation.

  A jsonOutputSchema whose root is not an object (a top-level array or scalar)
  fails here with a 400 EVERY time, however well the task saved.

  Only one flag per command may read standard input. Passing "-" to two of them
  — "--body -" alongside "--input -", say — is refused with an error naming
  both, and no request is sent. Give one of them a literal value or a file path.`
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

        const override = buildModelOverrideFlags(opts);
        if (override) flags.modelOverride = override;

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

  // Bound LAST, after every option and after the hand-written prose.
  bindCommand(create, SKILLS_CREATE_TASK_CONTRACT, {
    // Both formats are --body only, and the root help block above already says
    // so. Declaring them here is what stops the gate reading a deliberate
    // omission as a field somebody forgot to expose.
    "Body.inputFormat": "--body only; see the namespace help — lowercase in, uppercase out",
    "Body.outputFormat": "--body only; see the namespace help — lowercase in, uppercase out"
  });
  bindCommand(update, SKILLS_UPDATE_TASK_CONTRACT, {
    "Body.inputFormat": "--body only; see the namespace help — lowercase in, uppercase out",
    "Body.outputFormat": "--body only; see the namespace help — lowercase in, uppercase out"
  });
  bindCommand(duplicate, SKILLS_DUPLICATE_TASK_CONTRACT);
  bindCommand(execute, SKILLS_EXECUTE_TASK_CONTRACT, {
    // The routing pair has flags; the provider TUNING does not, and the note at
    // the command spells out how to send it. Five flags for knobs that are
    // inherited from the task in the common case would bury the two that this
    // command exists to offer.
    "Body.modelOverride.thinkingLevel":
      "--body only under modelOverride; inherited from the task unless the override changes provider",
    "Body.modelOverride.thinkingDisplay":
      "--body only under modelOverride; inherited from the task unless the override changes provider",
    "Body.modelOverride.reasoningEffort":
      "--body only under modelOverride; inherited from the task unless the override changes provider",
    "Body.modelOverride.geminiThinkingLevel":
      "--body only under modelOverride; inherited from the task unless the override changes provider",
    "Body.modelOverride.kimiReasoningEffort":
      "--body only under modelOverride; inherited from the task unless the override changes provider"
  });
}
