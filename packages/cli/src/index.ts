#!/usr/bin/env node

import { Command } from "commander";

import { getBanner } from "./banner";
import { registerAccessCardCommands } from "./commands/access-card";
import { registerAdminCommands } from "./commands/admin";
import { registerAgentCommands } from "./commands/agent";
import { registerAgentCollectionCommands } from "./commands/agent-collection";
import { registerAgentEvalCommands } from "./commands/agent-eval";
import { registerAgentToolCommands } from "./commands/agent-tool";
import { registerAnalyticsCommands } from "./commands/analytics";
import { registerApiCommand } from "./commands/api";
// Commands
import { registerAuthCommands } from "./commands/auth";
import { registerChannelCommands } from "./commands/channel";
import { registerClaudeCodeCommands } from "./commands/claude-code";
import { registerCloudImportCommands } from "./commands/cloud-import";
import { registerCollectionCommands } from "./commands/collection";
import { registerConversationCommands } from "./commands/conversation";
import { registerCredentialCommands } from "./commands/credential";
import { registerCustomModelCommands } from "./commands/custom-model";
import { registerCustomerCommands } from "./commands/customer";
import { registerDeploymentCommands } from "./commands/deployment";
import { registerDocsCommand } from "./commands/docs";
import { registerDocumentCommands } from "./commands/document";
import { registerEmulatorCommands } from "./commands/emulator";
import { registerEvaluationCommands } from "./commands/evaluation";
import { registerExecutionCommands } from "./commands/execution";
import { registerExternalToolCommands } from "./commands/external-tool";
import { registerFolderCommands } from "./commands/folder";
import { registerHtmlMessageTemplateCommands } from "./commands/html-message-template";
import { registerModelCommands } from "./commands/model";
import { registerPhoneNumberCommands } from "./commands/phone-number";
import { registerPromptAssistantCommands } from "./commands/prompt-assistant";
import { registerSkillFolderCommands } from "./commands/skill-folder";
import { registerSkillsCommands } from "./commands/skills";
import { registerTaskCommands } from "./commands/task";
import { registerTemplateCommands } from "./commands/template";
import { registerTicketCommands } from "./commands/ticket";
import { registerToolCommands } from "./commands/tool";
import { registerTracingCommands } from "./commands/tracing";
import { registerUpgradeCommand, UPGRADE_ALIASES } from "./commands/upgrade";
import { registerVersionCommands } from "./commands/version";
import { registerVibeCommands } from "./commands/vibe";
import { registerWorkflowCommands } from "./commands/workflow";
import { registerWorkspaceCommands } from "./commands/workspace";
import { resolveProfile } from "./config";
import { handleError } from "./errors";
import { isJsonMode, printContextBanner, setJsonMode } from "./output";
import { autoUpdate, checkForUpdate } from "./util/version-check";

const { version: VERSION } = require("../package.json") as { version: string };

const program = new Command()
  .name("nexus")
  .description("Official CLI for the Nexus AI agent platform")
  .version(VERSION, "-v, --version")
  .option("--json", "Output as JSON")
  .option("--api-key <key>", "Override API key for this invocation")
  .option("--base-url <url>", "Override API base URL")
  .option("--dashboard-url <url>", "Override dashboard URL (for browser links)")
  .option("--profile <name>", "Use a specific named profile")
  .option("--no-auto-update", "Disable automatic updates when a new version is detected")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    if (opts.json) setJsonMode(true);

    // Show context banner (skip for auth/upgrade/version — they handle their own output)
    const cmdName = thisCommand.name();
    const skipBanner = [
      "auth",
      "upgrade",
      "version",
      "login",
      "logout",
      "whoami",
      "switch",
      "list",
      "pin",
      "unpin",
      "status",
      "docs",
      "claude-code",
      "skills",
      ...UPGRADE_ALIASES
    ].includes(cmdName);
    if (!skipBanner && !isJsonMode()) {
      try {
        const resolved = resolveProfile(opts);
        printContextBanner(resolved);
      } catch {
        // No profile configured — skip banner, the command will error later
      }
    }
  });

// Prepend banner to top-level --help only (not subcommands)
program.addHelpText("before", getBanner(VERSION));
program.addHelpText(
  "after",
  `\nTip: Run "nexus docs" for full documentation, gotchas, and recipes.\n     Run "nexus docs <topic>" for a specific section (overview, commands, gotchas, input-output, recipes).\n`
);

program.configureHelp({
  sortSubcommands: true
});

// Register all command groups
registerAuthCommands(program);
registerAdminCommands(program);
registerAgentCommands(program);
registerAgentEvalCommands(program);
registerAgentCollectionCommands(program);
registerAgentToolCommands(program);
registerVersionCommands(program);
registerFolderCommands(program);
registerDeploymentCommands(program);
registerWorkflowCommands(program);
registerWorkspaceCommands(program);
registerExecutionCommands(program);
registerDocumentCommands(program);
registerCollectionCommands(program);
registerConversationCommands(program);
registerTaskCommands(program);
registerToolCommands(program);
registerAnalyticsCommands(program);
registerTicketCommands(program);
registerApiCommand(program);
registerEmulatorCommands(program);
registerEvaluationCommands(program);
registerTemplateCommands(program);
registerHtmlMessageTemplateCommands(program);
registerExternalToolCommands(program);
registerPromptAssistantCommands(program);
registerSkillFolderCommands(program);
registerModelCommands(program);
registerCustomModelCommands(program);
registerPhoneNumberCommands(program);
registerChannelCommands(program);
registerTracingCommands(program);
registerCredentialCommands(program);
registerCustomerCommands(program);
registerAccessCardCommands(program);
registerClaudeCodeCommands(program);
registerSkillsCommands(program);
registerCloudImportCommands(program);
registerVibeCommands(program);
registerUpgradeCommand(program);
registerDocsCommand(program);

// If no arguments, show help (which includes the banner)
if (process.argv.length <= 2) {
  program.help();
}

program
  .parseAsync(process.argv)
  .then(async () => {
    if (isJsonMode()) return;

    // Skip auto-update when running `nexus upgrade` (or any alias) — it handles its own update
    const ranCommand = process.argv[2];
    if (ranCommand === "upgrade" || UPGRADE_ALIASES.includes(ranCommand)) return;

    const opts = program.opts();

    if (opts.autoUpdate) {
      // Default: auto-update when a new version is detected
      const msg = await autoUpdate(VERSION);
      if (msg) {
        const { color } = await import("./output");
        process.stderr.write(color.green(msg));
      }
    } else {
      // --no-auto-update: just show a message like before
      const updateMsg = await checkForUpdate(VERSION);
      if (updateMsg) {
        const { color } = await import("./output");
        process.stderr.write(color.yellow(updateMsg));
      }
    }
  })
  .catch((err) => {
    process.exitCode = handleError(err);
  });
