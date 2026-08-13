import fs from "node:fs";
import path from "node:path";

import type { CreateAgentBody, UpdateAgentBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError } from "../errors";
import { color, printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { resolveInputValue } from "../util/stdin";
import {
  AGENT_CREATE__BODY_MODEL,
  AGENT_CREATE__BODY_MODEL_CONFIG_MODEL_PROVIDER,
  AGENT_CREATE_CONTRACT,
  AGENT_LIST__PARAMS_STATUS,
  AGENT_LIST_CONTRACT,
  AGENT_UPDATE__BODY_MODEL,
  AGENT_UPDATE__BODY_MODEL_CONFIG_MODEL_PROVIDER,
  AGENT_UPDATE_CONTRACT
} from "./agent.contract.generated";

export function registerAgentCommands(program: Command): void {
  const agent = program.command("agent").description("Manage AI agents");

  agent.addHelpText(
    "after",
    `
Every <id> argument is the agent UUID reported by "nexus agent list".

Three facts that decide whether a write does what you meant:
  • objective, tone, explanation and behaviour are REMOVED fields. Sending any
    of them — as a flag or inside --body — is a 400 DEPRECATED_FIELDS. Every
    behavioural rule now belongs in the system prompt, set with --prompt.
  • THE PROMPT IS NOT A COLUMN. --prompt creates and publishes a CHECKPOINT
    version, and create/update print only the id — read the prompt back with
    "nexus agent get", which carries it at top-level .prompt.
  • model READS "DEFAULT", NOT null, ON AN AGENT THAT WAS NEVER GIVEN ONE, so a
    "model === null" test never fires. It is the legacy enum, and the model
    actually used is modelConfig.modelName, which create defaults to
    gpt-5.6-sol / OPEN_AI.`
  );

  // ── list ──────────────────────────────────────────────────────────────
  const list = addPaginationOptions(
    agent
      .command("list")
      .description("List agents")
      .addOption(enumOption("--status <status>", "Filter by status", AGENT_LIST__PARAMS_STATUS))
      .option("--search <query>", "Search by name or role")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus agent list
  $ nexus agent list --limit 5 --status ACTIVE
  $ nexus agent list --search "support" --json

Notes:
  Results are paginated. Use --page/--limit. Check meta.hasMore in --json output.
  --page defaults to 1 and --limit to 20. A --limit above 100 is REFUSED with a
  400 rather than clamped, so a script asking for 500 receives no rows at all.
  --status takes ACTIVE or DRAFT — the public spelling of the internal
  PUBLISHED / DRAFT. An agent created through this API is ACTIVE.
  --search matches first name, last name and role, case-insensitively.
  THE TABLE PRINTS NO MODEL COLUMN, and the --json row carries only the legacy
  "model" enum — never modelConfig. Read the model actually in use with
  "nexus agent get <id>" → modelConfig.modelName.`
      )
  );

  list.action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.agents.list({
        ...getPaginationParams(opts),
        status: opts.status,
        search: opts.search
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "firstName", label: "FIRST NAME", width: 15 },
        { key: "lastName", label: "LAST NAME", width: 15 },
        { key: "role", label: "ROLE", width: 25 },
        { key: "status", label: "STATUS", width: 10 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── get ───────────────────────────────────────────────────────────────
  agent
    .command("get")
    .description("Get agent details")
    .argument("<id>", "Agent ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent get abc-123
  $ nexus agent get abc-123 --json

Notes:
  The system prompt is at top-level .prompt, and is null until a version has
  been published. The table above never shows it — use --json.
  .prompt IS THE DRAFT, NOT WHAT THE AGENT RUNS. A published agent serves its
  production version, so after "nexus version restore" this field changes and
  the running agent does not. "nexus version --help" owns that distinction.
  .prompt IS NOT BARE MARKDOWN. Your text arrives wrapped in Nexus section
  directives — a "::: section: name=…" line, then a "::: tab: NEXUS :::" line,
  then the text. Feeding that whole string straight back to
  "nexus agent update --prompt" round-trips it: the wrapper is not applied a
  second time. Strip the directives only if you want the sections gone.
  MODEL reads "DEFAULT", not null, on an agent that was never given one — a
  "model === null" test never fires. modelConfig.modelName and
  modelConfig.modelProvider are the model in use, mirrored at top level as
  modelName / modelProvider.
  modelConfig itself reads null whenever the stored config is missing either
  modelName or modelProvider, because half a config cannot be published — the
  top-level mirrors still answer, so read those before concluding "no model".
  --json also carries bio, tags, gender and playgroundFirstMessage, which the
  table omits.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const agent = await client.agents.get(id);
        printRecord(agent, [
          { key: "id", label: "ID" },
          { key: "firstName", label: "First Name" },
          { key: "lastName", label: "Last Name" },
          { key: "role", label: "Role" },
          { key: "status", label: "Status" },
          { key: "model", label: "Model" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  const create = agent
    .command("create")
    .description("Create a new agent")
    .requiredOption("--first-name <name>", "Agent first name (REQUIRED, min 1 char)")
    .requiredOption("--last-name <name>", "Agent last name (REQUIRED, min 1 char)")
    .requiredOption("--role <role>", "Agent role, e.g. 'Customer Support' (REQUIRED, min 1 char)")
    .option("--bio <text>", "Full biography")
    .option("--short-bio <text>", "Short biography for cards")
    .addOption(enumOption("--model <model>", "Model ID (legacy enum)", AGENT_CREATE__BODY_MODEL))
    .option("--model-name <name>", "Model name (e.g. gpt-4o, claude-sonnet-4-6)")
    .addOption(
      enumOption(
        "--model-provider <provider>",
        "Model provider",
        AGENT_CREATE__BODY_MODEL_CONFIG_MODEL_PROVIDER
      )
    )
    .option("--prompt <file-or-->", "System prompt (file path, or '-' for stdin)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent create --first-name Ada --last-name Lovelace --role "Assistant"
  $ nexus agent create --first-name Bot --last-name Helper --role "Support" --model-name gpt-4o --model-provider OPEN_AI
  $ cat prompt.md | nexus agent create --first-name Ada --last-name Lovelace --role "Assistant" --prompt -
  $ nexus agent create --body '{"firstName":"Ada","lastName":"Lovelace","role":"Assistant"}'

Notes:
  --first-name, --last-name and --role are REQUIRED and must each carry at least
  one character; the API refuses an empty string. Nothing else is required.
  objective, tone, explanation and behaviour are REMOVED fields — sending any of
  them, as a flag or inside --body, is a 400 DEPRECATED_FIELDS. Behavioural rules
  go in the system prompt via --prompt.
  PASS BOTH MODEL FLAGS OR NEITHER. --model-name alone fills the provider with
  OPEN_AI and --model-provider alone fills the name with gpt-5.6-sol, so
  "--model-provider ANTHROPIC" stores an OpenAI model name under Anthropic and
  nothing reports it. Omitting both stores gpt-5.6-sol / OPEN_AI. Take the pair
  from "nexus model list" (modelId → --model-name, provider → --model-provider).
  --prompt accepts a file path (auto-detected), literal text, or '-' for stdin.
  It publishes a CHECKPOINT version rather than writing a column; over 1,000,000
  characters is a 400. Omit it to start with no prompt at all.
  --body accepts JSON string, .json file, or '-' for stdin. Flags override --body
  fields. It also takes shortBio, bio, tags, gender, playgroundFirstMessage,
  model (the legacy enum) and modelConfig{modelName, modelProvider, thinkingLevel,
  reasoningEffort, geminiThinkingLevel, kimiReasoningEffort, temperature}.
  TAGS IS ONE STRING DESPITE THE PLURAL NAME. Sending an array is a 400 naming
  the field; put your own separator inside the string.
  AN UNKNOWN --body KEY IS SILENTLY STRIPPED, not refused. A typo returns 201
  having ignored the field, so check spelling against the list above.
  Only one flag per command may read standard input. Passing "-" to two of them
  — "--body -" alongside "--prompt -", say — is refused with an error naming
  both, and no request is sent. Give one of them a literal value or a file path.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.firstName !== undefined) flags.firstName = opts.firstName;
        if (opts.lastName !== undefined) flags.lastName = opts.lastName;
        if (opts.role !== undefined) flags.role = opts.role;
        if (opts.bio !== undefined) flags.bio = opts.bio;
        if (opts.shortBio !== undefined) flags.shortBio = opts.shortBio;
        if (opts.model !== undefined) flags.model = opts.model;
        if (opts.modelName !== undefined || opts.modelProvider !== undefined) {
          flags.modelConfig = {
            modelName: opts.modelName ?? "gpt-5.6-sol",
            modelProvider: opts.modelProvider ?? "OPEN_AI"
          };
        }
        if (opts.prompt) flags.prompt = await resolveInputValue(opts.prompt);

        const body = mergeBodyWithFlags(base, flags);

        const agent = await client.agents.create(asRequestBody<CreateAgentBody>(body));
        printSuccess("Agent created.", {
          id: agent.id,
          name: `${agent.firstName} ${agent.lastName}`
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  const update = agent
    .command("update")
    .description("Update an agent")
    .argument("<id>", "Agent ID")
    .option("--first-name <name>", "Agent first name")
    .option("--last-name <name>", "Agent last name")
    .option("--role <role>", "Agent role")
    .option("--bio <text>", "Full biography")
    .option("--short-bio <text>", "Short biography")
    .addOption(enumOption("--model <model>", "Model ID (legacy enum)", AGENT_UPDATE__BODY_MODEL))
    .option("--model-name <name>", "Model name (e.g. gpt-4o, claude-sonnet-4-6)")
    .addOption(
      enumOption(
        "--model-provider <provider>",
        "Model provider",
        AGENT_UPDATE__BODY_MODEL_CONFIG_MODEL_PROVIDER
      )
    )
    .option("--prompt <file-or-->", "System prompt (file path, or '-' for stdin)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent update abc-123 --role "Senior Assistant"
  $ echo "You are helpful" | nexus agent update abc-123 --prompt -
  $ nexus agent update abc-123 --model-name gpt-4o --model-provider OPEN_AI
  $ nexus agent update abc-123 --body '{"shortBio":"Handles refunds"}'

Notes:
  objective, tone, explanation and behaviour are REMOVED fields — sending any of
  them is a 400 DEPRECATED_FIELDS. Behavioural rules go in the prompt.
  --prompt publishes a NEW CHECKPOINT version; there is no mutable prompt field.
  This command prints only the id, so confirm the write with
  "nexus agent get <id>" → .prompt. Over 1,000,000 characters is a 400.
  ON AN AGENT THAT ALREADY HAS A PROMPT, ONE --prompt WRITES TWO VERSION ROWS:
  an AUTO snapshot of the prompt it is about to overwrite, then the CHECKPOINT
  carrying the new text, which it publishes. "version list" therefore grows by
  two per write, not one. That AUTO row is the undo — it holds the prompt you
  just replaced, so rolling back means publishing IT, not the CHECKPOINT above
  it. The first --prompt on an agent that never had one writes a single row.
  ONE MODEL FLAG MERGES, BOTH REPLACE. --model-name or --model-provider alone is
  merged into the stored modelConfig, keeping temperature and thinking level;
  sending both replaces the whole config and DROPS those settings. To change the
  model and keep them, send --body '{"modelConfig":{...}}' carrying every field.
  A PATCH whose only field is --prompt writes nothing on the agent row and still
  answers 200 — the version write is the change, not a no-op.
  Every field is optional, but the ones you do send must be non-empty:
  --first-name, --last-name and --role each still require at least one character.
  An unknown --body key is silently stripped, exactly as on create.
  Only one flag per command may read standard input. Passing "-" to two of them
  — "--body -" alongside "--prompt -", say — is refused with an error naming
  both, and no request is sent. Give one of them a literal value or a file path.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.firstName !== undefined) flags.firstName = opts.firstName;
        if (opts.lastName !== undefined) flags.lastName = opts.lastName;
        if (opts.role !== undefined) flags.role = opts.role;
        if (opts.bio !== undefined) flags.bio = opts.bio;
        if (opts.shortBio !== undefined) flags.shortBio = opts.shortBio;
        if (opts.model !== undefined) flags.model = opts.model;
        if (opts.modelName !== undefined && opts.modelProvider !== undefined) {
          flags.modelConfig = {
            modelName: opts.modelName,
            modelProvider: opts.modelProvider
          };
        } else if (opts.modelName !== undefined) {
          flags.modelName = opts.modelName;
        } else if (opts.modelProvider !== undefined) {
          flags.modelProvider = opts.modelProvider;
        }
        if (opts.prompt) flags.prompt = await resolveInputValue(opts.prompt);

        const body = mergeBodyWithFlags(base, flags);

        const agent = await client.agents.update(id, asRequestBody<UpdateAgentBody>(body));
        printSuccess("Agent updated.", { id: agent.id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  agent
    .command("delete")
    .description("Delete an agent")
    .argument("<id>", "Agent ID")
    .option("--yes", "Skip confirmation")
    .option("--dry-run", "Preview without deleting")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent delete abc-123
  $ nexus agent delete abc-123 --yes
  $ nexus agent delete abc-123 --dry-run

Notes:
  THE PROMPT ONLY APPEARS ON A TTY. In a script, a pipeline or CI there is no
  confirmation and no --yes is needed — it deletes immediately.
  --dry-run previews without deleting.
  Answers 200 with {id, deleted: true} — NOT 204, and not the deleted record.
  SOFT BY DEFAULT. The organization's deletion policy decides, its seeded value
  is SOFT, and a DeletedAgent tombstone keeps preserved agentId references
  resolvable. A second delete of the same id is a 404.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (opts.dryRun) {
          const agent = await client.agents.get(id);
          console.log(
            color.yellow("DRY RUN:") +
              ` Would delete agent "${agent.firstName} ${agent.lastName}" (${id})`
          );
          return;
        }

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          const answer = await rl.question(`Delete agent ${id}? This cannot be undone. [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.agents.delete(id);
        printSuccess("Agent deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── duplicate ─────────────────────────────────────────────────────────
  agent
    .command("duplicate")
    .description("Duplicate an agent")
    .argument("<id>", "Agent ID to duplicate")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent duplicate abc-123
  $ nexus agent duplicate abc-123 --json

Notes:
  THE COPY IS AS CAPABLE AS THE ORIGINAL. It carries the prompt and a fresh row
  for every tool config, credential ids included, so it can act on the same
  accounts from the moment it exists.
  Knowledge collections are RE-CONNECTED, not copied: both agents point at the
  same collection, so editing that collection changes both.
  The copy gets a new id and starts with no published version history.

  THREE THINGS DO NOT SURVIVE, AND NONE OF THEM RAISES AN ERROR:
  TOOL LABELS ARE REWRITTEN. Every label is lowercased and every character that
  is not a letter or digit becomes an underscore, so "Order lookup" and
  "zz-t5" arrive as "order_lookup" and "zz_t5". A collision gets a numeric
  suffix. Mentions inside the copied prompt are remapped for you, so the copy is
  self-consistent — but anything OUTSIDE Nexus that names a tool by its old
  label, a workflow, a script, a runbook, now names nothing.
  A TOOL CONFIG YOUR ORG CANNOT REACH IS DROPPED, NOT COPIED. Duplicating an
  agent from another organization keeps only the configs whose workflow, task,
  collection, plugin or template your org actually holds; the rest are skipped
  and their prompt mentions are rewritten to plain text. The copy answers 201
  with fewer tools than the original and nothing says which went — count with
  "nexus agent-tool list <new-id>" against the source before trusting it.
  ATTACHED CLAUDE CODE SKILLS ARE DROPPED. The copy starts with none; re-attach
  them with "nexus agent-skill add-preset" or "nexus agent-skill create".`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const agent = await client.agents.duplicate(id);
        printSuccess("Agent duplicated.", {
          id: agent.id,
          name: `${agent.firstName} ${agent.lastName}`
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── upload-profile-picture ────────────────────────────────────────────
  agent
    .command("upload-profile-picture")
    .description("Upload a profile picture for an agent")
    .argument("<id>", "Agent ID")
    .requiredOption("--file <path>", "Path to the image file")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent upload-profile-picture abc-123 --file ./avatar.png

Notes:
  The file is read locally first, so a missing path fails before any request.
  Maximum 10 MB — a larger file is a 413 with the stream aborted mid-flight.
  IT REPLACES the agent's current picture; there is no undo and no dry run.
  Answers {profilePicture: <url>}.`
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
        const result = await client.agents.uploadProfilePicture(id, blob);
        printSuccess("Profile picture uploaded.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── generate-profile-picture ──────────────────────────────────────────
  agent
    .command("generate-profile-picture")
    .description("Generate an AI profile picture for an agent")
    .argument("<id>", "Agent ID")
    .option("--prompt <text>", "Custom prompt to guide image style")
    .option("--body <json>", "Request body as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent generate-profile-picture abc-123
  $ nexus agent generate-profile-picture abc-123 --prompt "flat vector, teal background"

Notes:
  The image is generated from the agent's OWN name and role. --prompt only
  steers the style, is sent as customPrompt, and is capped at 2000 characters.
  IT REPLACES the agent's current picture as soon as generation succeeds.
  Answers {profilePicture, sizes} — sizes carries the optimized variants.
  Generation calls out to an image model, so this is the slowest agent command.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, opts.prompt ? { customPrompt: opts.prompt } : {});
        const result = await client.agents.generateProfilePicture(
          id,
          asRequestBody<{ customPrompt?: string }>(body)
        );
        printSuccess("Profile picture generated.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  //
  // The four TUNING enums under modelConfig have no flag and are declared
  // body-only rather than exposed. They are not interchangeable knobs: each one
  // belongs to ONE provider family (thinkingLevel and reasoningEffort to
  // OpenAI-shaped models, geminiThinkingLevel to Google, kimiReasoningEffort to
  // Kimi), and three of the four are silently ignored for whatever provider you
  // picked. Four flags whose validity depends on the value of a fifth is a worse
  // surface than one JSON object, and --body already carries the whole
  // modelConfig.
  const TUNING_IS_PROVIDER_SPECIFIC =
    "set it inside --body's modelConfig — the field only applies to one provider family, " +
    "so a flag would advertise it for every model";

  const MODEL_CONFIG_TUNING = {
    "Body.modelConfig.thinkingLevel": TUNING_IS_PROVIDER_SPECIFIC,
    "Body.modelConfig.reasoningEffort": TUNING_IS_PROVIDER_SPECIFIC,
    "Body.modelConfig.geminiThinkingLevel": TUNING_IS_PROVIDER_SPECIFIC,
    "Body.modelConfig.kimiReasoningEffort": TUNING_IS_PROVIDER_SPECIFIC
  };

  bindCommand(list, AGENT_LIST_CONTRACT);
  bindCommand(create, AGENT_CREATE_CONTRACT, MODEL_CONFIG_TUNING);
  bindCommand(update, AGENT_UPDATE_CONTRACT, MODEL_CONFIG_TUNING);
}
