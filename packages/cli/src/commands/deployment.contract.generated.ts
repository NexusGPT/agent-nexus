// GENERATED FILE — DO NOT EDIT BY HAND.
// Source: packages/types/src/api/public/v1/contract/, via z.toJSONSchema.
// Regenerate: pnpm --filter @agent-nexus/cli run gen:contract-help
//
// NOTHING UNDER `src/` RE-DERIVES THIS. That needs Zod, which the published
// binary does not depend on, so `commands/contract-help.test.ts` checks the
// flags against this data and says so in its own header — it cannot tell you
// the data is current. `scripts/generated-drift.mjs` is what does: it
// regenerates and requires a byte-exact match, at review time in the
// `Generated config` job of pr-checks.yml and again on every push to
// staging/main.
//
// 🚨 THIS FILE IS ONE OF TWO OPINIONS, NEVER THE AUTHORITY. Where the CLI offers
// fewer values than the contract lists, the reason is declared at the flag in
// `deployment.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const DEPLOYMENT_CREATE__BODY_TYPE = {
  path: "DeploymentCreate.Body.type",
  contractValues: [
    "GMAIL",
    "OUTLOOK",
    "IMAP",
    "SMTP",
    "SLACK",
    "TEAMS",
    "TELEGRAM",
    "FB_MESSENGER",
    "INSTAGRAM",
    "WHATSAPP",
    "TWILIO_SMS",
    "TWILIO_VOICE",
    "GOOGLE_SHEETS",
    "EXCEL_ADDIN",
    "OUTLOOK_ADDIN",
    "POWERPOINT_ADDIN",
    "WORD_ADDIN",
    "AIRTABLE",
    "GOOGLE_MEET",
    "ZOOM",
    "EMBED",
    "API"
  ]
} as const satisfies ContractEnum;

export const DEPLOYMENT_LIST__PARAMS_TYPE = {
  path: "DeploymentList.Params.type",
  contractValues: [
    "GMAIL",
    "OUTLOOK",
    "IMAP",
    "SMTP",
    "SLACK",
    "TEAMS",
    "TELEGRAM",
    "FB_MESSENGER",
    "INSTAGRAM",
    "WHATSAPP",
    "TWILIO_SMS",
    "TWILIO_VOICE",
    "GOOGLE_SHEETS",
    "EXCEL_ADDIN",
    "OUTLOOK_ADDIN",
    "POWERPOINT_ADDIN",
    "WORD_ADDIN",
    "AIRTABLE",
    "GOOGLE_MEET",
    "ZOOM",
    "EMBED",
    "API"
  ]
} as const satisfies ContractEnum;

export const DEPLOYMENT_UPDATE_EMBED_CONFIG__BODY_FORMAT = {
  path: "DeploymentUpdateEmbedConfig.Body.format",
  contractValues: [
    "bubble",
    "classic"
  ]
} as const satisfies ContractEnum;

export const DEPLOYMENT_UPDATE_EMBED_CONFIG__BODY_BUBBLE_POSITION = {
  path: "DeploymentUpdateEmbedConfig.Body.bubblePosition",
  contractValues: [
    "bottom-right",
    "bottom-left",
    "top-right",
    "top-left"
  ]
} as const satisfies ContractEnum;

export const DEPLOYMENT_UPDATE_EMBED_CONFIG__BODY_BUBBLE_BORDER_RADIUS = {
  path: "DeploymentUpdateEmbedConfig.Body.bubbleBorderRadius",
  contractValues: [
    "none",
    "sm",
    "md",
    "lg",
    "full"
  ]
} as const satisfies ContractEnum;

export const DEPLOYMENT_UPDATE_EMBED_CONFIG__BODY_BUBBLE_SIZE = {
  path: "DeploymentUpdateEmbedConfig.Body.bubbleSize",
  contractValues: [
    "small",
    "medium",
    "large"
  ]
} as const satisfies ContractEnum;

export const DEPLOYMENT_UPDATE_EMBED_CONFIG__BODY_UI_APPEARANCE = {
  path: "DeploymentUpdateEmbedConfig.Body.uiAppearance",
  contractValues: [
    "system",
    "light",
    "dark"
  ]
} as const satisfies ContractEnum;

export const DEPLOYMENT_UPDATE_EMBED_CONFIG__BODY_UI_RADIUS = {
  path: "DeploymentUpdateEmbedConfig.Body.uiRadius",
  contractValues: [
    "sm",
    "md",
    "lg"
  ]
} as const satisfies ContractEnum;

