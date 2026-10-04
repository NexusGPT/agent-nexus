/**
 * Appended to `nexus conversation messages`: why half the AGENT rows were never
 * delivered, how the backwards-walking cursor pages, and where a conversation id
 * is reached from a deployment or an emulator session.
 */

export const MESSAGES_NOTES = `
Examples:
  $ nexus conversation messages 11111111-1111-4111-8111-111111111111
  $ nexus conversation messages 11111111-1111-4111-8111-111111111111 --visible-only
  $ nexus conversation messages 11111111-1111-4111-8111-111111111111 --limit 10 --json

Notes:
  ROUGHLY HALF THE AGENT ROWS WERE NEVER DELIVERED. A tool-using conversation
  stores the agent runtime's own working memory beside its real replies, and
  in the table they are six identical-looking AGENT rows. Read TYPE
  (USER_MESSAGE, REPLY, TOOL_CALL, TOOL_RESULT, SYSTEM, INTERNAL) and the
  customerVisible flag, or pass --visible-only and let the server decide.

  USE --visible-only WHENEVER THE QUESTION IS WHAT THE CUSTOMER SAW. Without
  it, quoting this output back to a customer quotes machinery at them. It
  filters before pagination, so --limit counts real messages either way.

  THE PAGE IS THE NEWEST MESSAGES; THE ROWS INSIDE IT READ OLDEST FIRST. Paging
  walks backwards in time while each page prints forwards, so concatenating
  pages in the order you fetch them produces a transcript in the wrong order —
  prepend each page, never append. --limit is capped at 100 (default 50); a long
  conversation needs paging, not a bigger limit.
  --before is the SERVER'S nextBefore, passed back verbatim. It is an opaque
  "<iso>_<id>" pair, not a date. A bare ISO timestamp still works and still
  means "older than this", but it cannot express a boundary inside a
  millisecond, so a cursor you build from the oldest row's createdAt SKIPS
  every message sharing that timestamp. Under --visible-only that matters
  more, because the page is filtered after it is read.
  AN EMPTY PAGE WITH hasMore: true IS NOT THE END. Rows are filtered after the
  window is read, so a page can legitimately return nothing while messages
  remain further back. Stop paging on hasMore: false, never on an empty page.
  In --json, hasMore and nextBefore ride in meta; in table mode they are
  printed as a trailer line.

  REACHING THIS COMMAND FROM A DEPLOYMENT YOU JUST TESTED. Nothing in an
  emulator or deployment response is named "conversationId", which is why the
  bridge is hard to find:
    from a deployment  nexus conversation list --deployment-id <deployment-id>
    from an emulator   nexus emulator session get <deployment-id> <session-id>
    session              --json | jq -r '.chatId'   ← THE CONVERSATION ID
                       That read prints the record BARE, with no "data" wrapper.
                       "emulator session list <deployment-id> --json" carries it
                       per session and IS wrapped: '.data[].chatId'. Neither
                       TABLE prints the column at all.
  chatId reads null until a chat exists for that session, and an emulator
  conversation has no nanoId — pass the UUID.`;
