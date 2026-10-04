/** Appended to `nexus tool connect`. */
export const TOOL_CONNECT_HELP = `
Examples:
  $ nexus tool connect 11111111-1111-4111-8111-111111111111 --service GOOGLE_SHEETS
  $ nexus tool connect 11111111-1111-4111-8111-111111111111 --auth-type http --api-key-value sk-abc123 --name "Production key"
  $ nexus tool connect 11111111-1111-4111-8111-111111111111 --body '{"authType":"http","apiKey":"sk-abc"}'

Notes:
  --service names the account to authorize, and the tool ID does not imply it:
  neither "nexus tool search" nor "nexus tool get" returns it. Use the built-in
  OAuth service name (GOOGLE_SHEETS, GMAIL, NOTION, ...) or the Pipedream app
  slug (google_sheets).

  --auth-type http IS NARROWER THAN IT SOUNDS, AND ITS REFUSAL NAMES THE WRONG
  THING. It fits ONE kind of tool: the marketplace calls that kind "user_http".
  Every other tool answers 400 "Tool auth type is not http" — including the
  API-key tools, which the marketplace calls "keys" and which are the common
  case. That message names an auth type no tool ever reports, so it reads as a
  typo in your flag when it is really the wrong tool for this branch.

  MOST TOOLS CONNECT ON THE DEFAULT PATH, API KEY OR NOT. Leave --auth-type
  alone, pass --service, and follow the link the response returns; the key is
  entered there. Reach for --auth-type http only after the default path has
  refused you.

  CONNECTING WITH --auth-type http ADDS A CREDENTIAL, IT DOES NOT REPLACE ONE.
  A tool holds many, so a second key for the same tool is a second row and both
  keep working — a re-run to "try another key" leaves you with two, not one.
  List them with "nexus tool credentials <id>" and remove the one you no longer
  want with "nexus tool delete-credential".

  THE TWO BRANCHES ANSWER TWO DIFFERENT SHAPES, and the message tells you which:
    "OAuth flow initiated."     {authorizationUrl, handshakeId, expiresAt}
    "Tool connected via HTTP."  {id, name, type, status, createdAt}
  On the OAuth branch nothing is connected yet — open authorizationUrl, then
  pass handshakeId to "nexus tool connection-status <handshake-id>". That is the
  only place that id is used, and it expires at expiresAt.

  THE http BRANCH'S id IS TOOL-SCOPED, NOT THE INVENTORY ID. It is the id
  "nexus tool credentials <tool-id>" and "nexus tool delete-credential" take.
  The "nexus credential" and "nexus access-card" commands take the UNIFIED id
  for the same connected account, and that one comes from
  "nexus credential list". Two ids, one account, and a command that names one
  namespace does not accept the other's.
  WHERE A CREDENTIAL IS SPENT, BOTH IDS RESOLVE: "nexus external-tool execute
  --credential", a workflow plugin node's toolCredentialId, and an agent PLUGIN
  config's toolCredentialId all take either id for the same account. It is the
  ADDRESSING commands above — "credential", "access-card", "tool
  delete-credential" — that hold you to one namespace.`;
