import type { PromptAssistantThreadResponse, WaitForThreadResult } from "@agent-nexus/sdk";
import { describe, expect, it } from "vitest";

import { waitDocument } from "./wait-document";

/**
 * THE `--json` DOCUMENT `nexus prompt-assistant chat` WRITES, PER OUTCOME.
 *
 * The property under test is a NEGATIVE one — that no key is absent — and an
 * absent key is exactly what a partial matcher cannot see.
 * `prompt-assistant-wait.test.ts` drives the real command through commander and
 * asserts this document with `toMatchObject`, which fails on neither an extra
 * key nor a missing one it does not name; its timeout arm passed unchanged both
 * before and after this change. So the claim "the key is now ALWAYS present"
 * needs an EXACT key set, over every outcome, which is what this file is for.
 *
 * ⚠️ ONE ARM PER `it`. A failing assertion throws and abandons the rest of its
 * own block, so a block with two arms is scored on whichever one a given mutant
 * reaches first — a property of the mutant, not of the writing order.
 */

const PROGRESS: PromptAssistantThreadResponse["progress"] = {
  state: "completed",
  isTerminal: true,
  since: "2026-11-21T10:00:00.000Z",
  elapsedSeconds: 3,
  lastActivityAt: "2026-11-21T10:00:03.000Z",
  serverTime: "2026-11-21T10:00:06.000Z"
};

/** Every value `WaitForThreadResult.outcome` can hold. The input space is four. */
const EVERY_OUTCOME = [
  "terminal",
  "assistant-replied",
  "generating",
  "timed-out"
] as const satisfies readonly WaitForThreadResult["outcome"][];

function resultWith(
  outcome: WaitForThreadResult["outcome"],
  thread: Partial<PromptAssistantThreadResponse> = {}
): WaitForThreadResult {
  return {
    outcome,
    waitedMs: 1_000,
    thread: {
      threadId: "t-1",
      status: "completed",
      messages: [{ role: "assistant", content: "done", timestamp: "" }],
      createdAt: "2026-11-21T10:00:00.000Z",
      updatedAt: null,
      progress: PROGRESS,
      ...thread
    }
  };
}

/** The document for each outcome, built once so the arms all read one capture. */
const DOCUMENTS = EVERY_OUTCOME.map((outcome) => ({
  outcome,
  doc: waitDocument(resultWith(outcome))
}));

const docFor = (outcome: WaitForThreadResult["outcome"]): Record<string, unknown> => {
  const found = DOCUMENTS.find((d) => d.outcome === outcome);
  // A missing capture would make every arm below assert over `undefined`, which
  // is the "the capture does not work" reading a negative arm cannot separate
  // from a correct one. Refuse instead of returning a hole.
  if (!found) throw new Error(`no captured document for outcome ${outcome}`);
  return found.doc;
};

describe("the wait document states its disposition on EVERY outcome", () => {
  /**
   * 🔴 THE DISCRIMINATING ARM. On the shape this replaces there is no `wait` key
   * at all, so this reads `undefined` and reds — which is the whole claim: a run
   * that did NOT time out now says so, where before it said nothing and left the
   * caller to read an absent key as `false`.
   */
  it("a terminal thread reports a RESOLVED wait", () => {
    expect(docFor("terminal").wait).toBe("resolved");
  });

  it("a timed-out wait reports a TIMED-OUT wait", () => {
    expect(docFor("timed-out").wait).toBe("timed-out");
  });

  it("an assistant reply reports a RESOLVED wait", () => {
    expect(docFor("assistant-replied").wait).toBe("resolved");
  });

  /**
   * The outcome most invited to be miscalled a timeout, and the one arm here
   * that is about this verb rather than about the shared derivation.
   * `generating` means the assistant answered and the prompt is still being
   * written — and the SDK returns it ONLY under `until: "assistant-reply"`, the
   * target the no-`--wait` path declares. So the poll ended ON its target. A
   * reading of "still generating, therefore we gave up" would publish
   * `timed-out` here and send a script back to re-wait on a turn that answered.
   */
  it("a reply that left the prompt generating is RESOLVED, not timed out", () => {
    expect(docFor("generating").wait).toBe("resolved");
  });
});

describe("no waiting key is ever absent", () => {
  /**
   * 🔴 THE SECOND DISCRIMINATING ARM, and the defect stated directly. Before,
   * `timedOut` was spread in only when true, so three of these four outcomes
   * omitted it and a consumer could not tell "did not time out" from "this CLI
   * cannot say". Presence, asserted over every outcome at once.
   */
  it("timedOut is PRESENT on every outcome", () => {
    expect(DOCUMENTS.filter(({ doc }) => !("timedOut" in doc)).map((d) => d.outcome)).toEqual([]);
  });

  /**
   * Presence and VALUE are separate claims and the arm above only makes the
   * first: a key present and always `true` would satisfy it. This is the value.
   */
  it("timedOut is false on exactly the outcomes that are not the timeout", () => {
    expect(DOCUMENTS.map(({ outcome, doc }) => [outcome, doc.timedOut])).toEqual([
      ["terminal", false],
      ["assistant-replied", false],
      ["generating", false],
      ["timed-out", true]
    ]);
  });

  it("waited is true on every outcome, because this document only exists after a poll", () => {
    expect(DOCUMENTS.filter(({ doc }) => doc.waited !== true).map((d) => d.outcome)).toEqual([]);
  });

  /**
   * The union's third member is unreachable from this verb — `waitDocument` is
   * only ever handed a `WaitForThreadResult`, which cannot exist without a poll
   * having run. Asserted as a SET and not as "never equals `not-requested`": a
   * bare negative would also pass if the key vanished or grew a fourth value,
   * and the positive half of the same `toEqual` is what rules both out.
   */
  it("this verb spells exactly two of the three wait dispositions", () => {
    expect([...new Set(DOCUMENTS.map(({ doc }) => doc.wait))].sort()).toEqual([
      "resolved",
      "timed-out"
    ]);
  });
});

describe("the exact key set, because a partial matcher cannot see an absence", () => {
  it("a thread with no prompt yet carries every key but promptResult", () => {
    expect(Object.keys(docFor("timed-out")).sort()).toEqual([
      "response",
      "status",
      "threadId",
      "timedOut",
      "wait",
      "waited"
    ]);
  });

  /**
   * The positive twin of the arm above over the SAME subject: `promptResult` is
   * absent there because the thread has none, not because the document dropped
   * it. One payload key stays conditional on purpose — absence means "no
   * payload", which is what absence natively says, and nothing is inferred from
   * it. That is the line between a payload and a terminal-state flag.
   */
  it("a thread carrying a prompt adds promptResult and nothing else", () => {
    const doc = waitDocument(
      resultWith("terminal", {
        promptResult: { prompt: "# The prompt", name: "Agent", description: "" }
      })
    );

    expect(Object.keys(doc).sort()).toEqual([
      "promptResult",
      "response",
      "status",
      "threadId",
      "timedOut",
      "wait",
      "waited"
    ]);
  });
});
