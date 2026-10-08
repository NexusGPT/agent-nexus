/**
 * The hand-written half of `nexus mcp-server sync --help`.
 *
 * Its own module for the same two reasons `call.help.ts` gives: the two halves
 * together crowd the 150-line ceiling `source-file-size.ledger.test.ts` holds every
 * file under `packages/cli/src` to — a ceiling whose own remedy says SPLIT rather than
 * write a row — and they are edited for different reasons.
 *
 * ⚠️ NOTHING HERE MAY NAME AN EXIT NUMBER. `exit-code-taxonomy.test.ts` scans every
 * RENDERED help screen for a non-zero integer in the window after the word "exit".
 */
/**
 * ⚠️ EVERY EXAMPLE INVOKES THIS VERB, AND A SIBLING'S IS NOT A HARMLESS EXTRA.
 * `help-truth-scan.ts`'s `invocationsIn` takes the argv after `nexus` and attributes it
 * to the command whose help it came from, so a `$ nexus mcp-server get …` line here is
 * judged as an invocation of `sync`. Every other leaf in this namespace shows only its
 * own verb, and `help-truth.ledger.ts` carries a ceiling of ZERO — so the pointer at
 * `get` is PROSE in the Notes below, where nothing extracts it as a command.
 */
export const SYNC_HELP = `
Examples:
  $ nexus mcp-server sync 11111111-1111-4111-8111-111111111111
  $ nexus mcp-server sync 11111111-1111-4111-8111-111111111111 --json

Notes:
  THIS ASKS FOR A DISCOVERY; IT DOES NOT WAIT FOR ONE. The server records the request
  and answers immediately. Dialling a third-party server and walking its tool list can
  take many minutes, so the work happens out of band — which is why this command comes
  back in well under a second and why what it prints is a REQUEST, not a result.
  READ "lastSyncOutcome" AND "lastSyncErrorCode", NEVER THE FACT THAT THIS COMMAND
  SUCCEEDED. "QUEUED" means the request is recorded and the discovery has not run.
  "SUCCEEDED" means a warm queue finished the whole discovery before the response was
  composed. Both of those are a success here.
  "FAILED" IS TWO OPPOSITE FACTS AND THE ERROR CODE IS WHAT SEPARATES THEM. With
  "DISCOVERY_NOT_QUEUED" the queue refused the job, nothing was dialled, and RE-RUNNING
  this command is the remedy — the error document says CLI_MCP_DISCOVERY_NOT_QUEUED.
  With any other code a discovery RAN and the remote lost, so re-running repeats it
  rather than fixing it: AUTHORIZATION_REQUIRED needs the server reconnected, TIMEOUT
  and UNREACHABLE are the remote or the network. That one says
  CLI_MCP_DISCOVERY_FAILED. Branch on the "code" field, never on the prose.
  THE TOOLS AND THE DRIFT REPORT IT PRINTS ARE THE OLD ONES. They are whatever the
  PREVIOUS discovery left, because this one has not run yet. Run "mcp-server get" a
  little later for the new list; that is the command that answers what the sync found.
  A DISCOVERY REPLACES THE TOOL LIST, AND THAT IS NOT ONLY ADDITIVE. A tool the remote
  has stopped advertising goes REMOVED, which breaks an agent skill pinned to it, and
  your organization's auto-approval policy runs over what was found — so tools can
  become callable that were not. Read "mcp-server get" before and after if that matters.
  IT NEEDS "mcp_servers:write", WHICH NEITHER OF THE OTHER VERBS NEEDS. A key scoped
  only to read or only to call an approved tool is refused here, deliberately: this verb
  can change which tools exist and which an agent may use.
  A SERVER ID FROM ANOTHER ORGANIZATION IS A NOT-FOUND, not a disclosure, and nothing
  is dialled. The lookup carries your key's organization and happens before the request
  is queued.`;
