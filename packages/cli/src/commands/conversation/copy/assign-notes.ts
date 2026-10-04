/**
 * Appended to `nexus conversation assign`: that the write REPLACES the assignee
 * list, and where Clerk user ids come from, since nothing in this namespace
 * lists them.
 */

export const ASSIGN_NOTES = `
Examples:
  $ nexus conversation assign 11111111-1111-4111-8111-111111111111 --user-ids user-1 user-2
  $ nexus conversation assign 11111111-1111-4111-8111-111111111111 --clear

Notes:
  THIS REPLACES THE ASSIGNEE LIST, IT DOES NOT ADD TO IT. Anyone already
  assigned and not named here loses the conversation, and nothing reports who
  was removed. Read "conversation assigned-users <id>" first and pass the full
  list back.
  --clear IS THE UNASSIGN PATH, and it is a separate flag on purpose. Passing
  --user-ids with no values is not the unassign path and never was: a variadic
  option demands at least one value, so that spelling is refused by the parser
  before this command runs.
  EXACTLY ONE OF --user-ids AND --clear. A bare "assign <id>" is refused rather
  than treated as an empty list — under replace-all semantics, defaulting to
  empty makes the no-flags form the most destructive one.
  WHERE THE IDS COME FROM, BECAUSE NOTHING IN THIS NAMESPACE LISTS THEM. These
  are Clerk user ids (user_…), a DIFFERENT ID SPACE from every UUID here. A
  conversation id or a user-group UUID is not a user, and nothing on this side
  checks the shape — the refusal comes from the server, at the write.
    your own      nexus api GET /me --json | jq -r '.data.userId'
                  "auth whoami" resolves the same identity and prints the org,
                  the email and the role — never the id.
    the current   nexus conversation assigned-users <id> --json
    assignees     Read them first: this command REPLACES the list.
    anyone else   nexus user-group list --json | jq -r '.data[].memberUserIds[]'
                  The TABLE prints a member COUNT and never the ids; only --json
                  carries memberUserIds. Needs the org:admin role — a non-admin
                  key gets a 403 here, not an empty list.
  THERE IS NO COMMAND THAT LISTS EVERY MEMBER OF THE ORGANIZATION, so a user in
  no group is reachable only from the dashboard. Source the id rather than
  guessing one — the write connects each id to a real user row, so a wrong one
  surfaces as a persistence error, the same way a blank one does below.

  A BLANK ID IS REFUSED, NOT SENT. --user-ids "$SOME_UNSET_VAR" hands over an
  empty string; it is a shell accident, never a user, and the server answers a
  blank id with a persistence error rather than a validation message.
  Up to 50 users. Assignment is filing, not permission: it does not grant
  anyone access they did not already have, and it does not stop the agent
  replying — --response-handling does that.`;
