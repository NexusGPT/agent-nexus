import { describe, expect, it, vi } from "vitest";

import { NexusApiError } from "../errors";
import type { HttpClient } from "../http-client";
import {
  isPromptAssistantTerminalStatus,
  PromptAssistantResource,
  type PromptAssistantThreadResponse
} from "./prompt-assistant";

/**
 * NEX-2923: the prompt is delivered when it is ready, without the caller asking
 * repeatedly.
 *
 * `chat` returns immediately with an empty response, the assistant's reply lands
 * asynchronously, and the PROMPT is written by a second background job while the
 * thread sits in `generating`. Two production threads took 13 and 26 minutes end
 * to end (`2acfedbb…` and `dc3763c1…`, both COMPLETED, measured on the row's own
 * createdAt/updatedAt). Nothing pushed; the only signal was a repeated GET.
 *
 * These specs pin the state machine that removes the polling, and in particular
 * the two states that look like an answer and are not:
 *
 *   · `generating` — the reply is in, the prompt is NOT. This is where the CLI
 *     used to stop, and stopping here is the defect.
 *   · a STALE terminal status — a second turn on a `completed` thread starts
 *     life reading `completed`, carrying the PREVIOUS turn's promptResult,
 *     because the server never resets the status when a user message arrives.
 */

type Turn = Partial<PromptAssistantThreadResponse>;

const msg = (role: string, content = "…") => ({ role, content, timestamp: "2026-07-24T20:00:00Z" });

/**
 * A resource whose every poll returns the next scripted thread state, and whose
 * timers are the fake ones — so a 26-minute wait runs in microseconds.
 */
function resourceReturning(turns: Turn[]): {
  resource: PromptAssistantResource;
  polls: () => number;
} {
  let index = 0;
  const request = vi.fn(async () => {
    const turn = turns[Math.min(index, turns.length - 1)];
    index++;
    return {
      threadId: "t-1",
      status: "in_progress",
      messages: [],
      ...turn
    } as PromptAssistantThreadResponse;
  });

  return {
    resource: new PromptAssistantResource({ request } as unknown as HttpClient),
    polls: () => index
  };
}

/** Drive a wait to completion under fake timers. */
async function runWait<T>(work: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  try {
    // Settled BEFORE the timer loop: a wait that rejects on its first poll would
    // otherwise reject while nothing is attached, and vitest reports that as an
    // unhandled rejection even though the assertion below catches it.
    const settled = work().then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error })
    );
    // Each `await` yields once; advancing past every scheduled sleep repeatedly
    // is what lets a scripted 30-minute poll finish inside the test.
    for (let i = 0; i < 500; i++) {
      await vi.advanceTimersByTimeAsync(20_000);
    }
    const outcome = await settled;
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  } finally {
    vi.useRealTimers();
  }
}

describe("the terminal set has three members, not two", () => {
  it("counts completed, failed AND cancelled as final", () => {
    expect(isPromptAssistantTerminalStatus("completed")).toBe(true);
    expect(isPromptAssistantTerminalStatus("failed")).toBe(true);
    // The one the 4-value response schema omitted. A wait loop that trusted
    // that union polls a stopped thread until its own deadline.
    expect(isPromptAssistantTerminalStatus("cancelled")).toBe(true);
  });

  it("does NOT count generating — the state the prompt is written in", () => {
    expect(isPromptAssistantTerminalStatus("generating")).toBe(false);
    expect(isPromptAssistantTerminalStatus("in_progress")).toBe(false);
  });
});

