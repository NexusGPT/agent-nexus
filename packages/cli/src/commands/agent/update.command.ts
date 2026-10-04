import type { Command } from "commander";

import { enumOption } from "../../contract-binding";
import {
  AGENT_UPDATE__BODY_MODEL,
  AGENT_UPDATE__BODY_MODEL_CONFIG_MODEL_PROVIDER
} from "../agent.contract.generated";
import { type AgentUpdateOptions, runAgentUpdate } from "./update.handler";
import { AGENT_UPDATE_HELP } from "./update.help";

/** `nexus agent update` */
export function registerAgentUpdateCommand(agent: Command, program: Command): Command {
  return agent
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
    .option(
      "--custom-model-id <id>",
      "Attach a custom model (BYOM) — needs --model-name and --model-provider too"
    )
    .option("--prompt <file-or-->", "System prompt (file path, or '-' for stdin)")
    .option(
      "--no-publish",
      "With --prompt: write the draft WITHOUT publishing it, so the live version keeps serving"
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", AGENT_UPDATE_HELP)
    .action(async (id: string, opts: AgentUpdateOptions) => {
      await runAgentUpdate(program, id, opts);
    });
}
