/**
 * The three declared exemption lists. An exemption nobody can grow quietly is
 * the only kind worth having, so they live together and the gate bounds them.
 */

/**
 * Commands that legitimately emit many values on stdout.
 *
 * ⚠️ WRITTEN OUT, NEVER DERIVED, AND THE GATE BOUNDS ITS SIZE. Derived from a
 * marker on the command it would be true by construction and would exempt
 * whatever anyone marked. Three entries is the whole honest list; a fourth needs
 * a deliberate edit here that a reviewer reads.
 *
 * `mcp serve` is the strongest member rather than a borderline one: its stdout
 * IS the MCP stdio transport — newline-delimited JSON-RPC, one message per line,
 * for as long as the host keeps the pipe open. There is no last document to wait
 * for, and driving it here would block on a stdin that never closes.
 */
export const STREAMING_LEAVES: readonly string[] = ["execution follow", "mcp serve", "apps logs"];

/**
 * Commands whose stdout is the SERVER'S payload in a format the CALLER chose.
 *
 * ⚠️ THE THIRD LEGITIMATE SHAPE, AND IT WAS NOT IN THE ORIGINAL INVARIANT.
 * `nexus tracing export --format csv` prints CSV. That is not a broken JSON
 * document; it is the document, and each of these commands says so in its own
 * `--help` — "IT PRINTS THE PAYLOAD TO STDOUT AND NOTHING ELSE", and for
 * `tracing export`, "--json does NOT apply here". Calling them violations would
 * be the gate describing a CLI nobody wants, twice over: the format is the
 * caller's explicit request, and the payload is the whole point of the verb.
 *
 * They still satisfy the SPIRIT — one terminal result, one thing on stdout — so
 * the exemption is from the PARSE, never from the invariant. Bounded like
 * {@link STREAMING_LEAVES}: written out, asserted small.
 */
export const PAYLOAD_PASSTHROUGH_LEAVES: readonly string[] = [
  "analytics export",
  // `cue export` is the same shape: stdout is the server's transcript corpus in
  // the framing the caller asked for — NDJSON by default, which is many JSON
  // documents by construction and one payload by intent. Its own `--help` says
  // "THE OUTPUT IS THE PAYLOAD, VERBATIM".
  "cue export",
  "tracing export",
  "tracing export-bulk"
];

/** Every leaf exempt from the parse, for the gate's own bound. */
export const EXEMPT_LEAVES: readonly string[] = [
  ...STREAMING_LEAVES,
  ...PAYLOAD_PASSTHROUGH_LEAVES
];
