/**
 * `nexus credential update --help`, the hand-written half.
 *
 * A module-level const rather than a template literal inside the registrar —
 * this package's pattern for a multi-kilobyte help block.
 */
export const CREDENTIAL_UPDATE_HELP = `
Examples:
  $ nexus credential update 11111111-1111-4111-8111-111111111111 --name "Production Gmail"
  $ nexus credential update 11111111-1111-4111-8111-111111111111 --description "Used by marketing agents"
  $ nexus credential update 11111111-1111-4111-8111-111111111111 --data '{"name":"Staging","description":null}'

Notes:
  ONLY name AND description ARE WRITABLE, and WHICH OF THE TWO depends on the
  credential's SOURCE — the field "credential get" prints and "credential list
  --source" filters on. A credential is a pointer into one of three tables, and
  ALL THREE now store both fields:
    api_key_connection   name AND description
    tool_credential      name AND description
    oauth_connection     name AND description
  ON AN OAUTH CREDENTIAL, --name SETS YOUR OWN LABEL AND DOES NOT TOUCH THE
  ACCOUNT NAME. Those are two different values: the account name comes from the
  provider and is refreshed on every reconnect, so it is what still identifies
  WHICH account this is after you rename the credential. "credential get" keeps
  showing it as the account identifier, and a credential you never named reports
  the account name as its name.
  name CANNOT BE CLEARED and description CAN. name is a non-empty string on the
  wire — '"name": null' and '"name": ""' are both refused — so a label can be
  replaced but not removed. '"description": null' does clear the description.
  A FIELD A SOURCE CANNOT STORE IS STILL REFUSED — 400
  CREDENTIAL_FIELD_NOT_WRITABLE, naming the fields, nothing changed. No source
  refuses either of these two today; the refusal is what a future source with
  fewer columns will get. This surface used to answer 200 having written nothing,
  so a rename that never happened was indistinguishable from one that did.
  RE-SENDING A VALUE THAT IS ALREADY SET IS NOT REFUSED, on any source. It asks
  for no change, so '"description": null' on a credential that has no
  description is accepted.
  Any key other than those two is silently DROPPED by the contract — a 200 comes
  back having applied nothing you sent.
  THIS CANNOT REPAIR A BROKEN CREDENTIAL. There is no token field here, so a
  NEEDS_REAUTH credential stays broken however it is renamed; reconnect it.
  "description": null CLEARS the description. Omitting the key leaves it as it
  was — null and absent are different requests.`;
