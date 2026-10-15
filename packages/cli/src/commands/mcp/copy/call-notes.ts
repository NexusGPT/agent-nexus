/**
 * `nexus mcp call --help`'s after-block, in its own module so the registrar
 * stays inside the per-function line cap. Interpolated verbatim; the bytes a
 * reader sees are the bytes below.
 */
export const CALL_NOTES = `
Examples:
  $ nexus mcp call identity_whoami
  $ nexus mcp call agent_list --input '{"query":{"limit":5}}'
  $ nexus mcp call agent_get --input '{"agentId":"11111111-1111-4111-8111-111111111111"}'
  $ nexus mcp call agent_list --raw

Notes:
  THIS DISPATCHES A REAL PUBLIC API CALL. The endpoint runs the tool against the
  same routes, the same scopes and the same organization every other nexus
  command uses, so a destructive tool here destroys exactly what it says.
  🚨 THERE IS NO --yes AND NO --dry-run. The tool name is not inspected locally
  and nothing is confirmed — the request is sent the moment you press enter.
  Run "nexus mcp tools get <tool>" first; its destructive hint is the only warning
  you get.
  --input IS A JSON OBJECT AND NOTHING ELSE. An array, a scalar or invalid JSON
  is refused before any request leaves this process. Omitting it sends {}, which
  is correct for a tool that takes no arguments and a 4xx for one that does.
  THE SHAPE OF --input IS THE TOOL'S inputSchema, NOT THIS CLI'S FLAGS. Path
  parameters sit at the top level; a route's query string goes under "query" and
  its request body under "body". "nexus mcp tools get <tool>" prints it.
  BY DEFAULT YOU GET THE TOOL'S PAYLOAD, RE-PARSED. The endpoint returns it as
  JSON inside a text block; this command unwraps that one block so the output is
  the document itself. --raw prints the JSON-RPC result verbatim — content array,
  isError flag and all — which is what you want when the payload is not JSON.
  A TOOL THAT FAILS EXITS NON-ZERO AND ITS ANSWER IS THE ERROR MESSAGE. The
  exit code names the category, and "nexus --help" carries that table. The
  endpoint
  reports a 4xx from the underlying route as isError on a successful JSON-RPC
  reply, so "the call worked and the API refused it" is a FAILURE here, never a
  0 exit with an error body on stdout.`;
