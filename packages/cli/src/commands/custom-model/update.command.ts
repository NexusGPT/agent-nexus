import type { UpdateCustomModelBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { booleanFlag } from "../../util/boolean-flag";
import {
  CUSTOM_MODEL_UPDATE__BODY_PROTOCOL,
  CUSTOM_MODEL_UPDATE_CONTRACT
} from "../custom-model.contract.generated";

/** `nexus custom-model update` */
export function registerCustomModelUpdateCommand(customModel: Command, program: Command): void {
  const update = customModel
    .command("update")
    .description("Update a custom model")
    .argument("<id>", "Custom model ID")
    .option("--display-name <name>", "Display name")
    .option("--model-name <name>", "API model ID")
    // See the create command: --base-url / --api-key are GLOBAL flags and a
    // subcommand can never receive them. Here they were OPTIONAL, so nothing
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

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(update, CUSTOM_MODEL_UPDATE_CONTRACT);
}
