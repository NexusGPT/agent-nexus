/**
 * Appended to `nexus conversation list`: the examples, the abandonment-scan
 * recipe, and the filter conflicts the server refuses rather than silently
 * ignoring.
 */

export const LIST_NOTES = `
Examples:
  $ nexus conversation list
  $ nexus conversation list --status OPEN --assigned-to me
  $ nexus conversation list --ticket-status IN_PROGRESS --json
  $ nexus conversation list --search "payment issue"

  # 24h abandonment scan: customers who went silent and haven't been resolved
  # (replace the --last-message-before value with a 24h-ago ISO timestamp)
  $ nexus conversation list \\
      --status OPEN \\
      --last-message-before <iso-24h-ago> \\
      --last-message-type-in USER \\
      --ticket-status-not RESOLVED \\
      --comment-not-contains END_CONV_FIRED_AT:

Notes:
  CLOSED CONVERSATIONS ARE NEVER LISTED. "conversation close" sets a DELETED
  status that no filter here selects, so a conversation missing from every
  --status is closed, not lost.
  --status takes OPEN, RUNNING or ARCHIVED only. DELETED is refused: closing
  is "conversation close", not an update.

  Contradictory filters are REFUSED, not silently empty: --ticket-status with
  --ticket-status-in, a --ticket-status-not equal to --ticket-status or inside
  --ticket-status-in, and a --last-message-before at or earlier than
  --last-message-after are each a 400 naming the conflict.
  --assigned-to me MEANS THE USER WHO MINTED THE KEY, and on a key that
  identifies no user the filter is DROPPED rather than refused — you get every
  conversation back and nothing says the filter did not apply. Check the count
  against an unfiltered run before trusting it. --assigned-to none is exact.
  --last-message-before / --last-message-after are ISO-8601 instants.
  --limit above 100 is a 400, not a clamp. Page with meta.paging in --json.`;
