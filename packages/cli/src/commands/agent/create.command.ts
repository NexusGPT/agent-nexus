import type { CreateAgentBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { enumOption } from "../../contract-binding";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { resolveInputValue } from "../../util/stdin";
import {
  AGENT_CREATE__BODY_MODEL,
  AGENT_CREATE__BODY_MODEL_CONFIG_MODEL_PROVIDER
} from "../agent.contract.generated";
import { AGENT_CREATE_HELP } from "./create.help";

/** `nexus agent create` */
export function registerAgentCreateCommand(agent: Command, program: Command): Command {
  return agent
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
    .option(
      "--custom-model-id <id>",
      "Run on a custom model (BYOM) — the id from 'nexus custom-model list'"
    )
    .option("--prompt <file-or-->", "System prompt (file path, or '-' for stdin)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", AGENT_CREATE_HELP)
    .action(async (opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);

        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.firstName !== undefined) flags.firstName = opts.firstName;
        if (opts.lastName !== undefined) flags.lastName = opts.lastName;
        if (opts.role !== undefined) flags.role = opts.role;
        if (opts.bio !== undefined) flags.bio = opts.bio;
        if (opts.shortBio !== undefined) flags.shortBio = opts.shortBio;
        if (opts.model !== undefined) flags.model = opts.model;
        if (
          opts.modelName !== undefined ||
          opts.modelProvider !== undefined ||
          opts.customModelId !== undefined
        ) {
          flags.modelConfig = {
            modelName: opts.modelName ?? "gpt-5.6-sol",
            modelProvider: opts.modelProvider ?? "OPEN_AI",
            // The custom model rides INSIDE modelConfig — there is no top-level
            // mirror for it, unlike modelName / modelProvider.
            ...(opts.customModelId !== undefined && { customModelId: opts.customModelId })
          };
        }
        if (opts.prompt) flags.prompt = await resolveInputValue(opts.prompt);

        const body = mergeBodyWithFlags(base, flags);

        const agent = await client.agents.create(asRequestBody<CreateAgentBody>(body));
        printSuccess("Agent created.", {
          id: agent.id,
          name: `${agent.firstName} ${agent.lastName}`,
          dashboardUrl: dashboardUrlFor("agent", agent.id, globals)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
