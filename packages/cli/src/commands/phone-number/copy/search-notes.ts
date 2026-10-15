/**
 * Appended to `nexus phone-number search`: that searching reserves nothing,
 * that PRICE is a STRING a JSON round trip corrupts, and that this step needs
 * no connection.
 *
 * Extracted so `registerPhoneNumberSearchCommand` stays inside the 80-line
 * per-function cap. The prose is published help, so it moves as one block and is
 * never trimmed to fit a number.
 */

export const SEARCH_NOTES = `
Examples:
  $ nexus phone-number search --country US --sms --voice
  $ nexus phone-number search --country US --area-code 415 --limit 50
  $ nexus phone-number search --country GB --type mobile --json

Notes:
  SEARCHING RESERVES NOTHING AND COSTS NOTHING. A candidate can be gone by the
  time you buy it — that is a 409, and re-running the search is the fix.
  Ask for the capabilities you need HERE. --sms, --mms and --voice all default
  to false, so a bare search returns numbers that may do none of them, and
  nothing later checks that the number you bought can carry the channel you
  deployed it on. WhatsApp and SMS need --sms; a voice deployment needs
  --voice.
  PRICE is the monthly rate and is what "phone-number buy --price" must
  repeat. Copy it from this table rather than typing it.
  🚨 IT IS A STRING, AND A JSON ROUND TRIP THROUGH A NUMBER CORRUPTS IT. The
  field is "1.15", not 1.15, with the unit in a separate "currency" field —
  so a script that parses the row, reads price as a number and re-serialises
  it sends 1.15 as "1.15" but 1.10 as "1.1", and the buy is refused for a
  price that no longer matches the quote. Carry the string through untouched:

    $ nexus phone-number search --country US --sms --json | jq -r '.[0].price'

  Both price and currency can be null — that is Twilio declining to quote, or a
  number billed to your own subaccount, not a free number.
  --area-code is digits only and Twilio applies it to US and Canada only.
  --limit is capped at 50 and defaults to 5. Over the cap is a 400, NOT a clamp
  to 50 — the search does not run at all.
  THIS STEP NEEDS NO CONNECTION. The order above starts at "channel connection
  create" because BUYING needs one; searching does not, and returns live carrier
  inventory on an organization with no messaging connection at all. So an empty
  result here means no matching numbers, never a missing prerequisite — and you
  can price a country before setting anything up.

  --json HERE IS A BARE ARRAY, not {data,meta}. "phone-number list" is the
  other shape, so a jq '.data[]' carried over from it selects nothing AND DOES
  NOT ERROR — the miss reads as "no numbers available". Use jq '.[]'.`;
