import type { Command } from "commander";

import { registerAccessCardCommands } from "./commands/access-card";
import { registerAdminCommands } from "./commands/admin";
import { registerAgentCommands } from "./commands/agent";
import { registerAgentCollectionCommands } from "./commands/agent-collection";
import { registerAgentSkillCommands } from "./commands/agent-skill";
import { registerAgentToolCommands } from "./commands/agent-tool";
import { registerAnalyticsCommands } from "./commands/analytics";
import { registerApiCommand } from "./commands/api";
import { registerAppsCommands } from "./commands/apps";
import { registerAssetCommands } from "./commands/asset";
import { registerAuthCommands } from "./commands/auth";
import { registerChannelCommands } from "./commands/channel";
import { registerChatCommands } from "./commands/chat";
import { registerClaudeCodeCommands } from "./commands/claude-code";
import { registerCloudImportCommands } from "./commands/cloud-import";
import { registerCollectionCommands } from "./commands/collection";
import { registerConversationCommands } from "./commands/conversation";
import { registerCredentialCommands } from "./commands/credential";
import { registerCueCommands } from "./commands/cue";
import { registerCustomModelCommands } from "./commands/custom-model";
import { registerCustomerCommands } from "./commands/customer";
import { registerDeploymentCommands } from "./commands/deployment";
import { registerDocsCommand } from "./commands/docs";
import { registerDocumentCommands } from "./commands/document";
import { registerEmulatorCommands } from "./commands/emulator";
import { registerEvalCommands } from "./commands/eval";
import { registerEvaluationCommands } from "./commands/evaluation";
import { registerExecutionCommands } from "./commands/execution";
import { registerExternalToolCommands } from "./commands/external-tool";
import { registerFolderCommands } from "./commands/folder";
import { registerHtmlMessageTemplateCommands } from "./commands/html-message-template";
import { registerKnownIssuesCommand } from "./commands/known-issues";
import { registerMcpCommands } from "./commands/mcp";
import { registerMcpServerCommands } from "./commands/mcp-server";
import { registerModelCommands } from "./commands/model";
import { registerPermissionsCommands } from "./commands/permissions";
import { registerPhoneNumberCommands } from "./commands/phone-number";
import { registerPromptCommands } from "./commands/prompt";
import { registerPromptAssistantCommands } from "./commands/prompt-assistant";
import { registerRoleCommands } from "./commands/role";
import { registerScoreCommands } from "./commands/score";
import { registerSkillFolderCommands } from "./commands/skill-folder";
import { registerSkillsCommands } from "./commands/skills";
import { registerTaskCommands } from "./commands/task";
import { registerTemplateCommands } from "./commands/template";
import { registerTicketCommands } from "./commands/ticket";
import { registerToolCommands } from "./commands/tool";
import { registerTracingCommands } from "./commands/tracing";
import { registerTracksCommands } from "./commands/tracks";
import { registerUpgradeCommand } from "./commands/upgrade";
import { registerUserGroupCommands } from "./commands/user-group";
import { registerVersionCommands } from "./commands/version";
import { registerWorkflowCommands } from "./commands/workflow";
import { registerWorkspaceCommands } from "./commands/workspace";

/**
 * EVERY NAMESPACE THE ROOT PROGRAM WIRES, AND THE ORDER IT WIRES THEM IN.
 *
 * 🚨 THIS FILE IS READ AS TEXT BY TWO SPECS, SO ITS SHAPE IS LOAD-BEARING AND
 * NOT STYLE. `src/util/route-id.test.ts` matches the IMPORT STATEMENTS above to
 * rebuild the whole tree without importing the entry point, and
 * `src/util/body-satisfies-required.test.ts` matches the `register*(program);`
 * CALLS below and asserts, in both directions, that they are exactly the
 * one-argument `register*` exports `src/commands/` declares. Keep one import per
 * registrar and one call per line; a registrar wired in a loop, behind a
 * conditional, or through an alias is invisible to both and silently shrinks the
 * population every other spec in those files measures.
 *
 * ⚠️ THE ORDER IS BEHAVIOUR, NOT TASTE. Commander prints `addHelpText` blocks in
 * registration order and `contract-binding.help-order.test.ts` captures the
 * rendered help of every bound command, so reordering these calls can move a
 * generated contract block above a command's own Examples. The root sets
 * `configureHelp({ sortSubcommands: true })`, so this order does NOT decide how
 * the namespaces are listed on the root screen — only what each leaf renders.
 *
 * The declarations live here rather than in `index.ts` because that file is the
 * package entry point and this is 54 imports plus 54 calls; it carries only the
 * ten lines that compose them. Nothing here imports `index.ts` or
 * `root-program.ts` back — `import/no-cycle` is `warn` in
 * `packages/config/eslint/base-flat.js` and this package runs
 * `eslint . --max-warnings 9` sitting at 8.
 */
export function registerNamespaces(program: Command): void {
  registerAuthCommands(program);
  registerAdminCommands(program);
  registerAgentCommands(program);
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
  registerScoreCommands(program);
  registerMcpCommands(program);
  registerMcpServerCommands(program);
  registerExternalToolCommands(program);
  registerPromptAssistantCommands(program);
  registerPromptCommands(program);
  registerEvalCommands(program);
  registerSkillFolderCommands(program);
  registerModelCommands(program);
  registerCustomModelCommands(program);
  registerPhoneNumberCommands(program);
  registerChannelCommands(program);
  registerChatCommands(program);
  registerTracingCommands(program);
  registerTracksCommands(program);
  registerCueCommands(program);
  registerCredentialCommands(program);
  registerCustomerCommands(program);
  registerAccessCardCommands(program);
  registerPermissionsCommands(program);
  registerUserGroupCommands(program);
  registerRoleCommands(program);
  registerClaudeCodeCommands(program);
  registerSkillsCommands(program);
  registerCloudImportCommands(program);
  registerAppsCommands(program);
  registerUpgradeCommand(program);
  registerDocsCommand(program);
}
