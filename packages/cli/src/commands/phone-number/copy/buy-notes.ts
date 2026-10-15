/**
 * Appended to `nexus phone-number buy`: that this is a purchase with no undo,
 * that the gate reads STDIN rather than stdout, and that --price is the amount
 * DEBITED rather than a check against the carrier's quote.
 *
 * Extracted so `registerPhoneNumberBuyCommand` stays inside the 80-line
 * per-function cap. The prose is published help on a verb that spends money, so
 * it moves as one block and is never trimmed to fit a number.
 */

export const BUY_NOTES = `
Examples:
  $ nexus phone-number buy --phone-number +12025551234 --country US --price 1.15
  $ nexus phone-number buy --phone-number +442071234567 --country GB --price 1.00 --yes

Notes:
  THIS IS A PURCHASE. It bills your account monthly until you run
  "nexus phone-number release <id>", and nothing expires it. It is confirmed
  once here and never again — there is no cancel, no undo and no refund.

  IN A SCRIPT, WITHOUT --yes, IT BUYS NOTHING AND EXITS NON-ZERO. No prompt to
  answer when stdin is not a terminal, so the command refuses rather than
  proceeding: you get a refusal document and no number. A pipeline that ignores
  the exit code carries on as though it had bought one. Every destructive
  command in this CLI refuses the same way — do not reach for --yes until you
  have read the --price note below.

  THE GATE READS STDIN, NOT STDOUT. Redirecting output alone still prompts;
  it is a piped or absent stdin that triggers the refusal.

  --price IS THE AMOUNT CHARGED, NOT A CHECK. Whatever you pass is what gets
  debited from the organization's balance; it is never compared against what
  the carrier actually charges. A typo here bills the typo. Copy the PRICE
  column from "nexus phone-number search" verbatim, as a plain decimal string.

  Buy the capabilities you need. The purchase does not verify that the number
  can carry the channel you intend — a voice-only number attaches to a
  WhatsApp deployment and simply never delivers. Filter at search time with
  --sms / --voice.
  --connection-id charges the customer's own Twilio subaccount instead of the
  Nexus pool, and pins the number to that connection for webhooks and for the
  eventual release. Omit it for a normal purchase.
  Re-buying a number this organization already holds as ACTIVE returns the
  existing row and does not charge again.
  Verify with "nexus phone-number list" — the number appears there once ACTIVE.`;
