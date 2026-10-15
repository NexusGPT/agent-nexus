import type { Command } from "commander";

import { registerAccessCardCommands } from "../access-card";
import { registerAgentCommands } from "../agent";
import { registerAgentCollectionCommands } from "../agent-collection";
import { registerAgentSkillCommands } from "../agent-skill";
import { registerAgentToolCommands } from "../agent-tool";
import { registerAnalyticsCommands } from "../analytics";
import { registerAppsCommands } from "../apps";
import { registerAssetCommands } from "../asset";
import { registerChannelCommands } from "../channel";
import { registerChatCommands } from "../chat";
import { registerCloudImportCommands } from "../cloud-import";
import { registerCollectionCommands } from "../collection";
import type { GeneratedNamespaceName } from "../contract-help.ledger";
import { registerConversationCommands } from "../conversation";
import { registerCredentialCommands } from "../credential";
import { registerCueCommands } from "../cue";
import { registerCustomModelCommands } from "../custom-model";
import { registerCustomerCommands } from "../customer";
import { registerDeploymentCommands } from "../deployment";
import { registerDocsCommand } from "../docs";
import { registerDocumentCommands } from "../document";
import { registerEmulatorCommands } from "../emulator";
import { registerEvalCommands } from "../eval";
import { registerEvaluationCommands } from "../evaluation";
import { registerExecutionCommands } from "../execution";
import { registerExternalToolCommands } from "../external-tool";
import { registerFolderCommands } from "../folder";
import { registerHtmlMessageTemplateCommands } from "../html-message-template";
import { registerKnownIssuesCommand } from "../known-issues";
import { registerMcpServerCommands } from "../mcp-server";
import { registerPermissionsCommands } from "../permissions";
import { registerPhoneNumberCommands } from "../phone-number";
import { registerPromptCommands } from "../prompt";
import { registerPromptAssistantCommands } from "../prompt-assistant";
import { registerRoleCommands } from "../role";
import { registerScoreCommands } from "../score";
import { registerSkillFolderCommands } from "../skill-folder";
import { registerTaskCommands } from "../task";
import { registerTemplateCommands } from "../template";
import { registerTicketCommands } from "../ticket";
import { registerToolCommands } from "../tool";
import { registerTracingCommands } from "../tracing";
import { registerTracksCommands } from "../tracks";
import { registerUserGroupCommands } from "../user-group";
import { registerVersionCommands } from "../version";
import { registerWorkflowCommands } from "../workflow";
import { registerWorkspaceCommands } from "../workspace";

/**
 * EVERY LEDGER NAMESPACE, PAIRED WITH THE REGISTRAR THAT BUILDS IT.
 *
 * 🚨 THIS IS THE FILE THAT IMPORTS EVERY COMMAND MODULE, AND IT HOLDS NOTHING
 * ELSE FOR THAT REASON. A registrar is a VALUE, so naming one pulls in its
 * command file and the `*.contract.generated.ts` that file imports — which the
 * generator has not written yet during the one check that proves its output is
 * current. `contract-help.ledger.ts` is the list, imports nothing, and owns that
 * argument in full; `contract-help.namespaces.ts` is the barrel and owns why the
 * registrars are NAMED here rather than discovered from the directory.
 *
 * Keyed by `GeneratedNamespaceName`, so this map is exhaustive BY COMPILATION: a
 * namespace added to the ledger with no registrar does not build, and a
 * registrar named for a namespace the ledger does not hold does not build
 * either. That is what stops the split becoming two lists that drift.
 *
 * ⚠️ KEEP THE PROSE HERE SHORT. This map grows by two lines — an import and a
 * row — every time a namespace is converted, so a long header here is a 150-line
 * cap that a future conversion walks into. Argument goes in the barrel.
 *
 * Ordered as the ledger is, so the two read side by side.
 */
export const NAMESPACE_REGISTRARS: Record<GeneratedNamespaceName, (program: Command) => void> = {
  analytics: registerAnalyticsCommands,
  "custom-model": registerCustomModelCommands,
  deployment: registerDeploymentCommands,
  credential: registerCredentialCommands,
  "prompt-assistant": registerPromptAssistantCommands,
  task: registerTaskCommands,
  workflow: registerWorkflowCommands,
  "access-card": registerAccessCardCommands,
  agent: registerAgentCommands,
  channel: registerChannelCommands,
  conversation: registerConversationCommands,
  document: registerDocumentCommands,
  permissions: registerPermissionsCommands,
  "phone-number": registerPhoneNumberCommands,
  ticket: registerTicketCommands,
  tool: registerToolCommands,
  tracing: registerTracingCommands,
  tracks: registerTracksCommands,
  version: registerVersionCommands,
  role: registerRoleCommands,
  "agent-tool": registerAgentToolCommands,
  collection: registerCollectionCommands,
  folder: registerFolderCommands,
  "skill-folder": registerSkillFolderCommands,
  template: registerTemplateCommands,
  "user-group": registerUserGroupCommands,
  workspace: registerWorkspaceCommands,
  "agent-skill": registerAgentSkillCommands,
  "external-tool": registerExternalToolCommands,
  "agent-collection": registerAgentCollectionCommands,
  asset: registerAssetCommands,
  "cloud-import": registerCloudImportCommands,
  cue: registerCueCommands,
  chat: registerChatCommands,
  docs: registerDocsCommand,
  emulator: registerEmulatorCommands,
  "html-template": registerHtmlMessageTemplateCommands,
  "task-eval": registerEvaluationCommands,
  customer: registerCustomerCommands,
  execution: registerExecutionCommands,
  apps: registerAppsCommands,
  "known-issues": registerKnownIssuesCommand,
  score: registerScoreCommands,
  prompt: registerPromptCommands,
  eval: registerEvalCommands,
  "mcp-server": registerMcpServerCommands
};
