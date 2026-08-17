import { NexusApiError } from "../errors";
import { LONG_RUNNING_TIMEOUT_MS } from "../timeouts";
import type { PageResponse } from "../types/common";
import { BaseResource } from "./base-resource";

export interface PromptAssistantChatBody {
  message: string;
  threadId?: string;
  mode: "agent" | "ai-task";
}

export interface ListPromptAssistantThreadsParams {
  /** Page number (1-based, default 1). */
  page?: number;
  /** Items per page (default 20, max 100). */
  limit?: number;
}

export interface PromptAssistantThreadSummary {
  threadId: string;
  mode: string | null;
  status: "in_progress" | "generating" | "completed" | "failed" | "cancelled";
  /** First user message (truncated) or the generated name once completed. */
  summary: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface PromptAssistantChatResponse {
  threadId: string;
  response: string;
  status: "in_progress" | "generating" | "completed" | "failed";
}

export interface PromptAssistantThreadMessage {
  role: string;
  content: string;
  timestamp: string;
}

export interface PromptResult {
  prompt: string;
  name: string;
  description: string;
  input?: { type: "json" | "text"; schema?: Record<string, unknown> };
  output?: { type: "json" | "text"; schema?: Record<string, unknown> };
  agentFields?: Record<string, unknown>;
}

export interface PromptAssistantThreadResponse {
  /**
   * `cancelled` IS IN THIS UNION AND IS NOT DEAD. `AgentCreationThreadStatus`
   * has five members and the controller's status map spells all five; a wait
   * loop whose terminal set was read off a four-value union polls a cancelled
   * thread until its own deadline. See {@link PROMPT_ASSISTANT_TERMINAL_STATUSES}.
   */
  status: "in_progress" | "generating" | "completed" | "failed" | "cancelled";
  threadId: string;
  messages: PromptAssistantThreadMessage[];
  promptResult?: PromptResult;
}

/**
 * The statuses a thread never leaves.
 *
 * `generating` is deliberately NOT one of them, and that omission is the whole
 * of NEX-2923: `generating` means the assistant has stopped talking and the
 * PROMPT is still being written, which is the state a caller most wants to wait
 * through and the exact state the CLI used to return in.
 */
export const PROMPT_ASSISTANT_TERMINAL_STATUSES = ["completed", "failed", "cancelled"] as const;

export type PromptAssistantTerminalStatus = (typeof PROMPT_ASSISTANT_TERMINAL_STATUSES)[number];

export function isPromptAssistantTerminalStatus(
  status: string
): status is PromptAssistantTerminalStatus {
  // Widened through a local rather than `return (X as readonly string[])…`:
  // a two-space `return (` is read as a public method declaration by
  // `cli/src/sdk-methods-reach-the-cli.test.ts`, whose scan is a regex over
  // text, and the phantom `promptAssistant.return` then demands a CLI command.
  const terminal: readonly string[] = PROMPT_ASSISTANT_TERMINAL_STATUSES;
  return terminal.includes(status);
}

/**
 * What ends a {@link PromptAssistantResource.waitForThread} wait.
 *
 * - `"prompt"` — the prompt has been decided: a terminal status, or the
 *   assistant answering without starting a generation (it asked a follow-up
 *   question, and no amount of waiting turns that into a prompt).
 * - `"assistant-reply"` — the turn produced something readable: any of the
 *   above, plus `generating`. This is the shorter wait, for a caller that wants
 *   the conversational reply and will come back for the prompt separately.
 */
export type PromptAssistantWaitUntil = "prompt" | "assistant-reply";

export interface WaitForThreadOptions {
  /** What ends the wait. Default `"prompt"`. */
  until?: PromptAssistantWaitUntil;
  /**
   * Message count observed BEFORE this turn was sent, if a turn was just sent.
   *
   * A reply is "new" only past this count, which is what makes the wait
   * survive the one state the status field cannot describe: a follow-up sent on
   * an already-`completed` thread. The server appends the user message and
   * leaves the status alone, so `completed` is stale from the previous turn
   * until the assistant either answers or flips the thread to `generating`.
   * Waiting on status alone returns the PREVIOUS turn's prompt instantly.
   *
   * Omit when no turn was sent — then only a terminal status ends the wait.
   */
  afterMessageCount?: number;
  /** Give up after this long. Default 30 min. */
  timeoutMs?: number;
  /** First poll interval. Default 2 s; doubles up to {@link maxIntervalMs}. */
  intervalMs?: number;
  /**
   * Ceiling for the backoff. Default 15 s.
   *
   * A thread response carries EVERY message, so a fixed 2 s poll held for the
   * 26 minutes NEX-2923 observed is ~780 full-transcript downloads. The backoff
   * keeps a short turn responsive and a long generation cheap.
   */
  maxIntervalMs?: number;
  /** Called after each poll, for progress narration. Must not throw. */
  onPoll?: (thread: PromptAssistantThreadResponse, elapsedMs: number) => void;
}

export interface WaitForThreadResult {
  /** The last state observed — present on EVERY outcome, timeout included. */
  thread: PromptAssistantThreadResponse;
  /** Why the wait ended. */
  outcome: "terminal" | "assistant-replied" | "generating" | "timed-out";
  waitedMs: number;
}

/** Statuses whose meaning is "ask again later", not "this is the answer". */
const PERMANENT_ERROR_STATUSES = new Set([400, 401, 403, 404]);

const DEFAULT_WAIT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_WAIT_INTERVAL_MS = 2_000;
const DEFAULT_WAIT_MAX_INTERVAL_MS = 15_000;

export class PromptAssistantResource extends BaseResource {
  async chat(body: PromptAssistantChatBody): Promise<PromptAssistantChatResponse> {
    return this.http.request<PromptAssistantChatResponse>("POST", "/prompt-assistant/chat", {
      body,
      // The assistant runs its own LLM calls before replying — minutes, not
      // seconds. The CLI states a longer deadline still for `prompt-assistant
      // chat`; this is the floor every other SDK caller now gets.
      timeoutMs: LONG_RUNNING_TIMEOUT_MS
    });
  }

