/**
 * THE ONE PLACE THE TWO MCP DIRECTIONS ARE NAMED, FOR BOTH NAMESPACES' `--help`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A SHARED MODULE AND NOT A PARAGRAPH IN EACH FILE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus mcp` and `nexus mcp-server` are opposite directions of one protocol, and
 * the ONLY difference in their names is a suffix. An operator who guesses wrong
 * does not get an error: `nexus mcp tools list` answers a catalog, with exit 0,
 * that structurally cannot contain a tool from a connected MCP server — it is
 * generated from the Nexus Public API's own routes and reads no `McpServerTool`
 * row at all. That is a confident, well-formed, complete-looking answer to a
 * question the operator did not ask, which is the same symptom-versus-cause
 * mismatch the outbound surface was built to remove, one layer further out.
 *
 * So both namespaces say which direction they are, and both point at the other.
 * A sentence stated twice is a sentence that goes stale once: when the seam moves,
 * one copy gets edited and the other keeps reading like a measurement. Written
 * once here, each namespace's `--help` cannot describe a seam the other denies.
 *
 * ⚠️ IT IS NOT A SENTENCE ABOUT "OUTBOUND" AND "INBOUND", DELIBERATELY. Those two
 * words are already used in OPPOSITE senses in this tree: the route contract calls
 * `POST /public/v1/mcp` the INBOUND surface, because a third-party client is
 * calling into Nexus, while `commands/mcp.ts` calls the same route OUTBOUND,
 * because this CLI is dialling out of the terminal. Both readings are correct from
 * where they sit and an operator holds neither vantage point. **Name who is the
 * SERVER instead** — that is the one fact no point of view changes.
 */

/**
 * For `nexus mcp-server --help`: Nexus is the MCP CLIENT, the servers are the
 * organization's own third-party ones.
 */
export const MCP_OUTBOUND_DIRECTION = `
  DIRECTION — THESE ARE YOUR ORGANIZATION'S OWN MCP SERVERS, AND NEXUS IS THE
  CLIENT. The servers are third-party; Nexus dials them holding a credential your
  organization stored, and "mcp-server call" spends it. The rows are the servers
  an administrator registered and the tools an administrator approved on them.
  FOR THE OTHER DIRECTION, WHERE NEXUS ITSELF IS THE MCP SERVER, USE "nexus mcp".
  That namespace serves the Nexus Public API to an editor or an agent as tools.
  The two share no tool, no row and no catalog — "nexus mcp tools list"
  structurally cannot list a tool from here, and it answers 0 rather than erroring.`;

/**
 * For `nexus mcp --help`: Nexus IS the MCP server, and its catalog is the Public
 * API rather than anything a tenant connected.
 */
export const MCP_INBOUND_DIRECTION = `
  DIRECTION — HERE NEXUS ITSELF IS THE MCP SERVER. The catalog is generated from
  the Nexus Public API's own routes and narrowed to your key's scopes, so it can
  never contain a tool from an MCP server your organization connected — no verb in
  this namespace reads one of those rows.
  FOR THOSE — THE THIRD-PARTY SERVERS NEXUS DIALS OUT TO — USE "nexus mcp-server".
  A tool missing from "tools list" is a scope you do not hold far more often than a
  missing feature, and it is never a connected server's tool.`;
