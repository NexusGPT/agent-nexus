/** `nexus chat status` — the hand-written prose. */
export const CHAT_STATUS_HELP = `
Examples:
  $ nexus chat status 44444444-4444-4444-8444-444444444444 --chat-id 33333333-3333-4333-8333-333333333333
  $ nexus chat status 44444444-4444-4444-8444-444444444444 --session-token "$TOKEN"
  $ nexus chat status 44444444-4444-4444-8444-444444444444 --chat-id 33333333-3333-4333-8333-333333333333 --json

Notes:
  READ FROM THE DURABLE LOG, NOT FROM A POD. Every replica answers the same. A
  reading taken from the process holding the generation would report "nothing is
  running" on every other pod for a turn that is running.
  "running": true IS A STATEMENT ABOUT THE RECORD, not a heartbeat. A turn whose
  pod died before it could settle reads true for ever, and nothing on this
  surface can tell that from a turn still thinking.
  outcome IS "completed", "failed" OR "stopped", and null while it runs. It is
  the only place "the visitor pressed Stop" is spelled out — the stream's own
  finish frame says "other" for a stopped turn.
  lastEventId IS THE CURSOR THE SERVER HAS, not the one you have. Resuming from
  it after a dropped connection skips every frame written in between. Resume
  from the last-event-id "nexus chat send" or "nexus chat resume" printed.
  A CONVERSATION WITH NO TURN answers every field null with frameCount 0. That
  is the correct answer, not an error.
  A FAILED TURN IS REPORTED AS A FAILURE and this command exits non-zero, the
  same way "nexus chat send" reports one. outcome "stopped" and outcome
  "completed" both exit zero — a turn that stopped because somebody stopped it
  did what was asked, so a script can run "chat stop" and then this one.
  ONE OF --session-token OR --chat-id IS REQUIRED. Minting without a chat id
  reserves a NEW conversation, which always reads as empty.
  --chat-id NAMES A CONVERSATION THAT EXISTS, and the id "nexus chat session"
  prints is NOT one until a message has been sent: that id is RESERVED and no
  row is written, so minting against it answers 404 "Chat not found". For a
  brand-new conversation, keep the token and pass --session-token instead.`;
