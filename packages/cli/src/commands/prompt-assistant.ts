import { Command } from "commander";

import { bindCommand } from "../contract-binding";
import { PROMPT_ASSISTANT_CHAT_CONTRACT } from "./prompt-assistant.contract.generated";
import { registerPromptAssistantAwaitThreadCommand } from "./prompt-assistant/await-thread.command";
import { registerPromptAssistantChatCommand } from "./prompt-assistant/chat.command";
import { registerPromptAssistantDeleteThreadCommand } from "./prompt-assistant/delete-thread.command";
import { registerPromptAssistantGetThreadCommand } from "./prompt-assistant/get-thread.command";
import { registerPromptAssistantListThreadsCommand } from "./prompt-assistant/list-threads.command";

export function registerPromptAssistantCommands(program: Command): void {
  const pa = program.command("prompt-assistant").description("AI-powered prompt writing assistant");

  const chat = registerPromptAssistantChatCommand(pa, program);
  registerPromptAssistantListThreadsCommand(pa, program);
  registerPromptAssistantGetThreadCommand(pa, program);
  registerPromptAssistantAwaitThreadCommand(pa, program);
  registerPromptAssistantDeleteThreadCommand(pa, program);

  // Bound LAST, after every option and after the hand-written prose.
  bindCommand(chat, PROMPT_ASSISTANT_CHAT_CONTRACT);
}
