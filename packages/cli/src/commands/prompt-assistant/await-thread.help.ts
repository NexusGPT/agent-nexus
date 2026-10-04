import { MAX_AWAIT_SECONDS } from "./_shared/wait-timings";

/** `nexus prompt-assistant await-thread` — the hand-written prose. */
export const PROMPT_ASSISTANT_AWAIT_THREAD_HELP = `
Examples:
  $ nexus prompt-assistant await-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01
  $ nexus prompt-assistant await-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01 --wait-timeout 30
  $ nexus prompt-assistant await-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01 --after-message-count 4

Notes:
  THIS IS get-thread --wait WITH THE LOOP ON THE SERVER. One request is held
  until the thread is completed, failed or cancelled instead of re-downloading
  the whole transcript every few seconds. Prefer it in a hook or a script that
  only needs to know when the prompt is ready.

  ⚠️ IT RETURNS BEFORE A LONG GENERATION FINISHES, AND THAT IS NORMAL. The proxy
  in front of the API cuts a request at 60s, so the hold is capped at
  ${MAX_AWAIT_SECONDS}s and a longer generation exits non-zero with a timed-out
  status. Run the command again with the same id — the work never stopped, and
  a resend of the message would be a second user turn.

  --after-message-count MATTERS AFTER A REPLY. A thread left completed by an
  earlier turn still reads completed the moment you send the next message, so
  without this flag the wait returns the PREVIOUS turn's prompt instantly. Pass
  the message count you read before sending.

  READ .outcome, NOT ONLY THE EXIT CODE. The document is {thread, outcome,
  waitedMs}, so the thread's own fields are under .thread. outcome is terminal,
  assistant-replied or timed-out; timed-out is the resume signal above and not
  a failure.`;
