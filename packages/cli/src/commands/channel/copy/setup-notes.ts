/**
 * Appended to `nexus channel setup`: why the deployment step never turns green,
 * that the exit code carries the verdict, and that `ready` is not always a check.
 */

export const SETUP_NOTES = `
Examples:
  $ nexus channel setup --type WHATSAPP
  $ nexus channel setup --type WHATSAPP --auto
  $ nexus channel setup --type TWILIO_SMS --json

Notes:
  THE "DEPLOYMENT" STEP ALWAYS READS action_needed. It is the thing you run
  this before doing, and it is never checked — do not wait for it to turn
  green. When every step ABOVE it is completed, the table prints "All
  prerequisites met", and that is the signal to create the deployment.

  THE EXIT CODE CARRIES THAT VERDICT. Ready exits 0; not-ready exits non-zero,
  so "nexus channel setup --type WHATSAPP && nexus deployment create ..." is the
  gate. This used to publish a jq filter over --json as the workaround for an
  exit code that answered 0 either way; the exit code answers now, and the
  filter is gone.

  --json ON THE READY PATH IS ONE DOCUMENT: { type, ready, steps }, with "ready"
  the same fact the table prints as "All prerequisites met". ON THE NOT-READY
  PATH IT IS THE ERROR DOCUMENT INSTEAD — one document on stdout is a promise
  this CLI keeps on every terminal path, and a failure's document is the error
  one. The checklist and the next step are inside its "message" and "hint".

  "ready" IS NOT ALWAYS A CHECK. For a --type with no real prerequisite checks
  it reads true because nothing was checked — see two paragraphs down. A 0 from
  this command is therefore "nothing is known to be missing", never "everything
  was verified".

  THIS STOPS AT THE FIRST GAP. The first step that reads action_needed blocks
  the rest, and every step after it reads "pending" whatever its real state
  is. So one run answers "what is the next thing to do", not "what is
  missing" — fix that step and run it again.

  Only WHATSAPP, TWILIO_SMS and TWILIO_VOICE have real prerequisite checks.
  Every other --type returns the single always-action_needed deployment step,
  so ready: true there means nothing was checked.

  --auto ONLY CREATES THE MESSAGING CONNECTION, and only for those three
  phone-backed types. Nothing buys a number, opens the Meta flow or registers
  a sender for you. If the creation fails the error is swallowed and you get
  the same checklist back with no explanation — compare the "connection" step
  before and after.

  --region is read only while creating that connection. An organization gets
  one connection, so once it exists this flag does nothing and the region
  cannot be changed here.
  Each step carries an action.endpoint and action.hint. They come back on the
  ready path under --json. On the not-ready path the error document CARRIES the
  first blocking step's action in its own "hint" — endpoint, method and hint
  text — because that document replaces the steps, and a whole checklist is in
  its "message". Run without --json for the table.`;
