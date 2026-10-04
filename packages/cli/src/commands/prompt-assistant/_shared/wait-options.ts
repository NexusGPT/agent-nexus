import type { PromptAssistantThreadResponse } from "@agent-nexus/sdk";

import { timeoutSecondsToMs } from "../../../client";
import { color, isJsonMode } from "../../../output";
import { DEFAULT_WAIT_SECONDS, POLL_TIMEOUT_MS } from "./wait-timings";

/**
 * Narrate a long wait on the human channel — and ONLY there.
 *
 * Under `--json` this prints nothing at all: a progress line on stdout is a
 * second document beside the payload, which is the one thing `--json` promises
 * never to be. Only status CHANGES are printed, so a half-hour generation is a
 * handful of lines rather than 120.
 */
export function waitNarrator(): (thread: PromptAssistantThreadResponse, elapsedMs: number) => void {
  let last: string | undefined;
  return (thread, elapsedMs) => {
    if (isJsonMode() || thread.status === last) return;
    last = thread.status;
    const elapsed = Math.round(elapsedMs / 1000);
    const note = thread.status === "generating" ? " (writing the prompt — this takes minutes)" : "";
    console.error(color.dim(`… ${thread.status}${note} — ${elapsed}s elapsed`));
  };
}

/** The `--wait` options, resolved once so both verbs read them identically. */
export function waitOptions(
  opts: { wait?: boolean; waitTimeout?: number },
  afterMessageCount?: number
): {
  until: "prompt" | "assistant-reply";
  afterMessageCount?: number;
  timeoutMs?: number;
  onPoll: (thread: PromptAssistantThreadResponse, elapsedMs: number) => void;
} {
  return {
    until: opts.wait ? "prompt" : "assistant-reply",
    afterMessageCount,
    // Without `--wait`: the pre-existing 5-minute reply poll, unchanged. It
    // stops at `generating`, which is why `--wait` had to exist.
    timeoutMs: opts.wait
      ? timeoutSecondsToMs(opts.waitTimeout ?? DEFAULT_WAIT_SECONDS)
      : POLL_TIMEOUT_MS,
    onPoll: waitNarrator()
  };
}
