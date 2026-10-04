/**
 * Appended to `nexus deployment update`: which fields are clearable, and why the
 * enable/disable pair is a refusal rather than a precedence rule.
 */

export const UPDATE_NOTES = `
Examples:
  $ nexus deployment update 11111111-1111-4111-8111-111111111111 --name "Renamed Widget"
  $ nexus deployment update 11111111-1111-4111-8111-111111111111 --active false
  $ nexus deployment update 11111111-1111-4111-8111-111111111111 --agent-id 44444444-4444-4444-8444-444444444444
  $ nexus deployment update 11111111-1111-4111-8111-111111111111 --body '{"name":"Renamed"}'

Notes:
  Pass "null" as string to clear a field (e.g., --agent-id null to detach, --description null to clear).
  --active accepts "true" or "false" as strings.

  THE SETTINGS MERGE IS ONE GROUP DEEP. A group you name is merged key by key
  over the stored one, so {"embedSettings":{"displayName":"x"}} keeps every
  other key inside embedSettings, and every group you do not name is left
  alone. Send only the keys you are changing.

  SENDING A WHOLE GROUP BACK IS THE RISKY SHAPE, NOT THE SAFE ONE. Reading with
  "nexus deployment get <id>" and posting the group back entire is a
  read-modify-write: any key in that group changed by someone else between your
  read and your write is overwritten with the value you read. Naming just the
  keys you change cannot do that, and a group you never name is not in the
  write statement at all.

  A VALUE THAT IS NOT A JSON OBJECT ON BOTH SIDES REPLACES RATHER THAN MERGING.
  That is what keeps a list clearable — {"securitySettings":{"allowedDomains":
  []}} stores the empty array instead of reading as an omission.

  phoneNumberId, oauthConnectionId and apiKeyConnectionId REBIND the
  deployment when sent in --body. Send JSON null to unbind one.

  Each id must belong to your organization. One that does not is refused with
  404, which is the SAME answer an id that does not exist gets — so a refusal
  never reveals whether another organization holds that id. A number that is
  yours but not ACTIVE is a different refusal and answers 400.

  --active false stops the channel serving but does NOT free its WhatsApp
  number: the number is held by every non-deleted WHATSAPP deployment, active
  or not, so the next create still 409s until this one is deleted.
  AN UPDATE IS REFUSED ONLY WHEN IT BREAKS A GROUP THAT PARSES TODAY. The
  merged result is checked against the type's own schema and compared with the
  stored value's, so a group already failing that schema stays writable while a
  group that parses now cannot be made to stop. The 400 names the groups. This
  is narrower than create's check: an update can still write a shape create
  would have refused, inside a group that was already failing.

  THE 50-KEY / 50KB CAP APPLIES HERE TOO, AND IT MEASURES YOUR PATCH, NOT THE
  RESULT. Both bodies validate settings through the same bounded schema, so
  this refuses a 51-key object exactly as create does — but it counts the keys
  you SENT, and the merge above then writes them over what is already stored.
  Thirty keys patched onto forty stored keys is seventy keys in the column and
  a 200, because nothing re-measures the merged object. The cap itself is
  documented under "nexus deployment create --help".`;
