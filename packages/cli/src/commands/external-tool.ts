import type { Command } from "commander";

import { registerExternalToolCreateCommand } from "./external-tool/create.command";
import { registerExternalToolDeleteCommand } from "./external-tool/delete.command";
import { registerExternalToolExecuteCommand } from "./external-tool/execute.command";
import { registerExternalToolGetCommand } from "./external-tool/get.command";
import { registerExternalToolInitiateOauthCommand } from "./external-tool/initiate-oauth.command";
import { registerExternalToolListCommand } from "./external-tool/list.command";
import { registerExternalToolTestCommand } from "./external-tool/test.command";
import { registerExternalToolTestAuthCommand } from "./external-tool/test-auth.command";
import { registerExternalToolUpdateCommand } from "./external-tool/update.command";
import { registerExternalToolUpdateAuthCommand } from "./external-tool/update-auth.command";
import { registerExternalToolUpdateSpecCommand } from "./external-tool/update-spec.command";
import { registerExternalToolUploadIconCommand } from "./external-tool/upload-icon.command";

/**
 * `nexus external-tool …` — external tools (OpenAPI integrations).
 *
 * ## Five concerns, and every leaf takes a different input
 *
 * The tool RECORD (list, get, create, update, delete), its ICON (upload-icon),
 * its AUTH (initiate-oauth, update-auth, test-auth), its INVOCATION (execute,
 * test) and its SPEC (update-spec). No two leaves in this namespace share an
 * input shape or a printer, which is why it is one file per subcommand.
 *
 * 🚨 THE CALL ORDER BELOW IS THE PUBLISHED ORDER AND IS NOT ALPHABETICAL.
 * Commander emits `--help` in registration order, and `content/docs/cli/commands/
 * external-tool.mdx` is generated from that tree — so sorting these calls
 * rewrites a published page and reds `cli-docs-are-generated`. The imports above
 * are sorted because lint wants them sorted; the CALLS keep the original order.
 *
 * ## What each leaf owns
 *
 * `bindCommand` runs at the END of each leaf's own file, after that leaf's
 * options exist — the same ordering the single call site here used to give, and
 * the shape every other split namespace in this package already uses.
 * `initiate-oauth`, `update-auth`, `test-auth`, `execute` and `update-spec`
 * reach routes the v1 contract does not declare, so they stay unbound and each
 * says so in its own docblock.
 */
export function registerExternalToolCommands(program: Command): void {
  const externalTool = program
    .command("external-tool")
    .description("Manage external tools (OpenAPI integrations)");

  registerExternalToolListCommand(externalTool, program); //          the record
  registerExternalToolGetCommand(externalTool, program); //           the record
  registerExternalToolCreateCommand(externalTool, program); //        the record
  registerExternalToolUploadIconCommand(externalTool, program); //    its icon
  registerExternalToolInitiateOauthCommand(externalTool, program); // its auth
  registerExternalToolUpdateAuthCommand(externalTool, program); //    its auth
  registerExternalToolTestAuthCommand(externalTool, program); //      its auth
  registerExternalToolExecuteCommand(externalTool, program); //       invoking it
  registerExternalToolTestCommand(externalTool, program); //          invoking it
  registerExternalToolUpdateCommand(externalTool, program); //        the record
  registerExternalToolUpdateSpecCommand(externalTool, program); //    its spec
  registerExternalToolDeleteCommand(externalTool, program); //        the record
}
