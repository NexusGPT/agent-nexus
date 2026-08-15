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
import { registerKnownIssuesCommand } from "./commands/known-issues";
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
import { registerHelpScopeFooter } from "./help-scope";
import { applyKnownIssuesHelpLine } from "./known-issues-help";
import { isJsonMode, printContextBanner, setJsonMode } from "./output";
import { applyProbeBarrierHelpLine } from "./probe-barrier";
import { applyBodySatisfiesRequired } from "./util/body-satisfies-required";
import { refuseMultipleStdinReaders } from "./util/one-stdin-reader";

const { version: VERSION } = require("../package.json") as { version: string };
import { handleError, installArgumentRefusalReporting } from "./errors";
import { autoUpdate, checkForUpdate, isAutoUpdateDisabled } from "./util/version-check";

export { VERSION };

/**
 * BUILD THE ROOT PROGRAM, AND RETURN IT WITHOUT PARSING.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A FUNCTION AND NOT MODULE-LEVEL CODE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This file used to build `program` at module scope and then call
 * `program.help()` and `program.parseAsync(...)`, so IMPORTING it RAN the CLI.
 * Nothing could ever read the tree it builds.
 *
 * Every tool that needs the tree therefore rebuilt one: import the `register*`
 * functions individually, hand them a fresh `Command`, and hope the result
 * matches. That workaround reaches the NAMESPACE registrars and structurally
 * cannot reach the PROGRAM-LEVEL options below, because those are applied to
 * the root object this file builds and immediately consumes.
 *
 * The cost was measured, not predicted:
 *
 *   - `--dashboard-url` and `--timeout` are real global options documented on no
 *     page, because a docs generator cannot enumerate the global set.
 *   - A command-level `.option()` that collides with a global never receives its
 *     value: this program does NOT call `enablePositionalOptions()`, so the root
 *     parses its own options across the whole of argv and consumes the value
 *     first, leaving the subcommand's slot `undefined`. That is silent, and on
 *     `custom-model` it sent this CLI's own authenticated request to a
 *     user-named third-party host. Detecting the CLASS needs the global set,
 *     which needs this function.
 *
 * ── WHY THE DECLARATIONS STAYED IN THIS FILE ─────────────────────────────────
 *
 * The obvious move is to lift all of it into a `root-program.ts` and leave a
 * thin entry behind. That was tried and reverted: FIVE test files derive facts
 * by reading `src/index.ts` AS TEXT — the auto-update flag pair, the registrar
 * wiring, the global set, the generated-docs projection — and every one of them
 * went red naming a file that had simply stopped being where the CLI is
 * declared. Moving the code would have made this package's own gates report a
 * defect that did not exist, in four files belonging to other people.
 *
 * So the side effect moved instead of the declarations. Everything a text scan
 * expects is exactly where it was; only the two statements that must not happen
 * on import are now behind {@link isProcessEntryPoint}.
 *
 * ── WHY THE VERSION IS A PARAMETER ───────────────────────────────────────────
 *
 * It defaults to {@link VERSION}, so every caller that wants the real program
 * keeps calling `buildRootProgram()` and gets the shipped version. The argument
 * exists for the help-scope gate: the footer PRINTS the version, and asserting
 * on it against `VERSION` would compare the file to itself and pass whatever
 * either side said. Injecting a fixed version is what makes that assertion mean
 * something. Nothing in the binary passes one.
 */
