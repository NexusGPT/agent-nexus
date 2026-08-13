// GENERATED FILE — DO NOT EDIT BY HAND.
// Source: packages/types/src/api/public/v1/contract/, via z.toJSONSchema.
// Regenerate: pnpm --filter @agent-nexus/cli run gen:contract-help
//
// `commands/contract-help.test.ts` re-derives this from the live contract and
// fails when the committed copy drifts, so a contract change cannot ship with
// the CLI still offering the old values.
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