describe("waitForThread waits THROUGH generating, which is the whole point", () => {
  it("does not return at generating — it returns when the prompt exists", async () => {
    const { resource } = resourceReturning([
      { status: "in_progress", messages: [msg("user")] },
      { status: "generating", messages: [msg("user"), msg("assistant")] },
      { status: "generating", messages: [msg("user"), msg("assistant")] },
      {
        status: "completed",
        messages: [msg("user"), msg("assistant"), msg("assistant")],
        promptResult: { prompt: "# Agent", name: "Agent", description: "" }
      }
    ]);

    const result = await runWait(() =>
      resource.waitForThread("t-1", { afterMessageCount: 0, timeoutMs: 30 * 60 * 1000 })
    );

    expect(result.outcome).toBe("terminal");
    expect(result.thread.status).toBe("completed");
    expect(result.thread.promptResult?.prompt).toBe("# Agent");
  });

  it("stops at generating when the caller only wants the conversational reply", async () => {
    const { resource } = resourceReturning([
      { status: "generating", messages: [msg("user"), msg("assistant")] }
    ]);

    const result = await runWait(() =>
      resource.waitForThread("t-1", {
        until: "assistant-reply",
        afterMessageCount: 0,
        timeoutMs: 60_000
      })
    );

    expect(result.outcome).toBe("generating");
  });

  it("settles on a BARE generating — no assistant message is ever written for it", async () => {
    // `handleAgentPromptGeneration` writes the status and then guards the
    // message with `if (assistantText)`. A model that answers with a bare
    // `newprompt` tool call and no prose produces an empty string, so the
    // thread reaches `generating` with NO new message. A wait that required a
    // reply polled through the whole generation and timed out instead of
    // returning — on the default, no-`--wait` path.
    const { resource } = resourceReturning([
      { status: "in_progress", messages: [msg("user")] },
      { status: "generating", messages: [msg("user")] }
    ]);

    const result = await runWait(() =>
      resource.waitForThread("t-1", {
        until: "assistant-reply",
        afterMessageCount: 0,
        timeoutMs: 5 * 60 * 1000
      })
    );

    expect(result.outcome).toBe("generating");
    expect(result.waitedMs).toBeLessThan(60_000);
  });

  it("still reaches the prompt when no assistant message is written for the turn", async () => {
    // The same bare-tool-call turn under `--wait`: `generating` must NOT end it,
    // and the terminal status must be honoured without a reply to lean on.
    const { resource } = resourceReturning([
      { status: "generating", messages: [msg("user")] },
      { status: "generating", messages: [msg("user")] },
      {
        status: "completed",
        messages: [msg("user")],
        promptResult: { prompt: "# Agent", name: "Agent", description: "" }
      }
    ]);

    const result = await runWait(() =>
      resource.waitForThread("t-1", { afterMessageCount: 0, timeoutMs: 30 * 60 * 1000 })
    );

    expect(result.outcome).toBe("terminal");
    expect(result.thread.promptResult?.prompt).toBe("# Agent");
  });

  it("ends on a follow-up question rather than waiting out a prompt that is not coming", async () => {
    // The assistant asked something and is waiting for the user. `in_progress`
    // is not a state waiting ever leaves, so a wait that only watched the status
    // would burn its whole timeout here.
    const { resource } = resourceReturning([
      { status: "in_progress", messages: [msg("user")] },
      { status: "in_progress", messages: [msg("user"), msg("assistant", "Which channels?")] }
    ]);

    const result = await runWait(() =>
      resource.waitForThread("t-1", { afterMessageCount: 0, timeoutMs: 30 * 60 * 1000 })
    );

    expect(result.outcome).toBe("assistant-replied");
    expect(result.thread.status).toBe("in_progress");
  });

  it("does not read a mid-turn tool message as the assistant's reply", async () => {
    // An InternetSearch result is persisted BEFORE the assistant has finished.
    const { resource } = resourceReturning([
      { status: "in_progress", messages: [msg("user"), msg("tool", "[InternetSearch results]")] },
      {
        status: "in_progress",
        messages: [msg("user"), msg("tool"), msg("assistant", "Here is what I found")]
      }
    ]);

    const result = await runWait(() =>
      resource.waitForThread("t-1", { afterMessageCount: 0, timeoutMs: 60_000 })
    );

    expect(result.outcome).toBe("assistant-replied");
    // Indexed, not `.at(-1)`: this package targets ES2020 and `Array.prototype.at`
    // is ES2022, so the tidier spelling is a typecheck failure here.
    const { messages } = result.thread;
    expect(messages[messages.length - 1]?.content).toBe("Here is what I found");
  });
});

