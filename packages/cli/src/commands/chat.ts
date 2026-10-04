import { Command } from "commander";

import { bindCommand } from "../contract-binding";
import {
  CHAT_RESUME_STREAM_CONTRACT,
  CHAT_SEND_MESSAGE_STREAM_CONTRACT,
  CHAT_STOP_TURN_CONTRACT,
  CHAT_TURN_STATUS_CONTRACT,
  DEPLOYMENT_CHAT_SESSION_CREATE_CONTRACT
} from "./chat.contract.generated";
import { CHAT_HELP } from "./chat/chat-help";
import { registerChatResumeCommand } from "./chat/resume.command";
import { registerChatSendCommand } from "./chat/send.command";
import { registerChatSessionCommand } from "./chat/session.command";
import { registerChatStatusCommand } from "./chat/status.command";
import { registerChatStopCommand } from "./chat/stop.command";

/**
 * `nexus chat` — the headless chat surface, driven from a terminal.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * TWO HOPS, AND THIS COMMAND PERFORMS BOTH SO THE SHAPE IS VISIBLE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `chat send` mints a session with the org API key and then streams the turn
 * with the SESSION TOKEN — never with the API key. That is the customer's own
 * architecture executed in one command: hop one belongs on their server, hop two
 * is what their browser does. Anyone reading `--help` sees the split, and
 * `chat session` exists so the first hop can be run on its own and the token
 * handed to a browser or to `curl`.
 *
 * 🔴 THE SECOND HOP CARRIES NO API KEY, AND THAT IS NOT AN OPTIMISATION. The
 * server tries the api-key credential first and short-circuits on it, so a
 * request carrying both is refused 401 with a message that reads like an expired
 * token. The SDK enforces the exclusivity; this command could not send both if
 * it tried.
 */

export function registerChatCommands(program: Command): void {
  const chat = program
    .command("chat")
    .description("Talk to a deployment's agent over the headless chat API");

  chat.addHelpText("after", CHAT_HELP);

  const session = registerChatSessionCommand(chat, program);
  const send = registerChatSendCommand(chat, program);
  const stop = registerChatStopCommand(chat, program);
  const status = registerChatStatusCommand(chat, program);
  const resume = registerChatResumeCommand(chat, program);

  // Bound LAST, after every option exists — see `bindCommand`. One descriptor
  // per leaf, one per HOP.
  bindCommand(session, DEPLOYMENT_CHAT_SESSION_CREATE_CONTRACT);
  bindCommand(send, CHAT_SEND_MESSAGE_STREAM_CONTRACT);
  bindCommand(stop, CHAT_STOP_TURN_CONTRACT);
  bindCommand(status, CHAT_TURN_STATUS_CONTRACT);
  bindCommand(resume, CHAT_RESUME_STREAM_CONTRACT);
}
