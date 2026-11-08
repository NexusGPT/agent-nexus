/** `nexus chat history` — the hand-written prose. */
export const CHAT_HISTORY_HELP = `
Examples:
  $ nexus chat history 44444444-4444-4444-8444-444444444444 --chat-id 33333333-3333-4333-8333-333333333333
  $ nexus chat history 44444444-4444-4444-8444-444444444444 --session-token "$TOKEN" --limit 50
  $ nexus chat history 44444444-4444-4444-8444-444444444444 --session-token "$TOKEN" --before 55555555-5555-4555-8555-555555555555 --json

Notes:
  THE NEWEST PAGE COMES FIRST, AND EACH PAGE IS OLDEST-FIRST INSIDE. So the
  cursor for the page before is the FIRST message of the page you hold, never
  the last. The footer prints it when older messages exist.
  hasMore IS NEVER true OVER AN EMPTY PAGE. Under --json, page until it is false.
  A MESSAGE IS ITS parts, NOT ITS text. text is a plain-string fallback; a card,
  an attachment, a code-interpreter block and a failed turn's error exist only
  as parts — the PARTS column names them, and --json carries them whole.
  WHAT IS NOT HERE, ON PURPOSE: tool calls and their raw output, the model's
  reasoning, sources, and transient frames. This is the transcript as the
  visitor saw it, not the turn as the server ran it.
  THE CONVERSATION IS THE SESSION TOKEN'S OWN CLAIM. No flag can name another,
  and a deleted conversation is refused.
  ONE OF --session-token OR --chat-id IS REQUIRED. Minting without a chat id
  reserves a NEW conversation, whose transcript is always empty.
  --chat-id NAMES A CONVERSATION THAT EXISTS, and the id "nexus chat session"
  prints is NOT one until a message has been sent: minting against it answers
  404 "Chat not found". For a brand-new conversation, pass --session-token.`;
