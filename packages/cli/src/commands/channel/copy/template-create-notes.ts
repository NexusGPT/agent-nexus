/**
 * Appended to `nexus channel whatsapp-template create`: what a created template
 * can and cannot do before Meta has approved it.
 */

export const TEMPLATE_CREATE_NOTES = `
Examples:
  $ nexus channel whatsapp-template create --connection-id 11111111-1111-4111-8111-111111111111 --friendly-name welcome --language en --body "Hello {{1}}, welcome!"
  $ nexus channel whatsapp-template create --connection-id 11111111-1111-4111-8111-111111111111 --friendly-name promo --language en --body-file template.json
  $ nexus channel whatsapp-template create --connection-id 11111111-1111-4111-8111-111111111111 --friendly-name order --language en --body "Order {{1}} confirmed" --submit --category UTILITY

Notes:
  CREATING IS NOT SUBMITTING AND SUBMITTING IS NOT APPROVAL. Without --submit
  the template exists in Twilio and can never be sent. With --submit it is
  filed with Meta and this command polls for 30 SECONDS ONLY — a still-pending
  verdict is reported as pending and the command exits 0. Read the real answer
  from "nexus channel whatsapp-template approvals".

  A REJECTION EXITS NON-ZERO; a timeout still exits 0. Meta answering no is a
  verdict and this command reports it as one. The window closing with no answer
  is not a verdict and never becomes one. "submit-approval --wait" applies the
  identical REJECTION rule, so the same refusal gives the same status whichever
  verb filed it — but its timeout exits NON-ZERO, because --wait is a flag you
  asked for and this 30-second poll is not.

  READ .wait, NOT ONLY THE EXIT CODE. The approval object in the --json document
  carries wait, one of not-requested / resolved / timed-out, beside the status.
  Here it is never not-requested: --submit always polls.

  --category IS PERMANENT AND IT IS A BILLING DECISION. UTILITY, MARKETING and
  AUTHENTICATION are priced differently by Meta and reviewed differently;
  a MARKETING message filed as UTILITY is a rejection. It cannot be changed
  after submission — create a new template instead.

  Variables are positional: {{1}}, {{2}} in the body text. Meta rejects
  templates where variables dominate the static text and this command warns
  before sending — the warning does NOT stop the create.
  --body and --body-file are mutually exclusive and one is required.
  --body-file takes the full Twilio Types object, which is what you need for
  cards, carousels or media; --body only builds a twilio/text template.
  --language is the Twilio language code (en, en_US) and is part of the
  template's identity — a second language is a second template.`;
