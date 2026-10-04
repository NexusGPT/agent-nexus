/**
 * The refusal every control verb shares when the conversation is not named.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 WHY MINTING WITHOUT `--chat-id` IS REFUSED RATHER THAN DEFAULTED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The conversation a control verb addresses is the session token's own claim,
 * and a mint with no `chatId` RESERVES A FRESH ONE. So a defaulted mint would
 * produce a token naming a conversation that has never had a turn, and all
 * three verbs would answer perfectly: `status` reports every field null, `stop`
 * reports `accepted:false`, `resume` streams nothing. Every one of those is a
 * truthful answer about the wrong conversation, and none of them looks like a
 * mistake.
 *
 * A refusal at the edge is the only outcome a script can tell from a real one.
 */
export const NO_CONVERSATION_MESSAGE =
  "This command needs the conversation it is about: pass --session-token or --chat-id.";

export const NO_CONVERSATION_HINT =
  "Minting without --chat-id reserves a NEW conversation, so every answer would be truthful " +
  "about a conversation that has never had a turn.";
