/**
 * Appended to `nexus channel whatsapp-template submit-approval`: what --wait
 * does and does not promise, and what its exit code means.
 */

export const TEMPLATE_SUBMIT_APPROVAL_NOTES = `
Examples:
  $ nexus channel whatsapp-template submit-approval --connection-id 11111111-1111-4111-8111-111111111111 --template-id HX123 --name welcome --category UTILITY
  $ nexus channel whatsapp-template submit-approval --connection-id 11111111-1111-4111-8111-111111111111 --template-id HX123 --name promo --category MARKETING --wait

Notes:
  A 200 MEANS FILED, NOT APPROVED. The template still cannot be sent. Only
  "nexus channel whatsapp-template approvals" reporting approved says it can.

  --category IS PERMANENT AND PRICED. UTILITY, MARKETING and AUTHENTICATION
  bill differently and are reviewed against different rules; picking the wrong
  one is a rejection, and it cannot be corrected on this template afterwards.

  --wait POLLS FOR 2 MINUTES AND THEN GIVES UP, AND GIVING UP EXITS NON-ZERO.
  It used to exit 0 with the status still pending, which told a script the
  template was fine. Meta commonly takes longer than this window, so a timeout
  is the ordinary outcome and not an error — it says the CLI stopped asking,
  never that Meta refused. Read the real answer from "nexus channel
  whatsapp-template approvals".

  A REJECTION ALSO EXITS NON-ZERO, UNDER A DIFFERENT CATEGORY, and the two
  numbers are how a script tells them apart. "create --submit" applies the
  identical rejection rule, so the same refusal gives the same status whichever
  verb filed the template; its own timeout still exits 0, because its poll is
  unconditional rather than a flag you asked for.

  READ .wait, NOT ONLY THE EXIT CODE. The --json document carries wait, one of
  not-requested / resolved / timed-out, beside the status — so a caller that
  wants to stop on a refusal and carry on through a timeout tests that key
  rather than wrapping the command in "|| true", which swallows both.
  --name is the name filed with Meta for this approval; --template-id is the
  Twilio content SID (HX...) of the template it reviews.`;
