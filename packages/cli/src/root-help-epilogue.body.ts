/**
 * SENDING A BODY, SCOPES, AND WHICH PROFILE A COMMAND USES.
 *
 * 🚨 THE `--data` LIST IS A CHECKED CLAIM TOO, AND IN BOTH DIRECTIONS.
 * `request-body-flag-spelling.test.ts` derives the set of commands that spell
 * the request body `--data` from the real commander tree and asserts this block
 * names each member and no ex-member — a list gone stale by omission and one
 * gone stale by accretion read identically on the page.
 *
 * The profile-resolution ladder is the other half nothing else states: level 6
 * is shared by every process on the machine, so a plain `auth switch` in one
 * terminal repoints every session that has no binding of its own. That is the
 * fact an operator needs before they lose a write to the wrong organization.
 */
export const ROOT_EPILOGUE_BODY_AND_SCOPES = `  SENDING A BODY
    --body takes inline JSON, a path ending in .json, or "-" for stdin. An
    explicit flag ALWAYS overrides the same field inside --body.
    A REQUIRED FLAG IS SATISFIED BY --body TOO. The body key is the flag name in
    camelCase, so --first-name is satisfied by "firstName". A command refuses only
    when the field is in NEITHER place, and says so naming both.
    A KEY THE SERVER DOES NOT KNOW IS USUALLY DROPPED, NOT REFUSED — a typo'd or
    misplaced field is accepted and silently ignored, so read each command's body
    shape rather than guessing it.
    FIVE COMMANDS SPELL THE BODY FLAG --data, ACROSS THREE NAMESPACES:
    "ticket create", "ticket update", "credential update", "access-card create"
    and "access-card update". Every other command spells it --body, and neither
    spelling is accepted where the other is declared — commander refuses the flag
    it does not know, so this costs you a retry rather than a silent drop.
    "html-template render" ALSO TAKES --data AND IT IS NOT A REQUEST BODY: it is
    the data object a template renders against, on a namespace whose create and
    update take --body. Read the command's own Options block, never the
    namespace's.

  SCOPES AND WHO YOU ARE
    Scopes have exactly ONE implication: :write implies :read on the SAME
    resource, so a key that can rewrite a list can always fetch it first. Nothing
    else bridges: :write does not imply :delete, :delete implies nothing at all,
    and a scope on one surface says nothing about another — implication never
    crosses a resource. A missing scope is a 403, not an empty result.
    A key minted for an org MEMBER sees only what that user created on several
    surfaces, so a list can be empty while the organization has rows, and
    somebody else's id answers 404 rather than 403.
    Commands act on the profile's ACTIVE organization. "nexus auth whoami" says
    which. Changing it needs a personal (cross-org) token and
    "nexus auth use-org <orgId>"; an org-scoped key reaches exactly one org by
    construction, so switch profile instead.

  WHICH PROFILE A COMMAND USES, AND WHY IT CAN CHANGE UNDER YOU
    Resolution, highest first — each level is checked only when the ones above it
    are absent:
      1  --api-key <key>            this invocation only; uses no profile at all
      2  --profile <name>           this invocation only
      3  NEXUS_API_KEY              this shell; uses no profile at all
      4  NEXUS_PROFILE              this shell     — nexus auth switch <n> --session
      5  .nexusrc                   this directory — nexus auth switch <n> --here
      6  active profile             THIS MACHINE   — nexus auth switch <n>
      7  the profile named "default"
    AN EXPLICIT --profile OUTRANKS AN EXPORTED NEXUS_API_KEY, which is why it is
    the reliable per-command escape hatch: 2 beats 3, so the named profile's key
    is used even in a shell that exported one. Nothing else outranks NEXUS_API_KEY
    — with it set, levels 4-7 are not consulted at all.
    LEVEL 6 IS SHARED BY EVERY PROCESS ON THE MACHINE. A plain "auth switch" in
    one terminal repoints every other session that has no binding of its own,
    mid-task and without printing anything there — reads answer from the other
    organization, and writes LAND in it. Working two organizations at once means
    binding each session at level 4 or 5, which are per-shell and per-directory
    and cannot collide.
    The organization is a SECOND resolution and does not follow the profile: on a
    cross-org token it is NEXUS_ORGANIZATION_ID (this shell), else the orgId saved
    on the profile by "auth use-org" (every session on the machine).
    "nexus auth status" names the level in force, and the org with it.`;
