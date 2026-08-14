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
// `channel.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const CHANNEL_CONNECTION_CREATE__BODY_REGION = {
  path: "ChannelConnectionCreate.Body.region",
  contractValues: [
    "us1",
    "ie1"
  ]
} as const satisfies ContractEnum;

export const CHANNEL_SETUP_AUTO_PROVISION__BODY_TYPE = {
  path: "ChannelSetupAutoProvision.Body.type",
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

export const CHANNEL_SETUP_AUTO_PROVISION__BODY_REGION = {
  path: "ChannelSetupAutoProvision.Body.region",
  contractValues: [
    "us1",
    "ie1"
  ]
} as const satisfies ContractEnum;

export const CHANNEL_WHATSAPP_TEMPLATE_APPROVAL_SUBMIT__BODY_CATEGORY = {
  path: "ChannelWhatsappTemplateApprovalSubmit.Body.category",
  contractValues: [
    "UTILITY",
    "MARKETING",
    "AUTHENTICATION"
  ]
} as const satisfies ContractEnum;

export const CHANNEL_WHATSAPP_TEMPLATE_CREATE__BODY_TYPES_TWILIO_CALL_TO_ACTION_ACTIONS_ITEM_TYPE = {
  path: "ChannelWhatsappTemplateCreate.Body.types.twilio/call-to-action.actions[].type",
  contractValues: [
    "URL",
    "PHONE_NUMBER"
  ]
} as const satisfies ContractEnum;

export const CHANNEL_WHATSAPP_TEMPLATE_CREATE__BODY_TYPES_TWILIO_CAROUSEL_CARDS_ITEM_ACTIONS_ITEM_TYPE = {
  path: "ChannelWhatsappTemplateCreate.Body.types.twilio/carousel.cards[].actions[].type",
  contractValues: [
    "QUICK_REPLY",
    "URL",
    "PHONE_NUMBER"
  ]
} as const satisfies ContractEnum;

export const CHANNEL_CONNECTION_CREATE_CONTRACT = {
  name: "ChannelConnectionCreate",
  method: "POST",
  route: "/public/v1/channels/connections",
  fields: [
    { path: "Body.region", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["us1", "ie1"] }
  ]
} as const satisfies ProjectedDescriptor;

export const CHANNEL_SETUP_AUTO_PROVISION_CONTRACT = {
  name: "ChannelSetupAutoProvision",
  method: "POST",
  route: "/public/v1/channels/setup",
  fields: [
    { path: "Body.type", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["GMAIL", "OUTLOOK", "IMAP", "SMTP", "SLACK", "TEAMS", "TELEGRAM", "FB_MESSENGER", "INSTAGRAM", "WHATSAPP", "TWILIO_SMS", "TWILIO_VOICE", "GOOGLE_SHEETS", "EXCEL_ADDIN", "OUTLOOK_ADDIN", "POWERPOINT_ADDIN", "WORD_ADDIN", "AIRTABLE", "GOOGLE_MEET", "ZOOM", "EMBED", "API"] },
    { path: "Body.region", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["us1", "ie1"] }
  ]
} as const satisfies ProjectedDescriptor;

export const CHANNEL_WHATSAPP_TEMPLATE_APPROVAL_SUBMIT_CONTRACT = {
  name: "ChannelWhatsappTemplateApprovalSubmit",
  method: "POST",
  route: "/public/v1/channels/whatsapp-templates/approvals",
  fields: [
    { path: "Body.connectionId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.templateId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.category", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["UTILITY", "MARKETING", "AUTHENTICATION"] }
  ]
} as const satisfies ProjectedDescriptor;

export const CHANNEL_WHATSAPP_TEMPLATE_CREATE_CONTRACT = {
  name: "ChannelWhatsappTemplateCreate",
  method: "POST",
  route: "/public/v1/channels/whatsapp-templates",
  fields: [
    { path: "Body.connectionId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.friendlyName", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.language", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.types", slot: "Body", type: "object", required: true, depth: 0 },
    { path: "Body.types.twilio/text", slot: "Body", type: "object", required: false, depth: 1 },
    { path: "Body.types.twilio/text.body", slot: "Body", type: "string", required: true, depth: 2 },
    { path: "Body.types.twilio/media", slot: "Body", type: "object", required: false, depth: 1 },
    { path: "Body.types.twilio/media.body", slot: "Body", type: "string", required: true, depth: 2 },
    { path: "Body.types.twilio/media.media", slot: "Body", type: "array", required: true, depth: 2 },
    { path: "Body.types.twilio/quick-reply", slot: "Body", type: "object", required: false, depth: 1 },
    { path: "Body.types.twilio/quick-reply.body", slot: "Body", type: "string", required: true, depth: 2 },
    { path: "Body.types.twilio/quick-reply.actions", slot: "Body", type: "array", required: true, depth: 2 },
    { path: "Body.types.twilio/quick-reply.actions[].title", slot: "Body", type: "string", required: true, depth: 3 },
    { path: "Body.types.twilio/quick-reply.actions[].id", slot: "Body", type: "string", required: false, depth: 3 },
    { path: "Body.types.twilio/call-to-action", slot: "Body", type: "object", required: false, depth: 1 },
    { path: "Body.types.twilio/call-to-action.body", slot: "Body", type: "string", required: true, depth: 2 },
    { path: "Body.types.twilio/call-to-action.actions", slot: "Body", type: "array", required: true, depth: 2 },
    { path: "Body.types.twilio/call-to-action.actions[].title", slot: "Body", type: "string", required: true, depth: 3 },
    { path: "Body.types.twilio/call-to-action.actions[].type", slot: "Body", type: "string", required: true, depth: 3, enumValues: ["URL", "PHONE_NUMBER"] },
    { path: "Body.types.twilio/call-to-action.actions[].url", slot: "Body", type: "string", required: false, depth: 3 },
    { path: "Body.types.twilio/call-to-action.actions[].phone", slot: "Body", type: "string", required: false, depth: 3 },
    { path: "Body.types.twilio/card", slot: "Body", type: "object", required: false, depth: 1 },
    { path: "Body.types.twilio/card.title", slot: "Body", type: "string", required: true, depth: 2 },
    { path: "Body.types.twilio/card.subtitle", slot: "Body", type: "string", required: false, depth: 2 },
    { path: "Body.types.twilio/card.media", slot: "Body", type: "array", required: false, depth: 2 },
    { path: "Body.types.twilio/card.actions", slot: "Body", type: "array", required: false, depth: 2 },
    { path: "Body.types.twilio/carousel", slot: "Body", type: "object", required: false, depth: 1 },
    { path: "Body.types.twilio/carousel.body", slot: "Body", type: "string", required: true, depth: 2 },
    { path: "Body.types.twilio/carousel.cards", slot: "Body", type: "array", required: true, depth: 2 },
    { path: "Body.types.twilio/carousel.cards[].title", slot: "Body", type: "string", required: false, depth: 3 },
    { path: "Body.types.twilio/carousel.cards[].body", slot: "Body", type: "string", required: true, depth: 3 },
    { path: "Body.types.twilio/carousel.cards[].media", slot: "Body", type: "string", required: true, depth: 3 },
    { path: "Body.types.twilio/carousel.cards[].actions", slot: "Body", type: "array", required: true, depth: 3 },
    { path: "Body.types.twilio/carousel.cards[].actions[].title", slot: "Body", type: "string", required: true, depth: 4 },
    { path: "Body.types.twilio/carousel.cards[].actions[].type", slot: "Body", type: "string", required: true, depth: 4, enumValues: ["QUICK_REPLY", "URL", "PHONE_NUMBER"] },
    { path: "Body.types.twilio/carousel.cards[].actions[].id", slot: "Body", type: "string", required: false, depth: 4 },
    { path: "Body.types.twilio/carousel.cards[].actions[].url", slot: "Body", type: "string", required: false, depth: 4 },
    { path: "Body.types.twilio/carousel.cards[].actions[].phone", slot: "Body", type: "string", required: false, depth: 4 },
    { path: "Body.variables", slot: "Body", type: "object", required: false, depth: 0, opaque: true }
  ]
} as const satisfies ProjectedDescriptor;
