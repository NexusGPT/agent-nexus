/**
 * Appended to `nexus access-card create`: where action ids come from, what an
 * omitted or empty `policies` map actually grants, and why --color validates
 * nothing.
 *
 * Extracted so `registerAccessCardCreateCommand` stays inside the 80-line
 * per-function cap. The prose is the command's published help, so it moves as
 * one block and is never trimmed to fit a number.
 */

export const CREATE_NOTES = `
Examples:
  $ nexus access-card create --credential-id 11111111-1111-4111-8111-111111111111 --name "Send Only" \\
      --data '{"policies":{"gmail:send_email":{"parameters":{"to":{"enabled":true}}}}}'
  $ nexus access-card create --credential-id 11111111-1111-4111-8111-111111111111 --name "Full Access" \\
      --data '{"policies":{"gmail:send_email":{}}}'

Notes:
  --data ALSO TAKES A .json PATH OR "-" FOR STDIN, and the examples above use the
  inline form on purpose: this command declares other required flags, so --data
  is resolved BEFORE the action runs and a missing file fails at parse time
  rather than in the request.

  policies IS A MAP OF ACTION ID TO { "parameters": { "<path>": { "enabled":
  ... } } }. Action ids are taken VERBATIM from "access-card available-actions
  --credential-id <id>" — nothing else is a valid key.

  AN UNLISTED ACTION IS DENIED. An action listed with no "parameters" entry is
  allowed with NO PARAMETERS AT ALL — every argument the caller sends is
  stripped before dispatch. An unlisted parameter inside a listed action is
  stripped the same way, silently.

  OMITTING policies CREATES A CARD THAT GRANTS NOTHING. This command defaults
  it to {}, and {} only means "everything" on the master card, which this
  command CANNOT create — every card created here is non-master. A {} card
  validates, is returned as created, and refuses every action.

  "enabled": true lets the caller set the parameter. "enabled": false with a
  "value" PINS it — the caller cannot override it and never sees the refusal.
  "enabled": false with no value strips the parameter.

  Prove it before trusting it: run the action through the card and confirm the
  parameters that survived.

  --color IS A FREE STRING AND "(slate, blue, green, etc.)" IS NOT A SET. There
  is no enum behind it and nothing validates it: --color notacolor is accepted,
  persisted verbatim, and returned by "access-card get". The dashboard is what
  decides whether a value renders as a colour, so a typo produces a card that
  saved cleanly and looks wrong there, with no error at any point on this side.
  Omitting it stores "slate". "access-card update --color" is the same field
  with the same absence of checking.`;
