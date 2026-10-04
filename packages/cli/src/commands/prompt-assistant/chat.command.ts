import type { Command } from "commander";

import { enumOption } from "../../contract-binding";
import { PROMPT_ASSISTANT_CHAT__BODY_MODE } from "../prompt-assistant.contract.generated";
import { parseWaitSeconds } from "./_shared/parsers";
import { DEFAULT_WAIT_SECONDS } from "./_shared/wait-timings";
import { type PromptAssistantChatOptions, runPromptAssistantChat } from "./chat.handler";
import { PROMPT_ASSISTANT_CHAT_HELP } from "./chat.help";

/** `nexus prompt-assistant chat` */
export function registerPromptAssistantChatCommand(pa: Command, program: Command): Command {
  return pa
    .command("chat")
    .description("Send a message to the prompt assistant")
    .option("--message <text-or->", "Message text (or '-' for stdin)")
    .addOption(
      enumOption(
        "--mode <mode>",
        "Which assistant answers this turn",
        PROMPT_ASSISTANT_CHAT__BODY_MODE
      )
    )
    .option("--thread-id <id>", "Thread ID for multi-turn conversations")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .option("--wait", "Block until the prompt is written, then print it")
    .option(
      "--wait-timeout <seconds>",
      `How long --wait blocks (default ${DEFAULT_WAIT_SECONDS})`,
      parseWaitSeconds
    )
    .addHelpText("after", PROMPT_ASSISTANT_CHAT_HELP)
    .action(async (opts: PromptAssistantChatOptions) => {
      await runPromptAssistantChat(program, opts);
    });
}
