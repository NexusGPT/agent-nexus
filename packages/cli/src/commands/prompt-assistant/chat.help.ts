import {
  DEFAULT_WAIT_SECONDS,
  POLL_TIMEOUT_MS,
  PROMPT_ASSISTANT_DEFAULT_TIMEOUT_SECONDS
} from "./_shared/wait-timings";

/** `nexus prompt-assistant chat` — the hand-written prose. */
export const PROMPT_ASSISTANT_CHAT_HELP = `
Examples:
  $ nexus prompt-assistant chat --message "Create a customer support agent" --mode agent
  $ nexus prompt-assistant chat --message "Improve the prompt" --mode agent --thread-id 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01
  $ nexus prompt-assistant chat --message "Create a customer support agent" --mode agent --wait
  $ nexus prompt-assistant chat --message "Create a customer support agent" --mode agent --wait --wait-timeout 3600
  $ echo "Write a summarization task" | nexus prompt-assistant chat --message - --mode ai-task
  $ nexus prompt-assistant chat --body '{"message":"Help me","mode":"agent"}'

Notes:
  --wait IS HOW YOU GET THE PROMPT. Without it this command stops the moment the
  thread turns "generating" — the state that means the reply is in and the PROMPT
  IS NOT WRITTEN YET — and the prompt then has to be fetched with get-thread.
  With it, the command blocks through generation and prints promptResult.
  It exits NON-ZERO if the wait times out or the thread ends failed/cancelled,
  so "the command returned 0" means the prompt is there.

  --wait STILL ENDS ON A FOLLOW-UP QUESTION. The assistant usually asks
  something before it has enough to generate; that reply ends the wait with
  status still in_progress. Answer it with another chat on the same --thread-id.

  --mode IS REQUIRED ON EVERY CALL, follow-ups included: omitting it is a 400.
  It picks the assistant for THIS turn and is NOT checked against the thread, so
  a follow-up sent under the other mode runs the other assistant over the same
  history and nothing objects. Pass the mode the thread was opened with.

  --thread-id IS A UUID, AND AN UNRECOGNISED ONE OPENS A NEW THREAD. A valid
  uuid that names no thread is not an error — the reply comes back with none of
  the context you meant to continue, under a threadId you did not send. Check
  the threadId in the response.

  THIS COMMAND AUTO-POLLS AND CAN TAKE MINUTES. The API returns immediately with
  an empty response; the CLI then polls the thread for you and prints the reply.
  NEVER RESEND ON AN APPARENT HANG — a resend is a second user turn on the same
  thread and the assistant answers it as one.

  THREE DIFFERENT WAITS CAN END THIS COMMAND, and each has its own dial.
  The POLL gives up after ${POLL_TIMEOUT_MS / 60_000} minutes without --wait, and
  after --wait-timeout (default ${DEFAULT_WAIT_SECONDS}s) with it. The HTTP request
  is given ${PROMPT_ASSISTANT_DEFAULT_TIMEOUT_SECONDS}s, which the global
  --timeout <seconds> overrides — it bounds ONE request, not the poll.

  ANY OF THEM ENDING LEAVES THE WORK RUNNING SERVER-SIDE. Do NOT open a second
  thread: recover the id with "prompt-assistant list-threads" and resume with
  "prompt-assistant get-thread <id> --wait".

  STATUS is in_progress, generating, completed, failed or cancelled; the last
  three are final. generating means the reply is in but the PROMPT is still being
  written — without --wait the prompt arrives on get-thread as promptResult, not
  here.`;
