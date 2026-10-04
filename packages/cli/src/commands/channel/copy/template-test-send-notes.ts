/**
 * Appended to `nexus channel whatsapp-template test-send`: that this SENDS a real
 * billed message, and how delivery is judged.
 */

export const TEMPLATE_TEST_SEND_NOTES = `
Examples:
  $ nexus channel whatsapp-template test-send --connection-id 11111111-1111-4111-8111-111111111111 --template-id HX123 --to +1234567890
  $ nexus channel whatsapp-template test-send --connection-id 11111111-1111-4111-8111-111111111111 --template-id HX123 --to +1234567890 --variables '{"1": "Sneakers"}' --wait

Notes:
  THIS SENDS A REAL WHATSAPP MESSAGE TO A REAL PHONE THROUGH TWILIO AND META,
  AND IT BILLS. There is no dry-run mode, no sandbox and no confirmation
  prompt — it fires on submit. "test" describes your intent, not the pipeline.
  The recipient sees an ordinary message from your business and cannot tell it
  was a test. Send to a number you own.

  Each send is a separate charge, so a --wait loop that you re-run costs money
  each time. Nothing here is refundable and nothing can be recalled.
  --to must be E.164 (+ then digits, no spaces or dashes) or it is a 400.
  --variables is a flat map of position to value: '{"1":"Sneakers"}'. A
  missing position sends the template with the placeholder unfilled.

  --wait polls delivery for up to 2 minutes and exits non-zero on failed or
  undelivered. Without it the command returns as soon as Twilio accepts the
  message — "queued" is not "delivered", and a delivery failure is invisible.
  Check later with the messageSid it prints.

  GIVING UP AFTER THOSE 2 MINUTES ALSO EXITS NON-ZERO NOW, under a category of
  its own. It used to exit 0 with the message still in flight, which read as
  delivered. A timeout is not a failure — the message is still moving and the
  messageSid above is how you ask again — but it is not a delivery either.

  READ .wait, NOT ONLY THE EXIT CODE. The --json document carries wait, one of
  not-requested / resolved / timed-out, beside the status. A failed delivery is
  resolved with a failed status; a timeout is timed-out. Those are different
  numbers, so a caller can stop on one and carry on through the other.
  An unapproved template is refused by Meta at send time, not here.

  THERE IS NO WAY TO PREVIEW THE RENDERED TEMPLATE — NOT HERE AND NOT ANYWHERE
  ELSE IN THIS CLI. No route renders a template against variables without
  delivering it, so the first time anyone sees the filled-in text is when the
  recipient does. Saying that plainly is the whole of the answer: do not go
  looking for a preview flag.

  RENDER IT YOURSELF FIRST — it costs nothing and catches the common mistakes
  (a wrong position, a missing one, a placeholder you forgot):

    $ nexus channel whatsapp-template get <template-id> --json | jq '.types, .variables'

  "types" holds the body with its {{1}}, {{2}} … placeholders exactly as Meta
  approved it, and "variables" holds the positions the template declares.
  Substitute your --variables map into that text by hand and read the result.
  Then send once, to a number you own.`;
