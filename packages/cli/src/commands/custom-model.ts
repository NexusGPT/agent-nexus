import type { CreateCustomModelBody, UpdateCustomModelBody } from "@agent-nexus/sdk";
import { Command, Option } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { satisfiedByBodyField } from "../util/body-satisfies-required";
import { booleanFlag } from "../util/boolean-flag";
import { confirmable, confirmDestructive } from "../util/confirm";
import {
  CUSTOM_MODEL_CREATE__BODY_PROTOCOL,
  CUSTOM_MODEL_CREATE_CONTRACT,
  CUSTOM_MODEL_DELETE_CONTRACT,
  CUSTOM_MODEL_GET_CONTRACT,
  CUSTOM_MODEL_UPDATE__BODY_PROTOCOL,
  CUSTOM_MODEL_UPDATE_CONTRACT
} from "./custom-model.contract.generated";

export function registerCustomModelCommands(program: Command): void {
  const customModel = program
    .command("custom-model")
    .description("Manage custom AI models with OpenAI-compatible endpoints");

  // ── list ──────────────────────────────────────────────────────────────
  customModel
    .command("list")
    .description("List custom models")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus custom-model list
  $ nexus custom-model list --json

Notes:
  THIS COMMAND SEES A DISABLED MODEL AND "nexus model list" DOES NOT. The merge
  behind that command filters on enabled, so an endpoint you switched off is
  absent there and still here. This listing is the only complete one.

  IT RETURNS EVERY ROW, NEWEST FIRST. The route reads the whole organization in
  one array ordered by creation time — there is no filter, no --page and no
  --limit, so slice it downstream or not at all.

  THE TABLE SHOWS 5 OF 8 FIELDS. A row carries id, displayName, modelName,
  baseUrl, protocol, enabled, createdAt and updatedAt; baseUrl and the two
  timestamps are under --json only. No read anywhere returns the apiKey — see
  "nexus custom-model get".

  THE ID COLUMN IS WHAT MAKES A MODEL SELECTABLE, through --custom-model-id on
  "nexus agent create", "nexus agent update", "nexus task create" and
  "nexus task update". Searching "nexus model list" for your modelName instead
  finds nothing and proves nothing: that table has no modelName column, and the
  row it does print carries provider "CUSTOM_<PROTOCOL>" and modelId
  "custom:<uuid>", neither of which any command accepts as an input.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.customModels.list();
        const items = result;

        printList(items, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "displayName", label: "NAME", width: 25 },
          { key: "modelName", label: "MODEL", width: 25 },
          { key: "protocol", label: "PROTOCOL", width: 10 },
          {
            key: "enabled",
            label: "ENABLED",
            width: 8,
            format: (v) => (v ? "yes" : "no")
          }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── get ────────────────────────────────────────────────────────────────
  const get = customModel
    .command("get")
    .description("Get custom model details")
    .argument("<id>", "Custom model ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus custom-model get 11111111-1111-4111-8111-111111111111
  $ nexus custom-model get 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE apiKey IS WRITE-ONLY AND NEVER COMES BACK. It is encrypted on write and
  kept in a column no read selects, so get, list, create and update all return
  the same eight fields: id, displayName, modelName, baseUrl, protocol,
  enabled, createdAt and updatedAt. Its absence here is the design and not a
  dropped write — and because no read confirms which key is stored, the way to
  recover from a wrong one is to ROTATE rather than to check:
  "nexus custom-model update <id> --endpoint-key <key>".`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const model = await client.customModels.get(id);
        printRecord(model, [
          { key: "id", label: "ID" },
          { key: "displayName", label: "Display Name" },
          { key: "modelName", label: "Model Name" },
          { key: "baseUrl", label: "Base URL" },
          { key: "protocol", label: "Protocol" },
          { key: "enabled", label: "Enabled", format: (v) => (v ? "yes" : "no") },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  const create = customModel
    .command("create")
    .description("Create a custom model")
    .requiredOption("--display-name <name>", "Human-readable display name")
    .requiredOption("--model-name <name>", "API model ID (e.g. llama-3-70b)")
    // NOT --base-url / --api-key. Those are GLOBAL flags naming the NEXUS API,
    // and the root parses its own options across the whole of argv, so a
    // subcommand option of the same name never receives a value: this command
    // was refused outright ("required option '--base-url' not specified") while
    // the URL and key the user typed were applied to the CLI's own transport
    // instead. See src/util/global-option-shadowing.ts — the gate that now
    // refuses a new collision.
    //
    // The flag name and the body field DIFFER here, and that is forced: the
    // matching names are taken by globals. `satisfiedByBodyField` declares the
    // join, so `--body '{"baseUrl":…}'` satisfies the requirement and a refusal
    // names `baseUrl` rather than the flag's camelCase `endpointUrl` — a key the
    // server discards.
    .addOption(
      satisfiedByBodyField(
        new Option("--endpoint-url <url>", "OpenAI-compatible API base URL (HTTPS) → baseUrl"),
        "baseUrl"
      ).makeOptionMandatory()
    )
    .addOption(
      satisfiedByBodyField(
        new Option("--endpoint-key <key>", "API key for the custom endpoint → apiKey"),
        "apiKey"
      ).makeOptionMandatory()
    )
    // No commander default: `CreateCustomModelBodySchema` already applies
    // `.default("openai")`, and a default here is not distinguishable from an
    // explicit flag, so it merged over `--body`'s own `protocol` every time.
    .addOption(
      enumOption(
        "--protocol <protocol>",
        "Inference protocol (default: openai)",
        CUSTOM_MODEL_CREATE__BODY_PROTOCOL
      )
    )
    .option("--enabled <bool>", "Create it disabled — true or false", booleanFlag)
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus custom-model create --display-name "My LLaMA" --model-name llama-3-70b \\
      --endpoint-url https://api.example.com/v1 --endpoint-key sk-xxx
  $ nexus custom-model create --display-name "Staging LLaMA" --model-name llama-3-70b \\
      --endpoint-url https://api.example.com/v1 --endpoint-key sk-xxx --enabled false
  $ nexus custom-model create --body '{"displayName":"My Model","modelName":"gpt-4","baseUrl":"https://api.example.com/v1","apiKey":"sk-xxx"}'

Notes:
  --endpoint-url AND --endpoint-key DESCRIBE THE MODEL PROVIDER, NOT NEXUS. They
  fill the body's baseUrl and apiKey. The global --base-url and --api-key point
  the CLI at a Nexus environment and are a different thing entirely; passing the
  provider's values there sends this CLI's own authenticated request to the
  provider's host, carrying the provider key as the Nexus key.

  A 201 MEANS STORED, NEVER "WORKS". Nothing contacts the endpoint while the
  model is created — no reachability probe, no auth check, no test completion.
  An unreachable baseUrl and a dead apiKey both create cleanly and surface only
  when an agent or a task first runs on the model, as an inference failure far
  from this command. Prove it yourself before pointing anything at it, and use
  --enabled false to keep it out of reach until you have.

  CREATING IT ATTACHES IT TO NOTHING. The id this returns is what selects it,
  through the --custom-model-id flag on "nexus agent create", "nexus agent
  update", "nexus task create" and "nexus task update". Each of those commands
  documents its own rules for the flag; on agent update it needs --model-name
  and --model-provider beside it.
  "nexus model list" also shows the row while it is ENABLED, with provider
  "CUSTOM_<PROTOCOL>" and modelId "custom:<uuid>". Neither string is an input,
  and a custom model is selected by this id alone. A DISABLED model is filtered
  out of that listing and is still here, and still attachable — attaching is a
  configuration act; the refusal for a disabled endpoint lands at inference.

  --protocol DECIDES WHICH SURFACES CAN RUN IT. Agents serve openai, anthropic
  and google. AI tasks serve "openai" only, because their providers are shared
  singletons that would have to cache your key: "nexus task create
  --custom-model-id" refuses the other two with a 400 naming the protocol, and
  the executor refuses again if the protocol changes after a task is attached.
  Pick openai if the model has to run inside a task.`
    )
    .action(async (opts) => {
      try {
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.displayName !== undefined && { displayName: opts.displayName }),
          ...(opts.modelName !== undefined && { modelName: opts.modelName }),
          ...(opts.endpointUrl !== undefined && { baseUrl: opts.endpointUrl }),
          ...(opts.endpointKey !== undefined && { apiKey: opts.endpointKey }),
          ...(opts.protocol !== undefined && { protocol: opts.protocol }),
          ...(opts.enabled !== undefined && { enabled: opts.enabled })
        });

        const client = createClient(program.optsWithGlobals());
        const model = await client.customModels.create(asRequestBody<CreateCustomModelBody>(body));
        printSuccess("Custom model created.", {
          id: model.id,
          displayName: model.displayName
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  const update = customModel
    .command("update")
    .description("Update a custom model")
    .argument("<id>", "Custom model ID")
    .option("--display-name <name>", "Display name")
    .option("--model-name <name>", "API model ID")
    // See the create command above: --base-url / --api-key are GLOBAL flags and
    // a subcommand can never receive them. Here they were OPTIONAL, so nothing
    // was refused — the request simply left out baseUrl/apiKey and went to the
    // provider's host with the provider's key in the api-key header.
    .option("--endpoint-url <url>", "Provider's API base URL → baseUrl")
    .option("--endpoint-key <key>", "Provider's API key → apiKey")
    .addOption(
      enumOption("--protocol <protocol>", "Inference protocol", CUSTOM_MODEL_UPDATE__BODY_PROTOCOL)
    )
    .option("--enabled <bool>", "Enable/disable — true or false", booleanFlag)
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus custom-model update 11111111-1111-4111-8111-111111111111 --display-name "Renamed Model"
  $ nexus custom-model update 11111111-1111-4111-8111-111111111111 --enabled false
  $ nexus custom-model update 11111111-1111-4111-8111-111111111111 --endpoint-key sk-newkey

Notes:
  --endpoint-url AND --endpoint-key DESCRIBE THE MODEL PROVIDER, NOT NEXUS. The
  global --base-url and --api-key point the CLI at a Nexus environment; they do
  not rotate this model's credentials and never reach the request body.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.displayName !== undefined) flags.displayName = opts.displayName;
        if (opts.modelName !== undefined) flags.modelName = opts.modelName;
        if (opts.endpointUrl !== undefined) flags.baseUrl = opts.endpointUrl;
        if (opts.endpointKey !== undefined) flags.apiKey = opts.endpointKey;
        if (opts.protocol !== undefined) flags.protocol = opts.protocol;
        if (opts.enabled !== undefined) flags.enabled = opts.enabled;
        const body = mergeBodyWithFlags(base, flags);

        await client.customModels.update(id, asRequestBody<UpdateCustomModelBody>(body));
        printSuccess("Custom model updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  const remove = customModel
    .command("delete")
    .description("Delete a custom model")
    .argument("<id>", "Custom model ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus custom-model delete 11111111-1111-4111-8111-111111111111
  $ nexus custom-model delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  IT PROMPTS, AND OFF A TERMINAL THAT PROMPT IS A REFUSAL. --yes is required in
  CI or in a pipe; without it and without a TTY the command declines rather than
  proceeding on a default.
  NOTHING HERE TELLS YOU WHAT IS USING THE ENDPOINT. An agent or an AI task
  selecting this model by --custom-model-id is not listed, and this command does
  not look. Check before deleting, not after.
  The argument is the row's own UUID from "custom-model list" — not the modelId
  and not the display name, neither of which selects a row.`
    )
    .action(async (id: string, opts) => {
      try {
        if (!(await confirmDestructive(`Delete custom model ${id}? This cannot be undone.`, opts)))
          return;

        const client = createClient(program.optsWithGlobals());
        await client.customModels.delete(id);
        printSuccess("Custom model deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists: `bindCommand` reads the command's own
  // options to find the divergences it must render, so an option added after it
  // would be invisible to the block already composed.
  //
  // `list` is absent on purpose — `CustomModelList` carries no input schema at
  // all, so there is nothing to bind and nothing to print.
  bindCommand(get, CUSTOM_MODEL_GET_CONTRACT);
  bindCommand(create, CUSTOM_MODEL_CREATE_CONTRACT);
  bindCommand(update, CUSTOM_MODEL_UPDATE_CONTRACT);
  bindCommand(remove, CUSTOM_MODEL_DELETE_CONTRACT);
  confirmable(remove);
}
