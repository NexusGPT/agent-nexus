import type { CreateCustomModelBody } from "@agent-nexus/sdk";
import { type Command, Option } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { satisfiedByBodyField } from "../../util/body-satisfies-required";
import { booleanFlag } from "../../util/boolean-flag";
import {
  CUSTOM_MODEL_CREATE__BODY_PROTOCOL,
  CUSTOM_MODEL_CREATE_CONTRACT
} from "../custom-model.contract.generated";
import { CREATE_NOTES } from "./copy/create-notes";

/** `nexus custom-model create` */
export function registerCustomModelCreateCommand(customModel: Command, program: Command): void {
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
    .addHelpText("after", CREATE_NOTES)
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

  // Bound LAST, after every option exists: `bindCommand` reads the command's own
  // options to find the divergences it must render, so an option added after it
  // would be invisible to the block already composed.
  bindCommand(create, CUSTOM_MODEL_CREATE_CONTRACT);
}
