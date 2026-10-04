/**
 * Appended to `nexus deployment create`: that settings are validated against the
 * TYPE, and what must exist on the channel first.
 */

export const CREATE_NOTES = `
Examples:
  $ nexus deployment create --name "Web Widget" --type EMBED --agent-id 33333333-3333-4333-8333-333333333333 --body embed-settings.json
  $ nexus deployment create --name "Slack Bot" --type SLACK --agent-id 44444444-4444-4444-8444-444444444444
  $ nexus deployment create --name "WhatsApp Bot" --type WHATSAPP --agent-id 44444444-4444-4444-8444-444444444444 --body '{"whatsappSenderId":"XE..."}'

Notes:
  FIVE TYPES REJECT A CREATE THAT CARRIES NO SETTINGS: EMBED, TELEGRAM,
  TWILIO_VOICE, GOOGLE_SHEETS and OUTLOOK_ADDIN. The 400 lists every missing
  field — build --body from that error. EMBED alone needs four objects
  (embedSettings, securitySettings, assistantSettings, advancedSettings),
  which is why the example above passes a file.

  THOSE FOUR OBJECTS NEST UNDER A TOP-LEVEL "settings" KEY. The contract
  declares exactly one place for them, and a Zod object strips what it does
  not declare — so --body '{"embedSettings":{...},"securitySettings":{...}}'
  parses clean, loses every one of those keys, and reaches the route as a
  create with no settings at all. It then answers the same 400 an empty body
  gets. A correct body missing one level therefore reads as an empty body.
  The shape is '{"settings":{"embedSettings":{...},"securitySettings":{...},
  "assistantSettings":{},"advancedSettings":{}}}'.
  "--print-contract" renders it as
  'Body.settings [optional, opaque; shape not described by the contract]' —
  that is the contract declining to describe the inside, not a gap here.

  THE ENUM-VALUED LEAVES INSIDE settings ARE PRINTABLE, JUST NOT FROM HERE.
  Because settings is opaque on this route, "--print-contract" stops at the
  wrapper. The embedSettings half is fully described by the sibling verb:
  "nexus deployment embed-config-update --print-contract" renders
  bubblePosition bottom-right|bottom-left|top-right|top-left,
  bubbleBorderRadius none|sm|md|lg|full, bubbleSize small|medium|large,
  uiAppearance system|light|dark, uiRadius sm|md|lg and uiContainerRadius
  sm|md|lg|none. securitySettings is the one that bites and no command prints
  it: visibility is REQUIRED and is exactly public|private. assistantSettings
  and advancedSettings default every field, so {} is a valid value for both.

  WHATSAPP: pass --body '{"whatsappSenderId":"<id>"}' and phoneNumberId plus
  apiKeyConnectionId are resolved from it. A number another ACTIVE WhatsApp
  deployment already holds is a 409 and NOTHING is taken from it — there is
  no force here, deactivate the other deployment first.

  WHATSAPP, TWILIO_SMS and TWILIO_VOICE need a phone number that is ACTIVE and
  owned by this organization. A released number still resolves by id and is
  refused; WHATSAPP additionally 400s unless a sender is registered on it.

  TWILIO_SMS IS THE SMS CHANNEL. A bare "SMS" is now refused before the request
  leaves. It was a contract value that could not work in two independent ways:
  no settings schema stood behind it, so the lookup was undefined and the call
  threw rather than answering a validation error, and it was not a database
  enum value either, so no row could have held it. It is gone from the contract.

  settings is capped at 50 top-level keys and 50KB serialized.
  Verify with "nexus deployment get <id>" — it is the only read carrying
  settings back.
  dashboardUrl in the payload is the new deployment's page, added by this CLI
  rather than returned by the API — open it, or hand it to whoever asked.`;