  /**
   * List threads (newest first) for discovery / recovery of a thread whose
   * ID was lost (e.g. the creating chat call was killed before its response
   * was parsed). NEX-2084.
   */
  async listThreads(
    params?: ListPromptAssistantThreadsParams
  ): Promise<PageResponse<PromptAssistantThreadSummary>> {
    return this.http.requestPage<PromptAssistantThreadSummary>("GET", "/prompt-assistant/threads", {
      query: params as Record<string, string | number | undefined>
    });
  }

  async getThread(threadId: string): Promise<PromptAssistantThreadResponse> {
    return this.http.request<PromptAssistantThreadResponse>(
      "GET",
      `/prompt-assistant/threads/${threadId}`
    );
  }

  async deleteThread(threadId: string): Promise<{ deleted: boolean }> {
    return this.http.request<{ deleted: boolean }>(
      "DELETE",
      `/prompt-assistant/threads/${threadId}`
    );
  }

  /**
   * Block until the thread reaches the state the caller is actually waiting for,
   * instead of making them poll `getThread` and guess when to stop. NEX-2923.
   *
   * THE THING BEING WAITED FOR IS `promptResult`, AND IT ARRIVES MINUTES AFTER
   * THE ASSISTANT STOPS TALKING. `chat` returns immediately, the assistant's
   * reply lands seconds-to-minutes later, and the prompt is written by a second
   * background job that runs while the thread sits in `generating`. Two
   * production threads took 13 and 26 minutes end to end. A caller that stops
   * at the reply — or at `generating` — never learns the prompt exists.
   *
   * ⚠️ A TIMEOUT IS NOT A VERDICT AND IS NOT AN EXCEPTION HERE. The work
   * continues server-side, so the timeout comes back as
   * `outcome: "timed-out"` WITH the last observed thread, and the caller
   * resumes by calling this again with the same id. Throwing would force the
   * one payload the caller needs into an error's properties.
   *
   * ⚠️ `until: "prompt"` ON AN IDLE THREAD WAITS THE FULL TIMEOUT. A thread
   * whose assistant asked a question and is waiting for the user is
   * `in_progress` forever. Pass `afterMessageCount` (the wait then also ends on
   * that assistant's reply) whenever a turn was just sent.
   *
   * Transient failures are absorbed — a 500 or a dropped connection mid-wait is
   * retried until the deadline, since a half-hour poll that dies on one bad
   * response is the defect this method exists to remove. 400/401/403/404 are
   * rethrown at once: those do not become true by asking again.
   *
   * ```ts
   * const before = await client.promptAssistant.getThread(threadId);
   * await client.promptAssistant.chat({ message, mode: "agent", threadId });
   * const { thread, outcome } = await client.promptAssistant.waitForThread(threadId, {
   *   afterMessageCount: before.messages.length
   * });
   * if (outcome === "terminal" && thread.status === "completed") {
   *   console.log(thread.promptResult?.prompt);
   * }
   * ```
   */
  async waitForThread(threadId: string, opts?: WaitForThreadOptions): Promise<WaitForThreadResult> {
    const until = opts?.until ?? "prompt";
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const maxIntervalMs = opts?.maxIntervalMs ?? DEFAULT_WAIT_MAX_INTERVAL_MS;
    let intervalMs = Math.min(opts?.intervalMs ?? DEFAULT_WAIT_INTERVAL_MS, maxIntervalMs);

    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    // The user message the server saved for this turn does not count as a
    // reply, so the first message that can end the wait is the one after it.
    const replyArrivesAfter =
      opts?.afterMessageCount === undefined ? undefined : opts.afterMessageCount + 1;

    let thread = await this.pollThread(threadId, deadline);
    // ── Telling THIS turn's verdict from the PREVIOUS turn's ────────────────
    //
    // The server never resets `status` when a new user message arrives, so a
    // second turn on a `completed` thread starts life reading `completed` and
    // carrying the previous turn's `promptResult`. Reading that as an answer
    // hands the caller a stale prompt in the time it takes to make one request.
    //
    // A prompt is only ever produced by passing THROUGH `generating`, so a
    // terminal status is this turn's verdict when the wait saw `generating`, or
    // when the status moved at all since the wait began. Otherwise it is
    // left-over furniture and only the assistant's reply ends the wait.
    const initialStatus = thread.status;
    let sawGenerating = thread.status === "generating";

    for (;;) {
      // Narration is the caller's, and it cannot be allowed to end the wait: a
      // half-hour poll thrown away because a progress line failed to print is a
      // worse outcome than a silent progress line.
      try {
        opts?.onPoll?.(thread, Date.now() - startedAt);
      } catch {
        /* the caller's reporting, not the wait's business */
      }

      const waitedMs = Date.now() - startedAt;
      const terminal = isPromptAssistantTerminalStatus(thread.status);
      const replied =
        replyArrivesAfter !== undefined && this.hasAssistantReplyAfter(thread, replyArrivesAfter);
      const verdictIsThisTurn = sawGenerating || thread.status !== initialStatus;

      if (replyArrivesAfter === undefined) {
        // No turn was sent, so there is no stale-verdict problem to solve and
        // no reply to settle on: the status is the whole answer.
        if (terminal) return { thread, outcome: "terminal", waitedMs };
        if (thread.status === "generating" && until === "assistant-reply")
          return { thread, outcome: "generating", waitedMs };
      } else {
        // ⚠️ A REPLY IS ONLY ONE OF THE THREE THINGS THAT CAN END THIS WAIT, and
        // gating every exit on one is a hang.
        //
        // The service flips the status BEFORE it persists the assistant message,
        // and — when the model answers with a bare `newprompt` / `NewAITask`
        // tool call and no prose — it persists NO assistant message at all:
        // `handleAgentPromptGeneration` and `handleAiTaskPromptGeneration` both
        // guard the write with `if (assistantText)`. The thread then sits in
        // `generating` with nothing new to detect, and a reply-gated wait polls
        // straight through the whole generation. On the no-`--wait` path that
        // turned a prompt return into a five-minute timeout.
        //
        // So the STATUS is read first and the reply is the fallback.
        if (terminal && verdictIsThisTurn) {
          return { thread, outcome: "terminal", waitedMs };
        }
        if (thread.status === "generating") {
          // The assistant answered by STARTING the prompt. Only the shorter
          // wait ends here; `until: "prompt"` is waiting for what comes next.
          if (until === "assistant-reply") return { thread, outcome: "generating", waitedMs };
        } else if (replied) {
          // Either still `in_progress` — the assistant asked a follow-up
          // question and is waiting for the user, which no amount of waiting
          // changes — or a terminal status this turn did not produce.
          return { thread, outcome: "assistant-replied", waitedMs };
        }
      }

      // The whole budget is spent, and the LAST poll happens AT the deadline
      // rather than one interval short of it. Bailing as soon as the next sleep
      // would overshoot instead returns early — a `--wait-timeout 2` that gave
      // up after 0 s, reporting a duration it had not waited.
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        return { thread, outcome: "timed-out", waitedMs: Date.now() - startedAt };
      }
      await new Promise((r) => setTimeout(r, Math.min(intervalMs, remainingMs)));
      intervalMs = Math.min(intervalMs * 2, maxIntervalMs);
      thread = await this.pollThread(threadId, deadline);
      if (thread.status === "generating") sawGenerating = true;
    }
  }

  /** The assistant has spoken since `index`, and nothing is queued behind it. */
  private hasAssistantReplyAfter(thread: PromptAssistantThreadResponse, index: number): boolean {
    // `?? []` because this runs in a loop against a live response, and a body
    // that arrived without `messages` would otherwise turn a recoverable poll
    // into a TypeError that ends the whole wait.
    const messages = thread.messages ?? [];
    if (messages.length <= index) return false;
    // The LAST message, not "any after the index": a mid-turn `tool` message
    // (an InternetSearch result) is persisted before the assistant has
    // finished, and reading that as the reply returns half a turn.
    return messages[messages.length - 1]?.role === "assistant";
  }

  /** One poll, retrying transient failures until the wait's own deadline. */
  private async pollThread(
    threadId: string,
    deadline: number
  ): Promise<PromptAssistantThreadResponse> {
    for (;;) {
      try {
        return await this.getThread(threadId);
      } catch (err) {
        if (err instanceof NexusApiError && PERMANENT_ERROR_STATUSES.has(err.status)) throw err;
        if (Date.now() >= deadline) throw err;
        await new Promise((r) => setTimeout(r, DEFAULT_WAIT_INTERVAL_MS));
      }
    }
  }
}
