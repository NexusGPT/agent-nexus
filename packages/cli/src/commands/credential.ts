import { Command } from "commander";

import { registerCredentialConnectCommand } from "./credential/connect.command";
import { registerCredentialConnectStatusCommand } from "./credential/connect-status.command";
import { registerCredentialDeleteCommand } from "./credential/delete.command";
import { registerCredentialGetCommand } from "./credential/get.command";
import { registerCredentialListCommand } from "./credential/list.command";
import { registerCredentialUpdateCommand } from "./credential/update.command";

/**
 * `nexus credential` — the unified credential inventory.
 *
 * This file is wiring and nothing else. Each leaf owns its options, its
 * hand-written Notes and its `bindCommand` call, in that order; the ordering is
 * PER COMMAND, so the generated reference still lands below that command's
 * Notes exactly as it did when every leaf lived here.
 *
 * ⚠️ `connect` keeps its four `refuse()` calls INSIDE its own `.action(` body,
 * and that is a requirement rather than a style choice — see the 🚨 in
 * `credential/connect.command.ts`. The gate that checks those messages models a
 * command as `.command(` + `.option("--body <json` + `.action(` in ONE file, so
 * extracting the branch logic drops them from its population with nothing going
 * red.
 */
export function registerCredentialCommands(program: Command): void {
  const credential = program
    .command("credential")
    .description("Manage credentials (OAuth, API keys, tool credentials)");

  // Registration ORDER is the published surface: commander renders subcommands
  // in declaration order, so this sequence matches the pre-split file's.
  registerCredentialConnectCommand(credential, program);
  registerCredentialConnectStatusCommand(credential, program);
  registerCredentialListCommand(credential, program);
  registerCredentialGetCommand(credential, program);
  registerCredentialUpdateCommand(credential, program);
  registerCredentialDeleteCommand(credential, program);
}