export const DEPLOYMENT_UPDATE_EMBED_CONFIG__BODY_UI_CONTAINER_RADIUS = {
  path: "DeploymentUpdateEmbedConfig.Body.uiContainerRadius",
  contractValues: [
    "sm",
    "md",
    "lg",
    "none"
  ]
} as const satisfies ContractEnum;

export const DEPLOYMENT_WHATSAPP_TEMPLATE_ATTACH__BODY_TYPE = {
  path: "DeploymentWhatsappTemplateAttach.Body.type",
  contractValues: [
    "template",
    "card",
    "carousel"
  ]
} as const satisfies ContractEnum;

export const DEPLOYMENT_CREATE_CONTRACT = {
  name: "DeploymentCreate",
  method: "POST",
  route: "/public/v1/deployments",
  fields: [
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.type", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["GMAIL", "OUTLOOK", "IMAP", "SMTP", "SLACK", "TEAMS", "TELEGRAM", "FB_MESSENGER", "INSTAGRAM", "WHATSAPP", "TWILIO_SMS", "TWILIO_VOICE", "GOOGLE_SHEETS", "EXCEL_ADDIN", "OUTLOOK_ADDIN", "POWERPOINT_ADDIN", "WORD_ADDIN", "AIRTABLE", "GOOGLE_MEET", "ZOOM", "EMBED", "API"] },
    { path: "Body.agentId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.settings", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.phoneNumberId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.oauthConnectionId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.apiKeyConnectionId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.whatsappSenderId", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const DEPLOYMENT_LIST_CONTRACT = {
  name: "DeploymentList",
  method: "GET",
  route: "/public/v1/deployments",
  fields: [
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.search", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.type", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["GMAIL", "OUTLOOK", "IMAP", "SMTP", "SLACK", "TEAMS", "TELEGRAM", "FB_MESSENGER", "INSTAGRAM", "WHATSAPP", "TWILIO_SMS", "TWILIO_VOICE", "GOOGLE_SHEETS", "EXCEL_ADDIN", "OUTLOOK_ADDIN", "POWERPOINT_ADDIN", "WORD_ADDIN", "AIRTABLE", "GOOGLE_MEET", "ZOOM", "EMBED", "API"] },
    { path: "Params.isActive", slot: "Params", type: "boolean", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const DEPLOYMENT_UPDATE_CONTRACT = {
  name: "DeploymentUpdate",
  method: "PATCH",
  route: "/public/v1/deployments/:deploymentId",
  fields: [
    { path: "PathVars.deploymentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.agentId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.settings", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.isActive", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.phoneNumberId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.oauthConnectionId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.apiKeyConnectionId", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const DEPLOYMENT_UPDATE_EMBED_CONFIG_CONTRACT = {
  name: "DeploymentUpdateEmbedConfig",
  method: "PATCH",
  route: "/public/v1/deployments/:deploymentId/embed-config",
  fields: [
    { path: "PathVars.deploymentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.displayName", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.localizedDisplayName", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.welcomeMessages", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.localizedWelcomeMessages", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.defaultLanguage", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.supportedLanguages", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.suggestedMessages", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.localizedSuggestedMessages", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.format", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["bubble", "classic"] },
    { path: "Body.showTimestamp", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.autoShowInitialMessagePopup", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.autoShowInitialMessagePopupDelay", slot: "Body", type: "number", required: false, depth: 0 },
    { path: "Body.bubblePosition", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["bottom-right", "bottom-left", "top-right", "top-left"] },
    { path: "Body.bubbleBorderRadius", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["none", "sm", "md", "lg", "full"] },
    { path: "Body.bubbleBackgroundColor", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.bubbleBorderColor", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.bubbleBorderWidth", slot: "Body", type: "number", required: false, depth: 0 },
    { path: "Body.bubbleSize", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["small", "medium", "large"] },
    { path: "Body.uiAppearance", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["system", "light", "dark"] },
    { path: "Body.uiRadius", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["sm", "md", "lg"] },
    { path: "Body.uiContainerRadius", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["sm", "md", "lg", "none"] },
    { path: "Body.uiBgPattern", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.uiPrimaryColor", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.uiAgentMessageColor", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.uiAgentMessageTextColor", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.uiUserMessageColor", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.uiUserMessageTextColor", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.showHeader", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.headerMessage", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.localizedHeaderMessage", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.showFooter", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.footerMessage", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.localizedFooterMessage", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.footerLinks", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.footerLinks[].id", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.footerLinks[].label", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.footerLinks[].url", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.localizedFooterLinks", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.chatInputPlaceholder", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.localizedChatInputPlaceholder", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.landingScreenEnabled", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.landingScreenWelcomeMessage", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.localizedLandingScreenWelcomeMessage", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.landingScreenNewConversationLabel", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.localizedLandingScreenNewConversationLabel", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.landingScreenNewConversationDescription", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.localizedLandingScreenNewConversationDescription", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.landingScreenShowPastConversations", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.landingScreenSingleActiveConversation", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.landingScreenInactiveConversationThresholdHours", slot: "Body", type: "number", required: false, depth: 0 },
    { path: "Body.landingScreenHidePastConversationsEnabled", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.landingScreenHidePastConversationsAfterDays", slot: "Body", type: "number", required: false, depth: 0 },
    { path: "Body.landingScreenPastConversationsTitle", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.localizedLandingScreenPastConversationsTitle", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.landingScreenChannelsTitle", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.localizedLandingScreenChannelsTitle", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.landingScreenActionButtons", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.landingScreenActionButtons[].id", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.landingScreenActionButtons[].label", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.landingScreenActionButtons[].description", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.landingScreenActionButtons[].icon", slot: "Body", type: "unknown", required: true, depth: 1 },
    { path: "Body.landingScreenActionButtons[].url", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.localizedLandingScreenActionButtons", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.landingScreenShowFooter", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.landingScreenFooterMessage", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.localizedLandingScreenFooterMessage", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.landingScreenFooterLinks", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.landingScreenFooterLinks[].id", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.landingScreenFooterLinks[].label", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.landingScreenFooterLinks[].url", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.localizedLandingScreenFooterLinks", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.identityVerificationEnabled", slot: "Body", type: "boolean", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const DEPLOYMENT_WHATSAPP_TEMPLATE_ATTACH_CONTRACT = {
  name: "DeploymentWhatsappTemplateAttach",
  method: "POST",
  route: "/public/v1/deployments/:deploymentId/whatsapp-templates",
  fields: [
    { path: "PathVars.deploymentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.templateId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.variables", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.type", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["template", "card", "carousel"] },
    { path: "Body.enableMultiLanguage", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.templateGroup", slot: "Body", type: "object", required: false, depth: 0 },
    { path: "Body.templateGroup.baseName", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.templateGroup.availableLanguages", slot: "Body", type: "array", required: true, depth: 1 },
    { path: "Body.templateGroup.availableLanguages[].language", slot: "Body", type: "string", required: true, depth: 2 },
    { path: "Body.templateGroup.availableLanguages[].templateId", slot: "Body", type: "string", required: true, depth: 2 },
    { path: "Body.templateGroup.defaultLanguage", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.enableDynamicSize", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.carouselTemplateGroup", slot: "Body", type: "object", required: false, depth: 0 },
    { path: "Body.carouselTemplateGroup.baseName", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.carouselTemplateGroup.availableTemplates", slot: "Body", type: "array", required: true, depth: 1 },
    { path: "Body.carouselTemplateGroup.availableTemplates[].language", slot: "Body", type: "string", required: true, depth: 2 },
    { path: "Body.carouselTemplateGroup.availableTemplates[].carouselSize", slot: "Body", type: "integer", required: true, depth: 2 },
    { path: "Body.carouselTemplateGroup.availableTemplates[].templateId", slot: "Body", type: "string", required: true, depth: 2 },
    { path: "Body.carouselTemplateGroup.defaultLanguage", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.carouselTemplateGroup.minCarouselSize", slot: "Body", type: "integer", required: false, depth: 1 },
    { path: "Body.carouselTemplateGroup.maxCarouselSize", slot: "Body", type: "integer", required: false, depth: 1 },
    { path: "Body.singleItemCardTemplateId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.singleItemCardTemplateGroup", slot: "Body", type: "object", required: false, depth: 0 },
    { path: "Body.singleItemCardTemplateGroup.availableTemplates", slot: "Body", type: "array", required: true, depth: 1 },
    { path: "Body.singleItemCardTemplateGroup.availableTemplates[].language", slot: "Body", type: "string", required: true, depth: 2 },
    { path: "Body.singleItemCardTemplateGroup.availableTemplates[].templateId", slot: "Body", type: "string", required: true, depth: 2 }
  ]
} as const satisfies ProjectedDescriptor;
