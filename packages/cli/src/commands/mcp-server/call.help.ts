/**
 * The hand-written half of `nexus mcp-server call --help`.
 *
 * Its own module because the two halves together are over the 150-line ceiling
 * `source-file-size.ledger.test.ts` holds every file under `packages/cli/src` to —
 * a ceiling whose own remedy says SPLIT rather than write a row. They are also
 * edited for different reasons: one by whoever changes a flag, one by whoever
 * learns something new about what this verb costs an operator.
 *
 * ⚠️ NOTHING HERE MAY NAME AN EXIT NUMBER. `exit-code-taxonomy.test.ts` scans every
 * RENDERED help screen for a non-zero integer in the window after the word "exit",
 * because a per-command help that promises a number goes false the moment the
 * taxonomy refines that failure into a more specific category. An earlier draft of
 * the paragraph below put an HTTP status one clause after the word, and the gate
 * caught it — correctly: nothing reading a line can know which of its numbers was
 * being offered as the code.
 */

/** The Examples and Notes blocks `call.command.ts` appends to its leaf. */
export const CALL_HELP = `
Examples:
  $ nexus mcp-server call 11111111-1111-4111-8111-111111111111 list_repos
  $ nexus mcp-server call 11111111-1111-4111-8111-111111111111 search_issues \\
      --arguments '{"query":"is:open"}'
  $ nexus mcp-server call 11111111-1111-4111-8111-111111111111 search_issues \\
      --arguments '{"query":"is:open"}' --json

Notes:
  🚨 THIS DIALS A THIRD-PARTY SERVER, SPENDING YOUR ORGANIZATION'S CREDENTIAL.
  There is no --dry-run and nothing is confirmed: the request leaves the moment you
  press enter. Whatever the remote tool does, it does. Run
  "mcp-server get <serverId>" first — its annotations are the only advance warning,
  and the protocol calls them HINTS, so "read-only" is a claim and not a promise.
  A TOOL THAT REPORTS ITS OWN FAILURE IS A FAILURE HERE, AND THE EXIT CODE SAYS SO.
  The API answers success carrying isError true, because a tool reporting failure
  has answered the question it was asked; this command reports that as a failure so
  a shell "&&" behaves.
  ON THAT PATH --json GIVES YOU THE ERROR DOCUMENT, NOT THE RESULT DOCUMENT, and the
  tool's own text is the error message inside it. One document on stdout either way,
  which is this CLI's whole --json contract — so parse "error.message" when the exit
  code is non-zero, and the result shape only when it is zero. The one thing that
  path cannot carry is a media block: a tool that returns an IMAGE and reports
  failure loses the image here. Read the text, fix the arguments, call again.
  ONLY AN APPROVED TOOL IS CALLABLE. Any other status is refused server-side before
  a packet leaves Nexus. That refusal is correct and a worse message than reading
  "mcp-server get" first.
  THE TOOL NAME IS SENT IN THE REQUEST BODY, NOT IN THE URL, and that is why it may
  contain anything. A remote may advertise a name holding "/" or "..", which no path
  segment could carry safely. Pass it exactly as "get" prints it.
  --arguments IS SENT UNFILTERED BY THIS CLI. Your organization's Access Card for
  the credential being spent is what filters it, and what survives the card is what
  is dialled. Omit it for a tool that takes no arguments; "{}" is the same thing.
  --expected-schema-hash IS THE ONLY GUARD AGAINST A CONTRACT THAT MOVED. A tool
  approved, changed and approved again reads APPROVED throughout, so no status can
  show it. Pass the hash "get" printed and the call is refused instead. Omitting it
  is not "any contract, unchecked" — an unapproved tool is still refused.
  THE BODY IS STRICT, SO A MISSPELLED FIELD IS A 400 NAMING IT rather than a silent
  discard. On a door that dials a third party, "the parameters you sent were not the
  parameters I used" is the worst available answer.
  THE ORGANIZATION IS YOUR API KEY'S and is not a flag.`;
