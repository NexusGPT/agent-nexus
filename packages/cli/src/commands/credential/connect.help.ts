/**
 * `nexus credential connect --help`, the hand-written half.
 *
 * A module-level const rather than a template literal inside the registrar.
 * That is this package's pattern for a multi-kilobyte help block, and here it
 * is load-bearing for a second reason: it is what keeps the registrar under the
 * 80-line cap WITHOUT moving any `refuse()` call out of the `.action(` body —
 * see the 🚨 in `connect.command.ts` for the gate that depends on them staying
 * there.
 */
export const CREDENTIAL_CONNECT_HELP = `
Examples:
  $ nexus credential connect --service GMAIL
  $ nexus credential connect --service google_sheets --json
  $ nexus credential connect --tool 11111111-1111-4111-8111-111111111111 --api-key-value sk-abc123 --name "Production key"

Notes:
  THIS IS THE WHOLE FLOW, NOT A STEP INSIDE ONE. No workflow, no agent, no node,
  and on the OAuth branch no tool id — the account is the subject. "nexus tool
  connect" reaches the same machinery through a tool, and its OAuth branch never
  reads the tool id it demands, which is why that path made connecting an app
  look like a tool operation.

  THE BRANCH IS CHOSEN BY WHICH FLAG YOU PASS, and passing both is refused
  rather than resolved: --service is OAuth, --api-key-value is the API key. --tool is
  required with --api-key-value and is REJECTED with --service, because the key is
  stored against that tool's auth block while the OAuth flow has no tool at all.

  --service NAMES AN ACCOUNT, NOT A TOOL. Use a built-in OAuth service name
  (GMAIL, GOOGLE_SHEETS, NOTION, ...) or a Pipedream app slug (google_sheets).
  Built-in names are matched case-insensitively; anything else falls through to
  the Pipedream catalog, so a typo comes back as a Pipedream failure rather than
  as "no such service".

  THE TWO BRANCHES ANSWER TWO DIFFERENT SHAPES, and authType says which:
    "oauth"    {authorizationUrl, handshakeId, expiresAt} — NOTHING IS CONNECTED
               YET. Open authorizationUrl, then poll with
               "nexus credential connect-status <handshake-id>".
    "api_key"  {credentialId, toolCredentialId, name, type, status, createdAt} —
               the credential exists as of this answer.

  ON THE API-KEY BRANCH, credentialId IS THE ID THIS NAMESPACE TAKES.
  toolCredentialId is the OTHER id space — the one "nexus tool credentials"
  lists and "nexus tool delete-credential" takes. Both are UUIDs and neither
  namespace accepts the other's, so pasting the wrong one is well-formed and
  still refused. "credential get", "credential update", "credential delete" and
  "access-card list --credential-id" all want credentialId.

  A SECOND KEY FOR THE SAME TOOL IS A SECOND CREDENTIAL, not a replacement.
  Re-running this to "try another key" leaves you with two, both live. Remove
  the one you do not want with "nexus tool delete-credential".

  credentialId CAN BE null, and that is a real state rather than a failure: a
  tool-credential row that carries no unified credential row. Nothing in this
  namespace can address such a credential; delete it through the tool commands.`;
