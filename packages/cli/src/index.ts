#!/usr/bin/env node

import { Command } from "commander";

import { getBanner } from "./banner";
import { parseTimeoutSeconds } from "./client";
import { registerAccessCardCommands } from "./commands/access-card";
import { registerAdminCommands } from "./commands/admin";
import { registerAgentCommands } from "./commands/agent";
import { registerAgentCollectionCommands } from "./commands/agent-collection";
import { registerAgentEvalCommands } from "./commands/agent-eval";
import { registerAgentSkillCommands } from "./commands/agent-skill";
import { registerAgentToolCommands } from "./commands/agent-tool";
import { registerAnalyticsCommands } from "./commands/analytics";
import { registerApiCommand } from "./commands/api";
import { registerAssetCommands } from "./commands/asset";
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
import { registerPermissionsCommands } from "./commands/permissions";
import { registerPhoneNumberCommands } from "./commands/phone-number";
import { registerPromptAssistantCommands } from "./commands/prompt-assistant";
import { registerRoleCommands } from "./commands/role";
import { registerSkillFolderCommands } from "./commands/skill-folder";
import { registerSkillsCommands } from "./commands/skills";
import { registerTaskCommands } from "./commands/task";
import { registerTemplateCommands } from "./commands/template";
import { registerTicketCommands } from "./commands/ticket";
import { registerToolCommands } from "./commands/tool";
import { registerTracingCommands } from "./commands/tracing";
import { registerUpgradeCommand, UPGRADE_ALIASES } from "./commands/upgrade";
import { registerUserGroupCommands } from "./commands/user-group";
import { registerVersionCommands } from "./commands/version";
import { registerVibeCommands } from "./commands/vibe";
import { registerWorkflowCommands } from "./commands/workflow";
import { registerWorkspaceCommands } from "./commands/workspace";
import { resolveProfile } from "./config";
import { handleError } from "./errors";
import { isJsonMode, printContextBanner, setJsonMode } from "./output";
import { autoUpdate, checkForUpdate, isAutoUpdateDisabled } from "./util/version-check";

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
  .option(
    "--timeout <seconds>",
    "HTTP request timeout in seconds (default 30; task execute defaults to 600)",
    parseTimeoutSeconds
  )
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
/**
 * The root epilogue — the contract that holds for EVERY command.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE STANDARD THIS HELP IS WRITTEN TO (NEX-3626)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `--help` carries exactly the instruction a prompt would carry, in full. The
 * test is operational: paste a command's `--help` into an agent prompt with no
 * other source available, and the agent must use that command correctly FIRST
 * TIME — including the cases where it would otherwise silently do the wrong
 * thing. If Nexus documentation states something about a command that its
 * `--help` does not, the help is incomplete by definition.
 *
 * What that means per command, and what {@link help-completeness.test.ts}
 * enforces for the namespaces that have been converted:
 *
 *   - an `Examples:` block of REAL invocations, and a `Notes:` block;
 *   - every precondition, and the scope the call needs;
 *   - the exact body shape — which field sits where, and what type it is;
 *   - what a value MEANS, and specifically what null means as distinct from
 *     zero and from absent;
 *   - the destructive consequence, NAMED, including effects on objects the
 *     caller never mentioned;
 *   - what a SILENT FAILURE looks like — the call that answers 2xx and does
 *     not do the thing;
 *   - how to VERIFY the call did what it claims.
 *
 * The form is `nexus role`'s: imperative, consequence-first sentences in a
 * `Notes:` block. `role attach` is the model — "THIS IS A MOVE, NOT AN ADD. A
 * system belongs to exactly ONE Role, so this revokes the previous Role's claim
 * AND the access its members had through it." Copy that. Do not invent a second
 * convention beside it.
 *
 * Facts that hold for MORE THAN ONE command belong here in the root epilogue
 * rather than being repeated per command; facts about one command belong on
 * that command, where the reader is when they need them.
 */
program.addHelpText(
  "after",
  `
Global flags work anywhere in the line, before or after the subcommand:
  --json                 machine-readable output
  --profile <name>       use a named profile instead of the active one
  --api-key <key>        override the key for this invocation
  --base-url <url>       point at another environment
  --timeout <seconds>    client-side only, default 30
  --no-auto-update       do not self-update on exit

READING THE OUTPUT
  --json prints ONE JSON document on STDOUT and nothing else. Warnings, the
  profile banner and progress go to STDERR, so a pipe stays parseable. Without
  --json you get a table, and a table COLUMN IS TRUNCATED TO ITS WIDTH — never
  parse one, and never conclude a value is short because it looked short.
  "-" and a blank cell mean NULL, which is not zero and not false.
  A list command prints only the columns it chose; --json can carry fields the
  table does not show, and a few commands drop response fields from BOTH. When
  a value matters and you cannot see it, "nexus api GET <path>" returns the
  untouched response.

FAILURE
  EVERY failure exits 1. There is no distinct exit code for "not found",
  "forbidden" or "invalid" — read the message, not the status. Under --json an
  error is a JSON document on STDOUT: {"error":{"message","hint"}}.
  --timeout IS CLIENT-SIDE. Hitting it means this CLI stopped waiting; THE
  SERVER MAY STILL BE COMPLETING THE REQUEST. Never retry a write on a timeout
  without checking whether the first one landed.
  A 2xx IS NOT ALWAYS THE THING HAPPENING. Several commands accept and discard
  input, or file a request instead of acting. Where that is true the command's
  own Notes say so and name the verification step — run it.

SENDING A BODY
  --body takes inline JSON, a path ending in .json, or "-" for stdin. An
  explicit flag ALWAYS overrides the same field inside --body.
  A KEY THE SERVER DOES NOT KNOW IS USUALLY DROPPED, NOT REFUSED — a typo'd or
  misplaced field is accepted and silently ignored, so read each command's body
  shape rather than guessing it.
  "nexus ticket create" and "nexus ticket update" take --data, not --body.
  This is the only namespace that does.

SCOPES AND WHO YOU ARE
  Scopes are NOT hierarchical: :write does not imply :delete, and a read scope
  on one surface says nothing about another. A missing scope is a 403, not an
  empty result.
  A key minted for an org MEMBER sees only what that user created on several
  surfaces, so a list can be empty while the organization has rows, and
  somebody else's id answers 404 rather than 403.
  Commands act on the profile's ACTIVE organization. "nexus auth whoami" says
  which. Changing it needs a personal (cross-org) token and
  "nexus auth use-org <orgId>"; an org-scoped key reaches exactly one org by
  construction, so switch profile instead.

Tip: Run "nexus docs" for full documentation, gotchas, and recipes.
     Run "nexus docs <topic>" for a specific section (overview, commands, gotchas, input-output, recipes).
`
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
registerAgentSkillCommands(program);
registerVersionCommands(program);
registerFolderCommands(program);
registerDeploymentCommands(program);
registerWorkflowCommands(program);
registerWorkspaceCommands(program);
registerExecutionCommands(program);
registerDocumentCommands(program);
registerAssetCommands(program);
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
registerPermissionsCommands(program);
registerUserGroupCommands(program);
registerRoleCommands(program);
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

    if (opts.autoUpdate && !isAutoUpdateDisabled()) {
      // Default: auto-update when a new version is detected
      const msg = await autoUpdate(VERSION);
      if (msg) {
        const { color } = await import("./output");
        process.stderr.write(color.green(msg));
      }
    } else {
      // --no-auto-update / NEXUS_NO_AUTO_UPDATE / CI: just show a message like before
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