export function buildRootProgram(version: string = VERSION): Command {
  const program = new Command()
    .name("nexus")
    .description("Official CLI for the Nexus AI agent platform")
    .version(version, "-v, --version")
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
    // Declaring BOTH forms is what makes the default OFF: commander gives a lone
    // `--no-x` an implicit default of true, and stops doing so once the positive
    // flag exists. So `opts.autoUpdate` is `undefined` unless one is passed, and
    // the `else` branch below — print a notice, install nothing — is the default.
    // Why the default moved (NEX-3708): the updater replaces the directory the
    // running binary lives in, from inside that binary, and cannot relink the
    // global shim itself. A half-applied update leaves the shim pointing at a
    // pnpm hash directory that no longer exists, and then NOTHING in this package
    // runs — including any repair we could write, because Node fails to resolve
    // dist/index.js before our first line executes.
    .option("--auto-update", "Self-update to the latest version on exit (off by default)")
    .option("--no-auto-update", "Do not self-update on exit (the default)")
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
  program.addHelpText("before", getBanner(version));
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
    --auto-update          self-update on exit; OFF by default

  UPDATES
    This CLI does NOT install over itself unless you pass --auto-update. Without
    it you get one line naming the newer version and the command that installs
    it. That is deliberate: a self-install replaces the directory this binary is
    running from and cannot relink the global shim itself, so an interrupted one
    leaves a shim pointing at nothing. Once that happens NO nexus command runs —
    not even --no-auto-update — because the failure is in Node's module
    resolution, before any of this code. Reinstalling is the only repair.

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
    A REQUIRED FLAG IS SATISFIED BY --body TOO. The body key is the flag name in
    camelCase, so --first-name is satisfied by "firstName". A command refuses only
    when the field is in NEITHER place, and says so naming both.
    A KEY THE SERVER DOES NOT KNOW IS USUALLY DROPPED, NOT REFUSED — a typo'd or
    misplaced field is accepted and silently ignored, so read each command's body
    shape rather than guessing it.
    FIVE COMMANDS SPELL THE BODY FLAG --data, ACROSS THREE NAMESPACES:
    "ticket create", "ticket update", "credential update", "access-card create"
    and "access-card update". Every other command spells it --body, and neither
    spelling is accepted where the other is declared — commander refuses the flag
    it does not know, so this costs you a retry rather than a silent drop.
    "html-template render" ALSO TAKES --data AND IT IS NOT A REQUEST BODY: it is
    the data object a template renders against, on a namespace whose create and
    update take --body. Read the command's own Options block, never the
    namespace's.

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

  // The scope footer, on EVERY help screen at every depth. One registration:
  // commander fires `afterAll` on the helped command and all its ancestors.
  // Read `help-scope.ts` before moving, rewording or removing this — the
  // position below the command's own Notes block is the point of it.
  registerHelpScopeFooter(program, version);

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
  registerKnownIssuesCommand(program);
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

  // One stdin, one claimant. Registered BEFORE the seam below, because that
  // seam's pre-action hook reads --body and hooks run in registration order.
  refuseMultipleStdinReaders(program);

  // A required flag is satisfiable from --body. Runs LAST and walks the finished
  // tree, so it needs no cooperation from any command file and no list of
  // participating commands to keep current. See the module docblock.
  applyBodySatisfiesRequired(program);

  // The known-issues pointer, on every command's --help. Walks the FINISHED
  // tree, so it needs no list of participating commands; a namespace added
  // tomorrow carries the line without being registered anywhere. Static text —
  // `--help` must never touch the network. See `known-issues-help.ts`.
  applyKnownIssuesHelpLine(program);

  // Which of the notes above nobody can check for free. Walks the FINISHED tree
  // for the same reason as the line before it, and lands ABOVE the scope footer
  // so the global caveat stays last. See `probe-barrier.ts`.
  applyProbeBarrierHelpLine(program);

  // An argument refusal becomes a throw, so it reaches `handleError` and emits
  // the error document the root epilogue promises. Walks the FINISHED tree for
  // the same reason as the two lines above, and for one more: commander copies
  // `_exitCallback` at subcommand CREATION, so a call on the root alone would
  // reach the root alone. See `installArgumentRefusalReporting`.
  installArgumentRefusalReporting(program);

  return program;
}

/**
 * True only when Node was pointed at this module directly.
 *
 * 🚨 THIS GUARD ONLY EXISTS IN THE BUILT ARTIFACT, SO READING THE SOURCE CANNOT
 * VERIFY IT. Getting it wrong does not degrade the CLI, it DELETES it: the
 * binary would exit 0 having done nothing, silently, on every command. tsup
 * emits a single CJS bundle (`format: ["cjs"]`, `entry: ["src/index.ts"]`) and
 * `package.json` points `bin` at `dist/index.js`, so `require.main === module`
 * is the correct test there — and `pnpm build && node dist/index.js --version`
 * is the only thing that proves it. Run that, not a typecheck, after touching
 * this.
 *
 * Defensive rather than bare because the same source is loaded by vitest
 * through an ESM transform, where `require` and `module` are interop shims and
 * may be absent entirely. Failing closed is right in that direction: a test
 * importing this file must never launch the CLI.
 */
function isProcessEntryPoint(): boolean {
  try {
    return (
      typeof require !== "undefined" && typeof module !== "undefined" && require.main === module
    );
  } catch {
    return false;
  }
}

if (isProcessEntryPoint()) {
  const program = buildRootProgram();

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
}