describe("a terminal status left over from the previous turn is not this turn's answer", () => {
  const staleCompleted = {
    status: "completed" as const,
    promptResult: { prompt: "OLD PROMPT", name: "Old", description: "" }
  };

  it("keeps waiting while a second turn is still being answered", async () => {
    // Turn 2 on a completed thread: the status says `completed` from turn 1 and
    // the promptResult is turn 1's. Returning here hands back a stale prompt in
    // the time it takes to make one request.
    const { resource } = resourceReturning([
      { ...staleCompleted, messages: [msg("user"), msg("assistant"), msg("user")] },
      {
        ...staleCompleted,
        status: "generating",
        messages: [msg("user"), msg("assistant"), msg("user"), msg("assistant")]
      },
      {
        status: "completed",
        messages: [msg("user"), msg("assistant"), msg("user"), msg("assistant"), msg("assistant")],
        promptResult: { prompt: "NEW PROMPT", name: "New", description: "" }
      }
    ]);

    const result = await runWait(() =>
      resource.waitForThread("t-1", { afterMessageCount: 2, timeoutMs: 30 * 60 * 1000 })
    );

    expect(result.outcome).toBe("terminal");
    expect(result.thread.promptResult?.prompt).toBe("NEW PROMPT");
  });

  it("reports a reply, not a verdict, when the turn never regenerated", async () => {
    // Same stale `completed`, but this turn was a question-and-answer that
    // produced no new prompt. Calling that "terminal" would let a caller read
    // turn 1's prompt as turn 2's output.
    const { resource } = resourceReturning([
      { ...staleCompleted, messages: [msg("user"), msg("assistant"), msg("user")] },
      {
        ...staleCompleted,
        messages: [msg("user"), msg("assistant"), msg("user"), msg("assistant", "Which tone?")]
      }
    ]);

    const result = await runWait(() =>
      resource.waitForThread("t-1", { afterMessageCount: 2, timeoutMs: 30 * 60 * 1000 })
    );

    expect(result.outcome).toBe("assistant-replied");
  });

  it("takes the status at face value when no turn was sent", async () => {
    // `get-thread --wait` has no baseline: the caller is asking about the
    // thread, not about a turn, so the status IS the answer.
    const { resource } = resourceReturning([staleCompleted]);

    const result = await runWait(() => resource.waitForThread("t-1", { timeoutMs: 60_000 }));

    expect(result.outcome).toBe("terminal");
  });
});

describe("a timeout is an outcome, not an exception", () => {
  it("comes back with the last observed thread so the caller can resume", async () => {
    const { resource } = resourceReturning([{ status: "generating", messages: [msg("user")] }]);

    const result = await runWait(() =>
      resource.waitForThread("t-1", { afterMessageCount: 0, timeoutMs: 30_000 })
    );

    expect(result.outcome).toBe("timed-out");
    // The payload the caller needs is on the result, not buried in an error.
    expect(result.thread.status).toBe("generating");
    expect(result.thread.threadId).toBe("t-1");
  });

  it("spends the WHOLE budget before giving up", async () => {
    // Stopping as soon as the next sleep would overshoot meant a 30 s wait
    // could return after 16 s — and report the duration it had not waited.
    const { resource } = resourceReturning([{ status: "generating", messages: [] }]);

    const result = await runWait(() => resource.waitForThread("t-1", { timeoutMs: 30_000 }));

    expect(result.outcome).toBe("timed-out");
    expect(result.waitedMs).toBeGreaterThanOrEqual(30_000);
  });

  it("backs off, so a half-hour wait is not hundreds of full-transcript reads", async () => {
    const { resource, polls } = resourceReturning([{ status: "generating", messages: [] }]);

    await runWait(() => resource.waitForThread("t-1", { timeoutMs: 30 * 60 * 1000 }));

    // Fixed 2 s polling for 30 minutes is 900 requests, each carrying every
    // message in the thread. The backoff keeps it near two figures.
    expect(polls()).toBeLessThan(150);
  });
});

describe("a long wait survives a bad response but not a bad request", () => {
  it("retries a transient server error instead of losing the whole wait", async () => {
    let call = 0;
    const request = vi.fn(async () => {
      call++;
      if (call === 1) throw new NexusApiError("SERVER_ERROR", "boom", 500);
      return {
        threadId: "t-1",
        status: "completed",
        messages: [],
        promptResult: { prompt: "p", name: "n", description: "" }
      } as PromptAssistantThreadResponse;
    });
    const resource = new PromptAssistantResource({ request } as unknown as HttpClient);

    const result = await runWait(() => resource.waitForThread("t-1", { timeoutMs: 60_000 }));

    expect(result.outcome).toBe("terminal");
    expect(call).toBeGreaterThan(1);
  });

  it("rethrows a 404 at once — it does not become true by asking again", async () => {
    const request = vi.fn(async () => {
      throw new NexusApiError("NOT_FOUND", "no such thread", 404);
    });
    const resource = new PromptAssistantResource({ request } as unknown as HttpClient);

    await expect(
      runWait(() => resource.waitForThread("t-1", { timeoutMs: 30 * 60 * 1000 }))
    ).rejects.toThrow("no such thread");
    expect(request).toHaveBeenCalledTimes(1);
  });
});
