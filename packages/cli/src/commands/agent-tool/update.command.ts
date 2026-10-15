import type { UpdateAgentToolBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { TOOL_UPDATE__BODY_TYPE, TOOL_UPDATE_CONTRACT } from "../agent-tool.contract.generated";

const UPDATE_HELP = `
Examples:
  $ nexus agent-tool update 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --label "Renamed Tool"
  $ nexus agent-tool update 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --no-fire-and-forget
  $ nexus agent-tool update 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --type WORKFLOW --config '{"workflowId":"8f1c2d3e-4a5b-4c7d-8e9f-0a1b2c3d4e5f"}'
  $ nexus agent-tool update 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --body '{"type":"WORKFLOW","config":{"workflowId":"8f1c2d3e-4a5b-4c7d-8e9f-0a1b2c3d4e5f"}}'

Notes:
  SEND --type WHENEVER YOU SEND --config. Omitting it is a 400 — "Must include
  \`type\` when updating \`config\`" — because the config shape is validated against
  the type it belongs to.
  --config REPLACES THE STORED CONFIG WHOLESALE. Keys you leave out are gone, so
  read the current config and send it back complete:
    $ cfg=$(nexus agent-tool get 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --json | jq -c '.config')
    # edit $cfg, then:
    $ nexus agent-tool update 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --type WORKFLOW --config "$cfg"
  NEVER SEND agentInputSchema: null HERE. Send {} to fall back to the schema
  derived from config.parameters, or send the schema whole — those are the two
  supported ways to change it. The same flat-vs-wrapped rule as create applies.
  THE PROMPT-PARAMETER RULE APPLIES HERE TOO, AND A SCHEMA-ONLY UPDATE IS CHECKED
  AGAINST THE STORED config.parameters. Sending a schema that drops a parameter
  whose handler is "prompt" is a 400 naming it — leaving --config out does NOT
  leave that parameter behind, it leaves it unfillable. An update that carries no
  agentInputSchema at all (a rename, --no-fire-and-forget) is never re-checked.
  --fire-and-forget ends the agent's turn at the call and hides the tool's output
  from the model; --no-fire-and-forget is the way back to waiting for the result.
  This command prints only the id — confirm with "nexus agent-tool get".`;

/** `nexus agent-tool update` */
export function registerAgentToolUpdateCommand(agentTool: Command, program: Command): void {
  const update = agentTool
    .command("update")
    .description("Update a tool configuration")
    .argument("<agent-id>", "Agent ID")
    .argument("<tool-id>", "Tool config ID")
    .option("--label <label>", "New label")
    // `--type` exists here because the API REQUIRES `type` alongside any `config`
    // update (wholesale-replace semantics, validated against the type). Without
    // this flag, `--config` on its own could only ever produce that 400, so the
    // flag the CLI already shipped was unusable except through --body.
    .addOption(
      enumOption("--type <type>", "Tool type (REQUIRED with --config)", TOOL_UPDATE__BODY_TYPE)
    )
    .option("--config <json>", "Updated configuration as JSON (wholesale replace — send it whole)")
    .option("--fire-and-forget", "Trigger and end the turn — the agent never sees the result")
    .option("--no-fire-and-forget", "Wait for tool execution (default)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", UPDATE_HELP)
    .action(async (agentId: string, toolId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.label !== undefined) flags.label = opts.label;
        if (opts.type !== undefined) flags.type = opts.type;
        if (opts.fireAndForget !== undefined) flags.fireAndForget = opts.fireAndForget;
        // See agent-tool create: --config is the nested API field, not a
        // flatten-into-body alias.
        if (opts.config) flags.config = JSON.parse(opts.config);

        const body = mergeBodyWithFlags(base, flags);

        await client.agents.tools.update(agentId, toolId, asRequestBody<UpdateAgentToolBody>(body));
        printSuccess("Tool updated.", { id: toolId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(update, TOOL_UPDATE_CONTRACT);
}
