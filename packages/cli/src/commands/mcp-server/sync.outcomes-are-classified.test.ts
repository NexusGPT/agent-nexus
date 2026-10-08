/**
 * `mcp-server sync` TELLS A REFUSED ENQUEUE APART FROM A DISCOVERY THAT RAN AND FAILED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS PROTECTS, AND WHY THE FIRST VERSION WAS WRONG
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `POST /public/v1/mcp-servers/:serverId/sync` answers 202 when the job was queued AND
 * when the queue refused it, so the status line is not a verdict and the leaf reads the
 * row. That much was right. What was wrong is that it read `lastSyncOutcome` ALONE and
 * reported every `FAILED` as *"No discovery was queued"*.
 *
 * 🔴 `FAILED` IS TWO OPPOSITE FACTS. `DISCOVERY_NOT_QUEUED` means no discovery
 * happened; every other `McpSyncErrorCode` means one DID and the remote lost. The
 * vocabulary itself says so — `MCP_SYNC_ERROR_CODES` calls `DISCOVERY_NOT_QUEUED`
 * *"THE ONE CODE IN THIS LIST THAT IS NOT ABOUT THE REMOTE"*. And the leaf already
 * accepted `SUCCEEDED` as "the warm queue finished before I read", so the SAME race
 * against a remote that fails was a completed discovery rendered as a refused enqueue.
 * An operator or a script then retries, and waits for, work that already ran.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE DEFAULTS ARE THE RIGHT DIRECTION AND THEY ARE NOT DECISIONS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A member added to `McpSyncOutcome` lands in `unlisted`; a member added to
 * `MCP_SYNC_ERROR_CODES` lands in `ran-and-failed`. Both are the safe reading — one
 * refuses to claim anything, the other claims the thing true of every other member of
 * that family — and neither is a choice anybody made. So the totality arms read BOTH
 * published vocabularies at runtime, through the conformance module that is the only
 * file allowed to import `@nexus/types`, and require the hand-written tables to account
 * for every member. A new one is then a red with a reviewer deciding.
 *
 * ⚠️ TOTALITY AND DISPOSITION ARE DIFFERENT CLAIMS AND NEITHER SUBSUMES THE OTHER.
 * Totality says every value is accounted for; it says nothing about WHICH side any
 * value is on, and moving `DISCOVERY_NOT_QUEUED` into the ran-and-failed family keeps
 * every count exact while being precisely the defect this file is about. The per-value
 * arms are what refuse that, and they name their values literally for that reason.
 */
import { describe, expect, it } from "vitest";

import {
  PUBLISHED_MCP_SYNC_ERROR_CODES,
  PUBLISHED_MCP_SYNC_OUTCOMES
} from "../../mcp-sync-outcomes.conformance";
import { describeMcpSyncRefusal } from "./sync-refusal";
import {
  classifyMcpSyncAnswer,
  DISCOVERY_NOT_QUEUED_CODE,
  isAcceptedMcpSyncVerdict
} from "./sync-verdict";

/** The outcome values this release classifies by name rather than by default. */
const LISTED_OUTCOMES = ["QUEUED", "SUCCEEDED", "FAILED"] as const;

describe("mcp-server sync — the published vocabularies are accounted for", () => {
  it("🔴 lists every member of the McpSyncOutcome enum by name", () => {
    // The denominator is the enum's own, read at runtime — never a literal restated
    // here, which would be a second copy of the thing under test.
    expect([...LISTED_OUTCOMES].sort()).toEqual([...PUBLISHED_MCP_SYNC_OUTCOMES].sort());
  });

  it("🔬 CONTROL — both published readings are non-empty", () => {
    // Its own block, and not decoration: an import that resolved to an empty array
    // would make the arm above pass against an empty table just as happily, and that
    // is a green over no coverage at all.
    expect(PUBLISHED_MCP_SYNC_OUTCOMES.length).toBeGreaterThan(0);
    expect(PUBLISHED_MCP_SYNC_ERROR_CODES.length).toBeGreaterThan(0);
  });

  it("🔴 the one code it tests for is a REAL member of the error vocabulary", () => {
    // A typo here is the whole classifier: a misspelled constant makes every FAILED row
    // read as `ran-and-failed`, including the refused enqueue, and nothing else moves.
    expect(PUBLISHED_MCP_SYNC_ERROR_CODES).toContain(DISCOVERY_NOT_QUEUED_CODE);
  });

  it("🔴 and it is the ONLY member that means the discovery never started", () => {
    // Stated as a count over the published list rather than as a copy of it, so adding
    // a remote-failure code is free and adding a SECOND never-started code reds. That
    // second case is the one the `ran-and-failed` default would silently mishandle.
    const neverStarted = PUBLISHED_MCP_SYNC_ERROR_CODES.filter((code) =>
      /NOT_QUEUED|NOT_STARTED|NOT_ENQUEUED/.test(code)
    );

    expect(neverStarted).toEqual([DISCOVERY_NOT_QUEUED_CODE]);
  });
});

describe("mcp-server sync — which verdict each answer produces", () => {
  // Each its own block. A failing assertion throws and aborts the rest of its own
  // `it`, so two answers in one block would score only the first under any mutant that
  // moves both.

  it("🔴 QUEUED is the ordinary accepted answer", () => {
    const verdict = classifyMcpSyncAnswer("QUEUED", null);

    expect(verdict).toEqual({ outcome: "queued" });
    expect(isAcceptedMcpSyncVerdict(verdict)).toBe(true);
  });

  it("🔴 SUCCEEDED is accepted — a warm queue can finish before the response is composed", () => {
    const verdict = classifyMcpSyncAnswer("SUCCEEDED", null);

    expect(verdict).toEqual({ outcome: "already-succeeded" });
    expect(isAcceptedMcpSyncVerdict(verdict)).toBe(true);
  });

  it("🔴 FAILED + DISCOVERY_NOT_QUEUED is NOT-QUEUED — nothing ran, re-running is the cure", () => {
    const verdict = classifyMcpSyncAnswer("FAILED", DISCOVERY_NOT_QUEUED_CODE);

    expect(verdict).toEqual({ outcome: "not-queued" });
    expect(isAcceptedMcpSyncVerdict(verdict)).toBe(false);
  });

  it.each(["TIMEOUT", "UNREACHABLE", "AUTHORIZATION_REQUIRED", "INVALID_TOOL_LIST"])(
    "🔴 FAILED + %s is RAN-AND-FAILED — a discovery happened and re-running repeats it",
    (errorCode) => {
      // THE ARMS THIS FILE EXISTS FOR, and each is a real member of the published
      // vocabulary rather than a coined token — the control below covers the coined case
      // separately, because the two establish different things.
      expect(PUBLISHED_MCP_SYNC_ERROR_CODES).toContain(errorCode);

      const verdict = classifyMcpSyncAnswer("FAILED", errorCode);

      expect(verdict).toEqual({ outcome: "ran-and-failed", errorCode });
    }
  );

  it("🔴 FAILED + a code this release has never heard of is RAN-AND-FAILED, not NOT-QUEUED", () => {
    // The safe default, pinned. A newer pod can write a remote-failure class this build
    // does not list, and claiming "nothing was queued" over it would send an operator
    // to re-run a discovery that already happened.
    const verdict = classifyMcpSyncAnswer("FAILED", "A_FAILURE_CLASS_NOBODY_HAS_ADDED_YET");

    expect(verdict).toEqual({
      outcome: "ran-and-failed",
      errorCode: "A_FAILURE_CLASS_NOBODY_HAS_ADDED_YET"
    });
  });

  it("🔴 FAILED with NO code at all is still RAN-AND-FAILED, and says the code is missing", () => {
    // `McpServer_sync_error_code_iff_failed` makes this unrepresentable in the database,
    // so this arm is a guard against the type rather than against a reachable row — and
    // it is named as such. It must not collapse into NOT-QUEUED, which is the only
    // reading that would send an operator to re-run.
    expect(classifyMcpSyncAnswer("FAILED", null)).toEqual({
      outcome: "ran-and-failed",
      errorCode: "NO_CODE_RECORDED"
    });
  });

  it("🔴 null is UNLISTED and not accepted — a row recording nothing is not a queued discovery", () => {
    const verdict = classifyMcpSyncAnswer(null, null);

    expect(verdict).toEqual({ outcome: "unlisted", reported: "null" });
    expect(isAcceptedMcpSyncVerdict(verdict)).toBe(false);
  });

  it("🔴 an outcome this release has never heard of is UNLISTED, never accepted", () => {
    const verdict = classifyMcpSyncAnswer("A_MEMBER_NOBODY_HAS_ADDED_YET", null);

    expect(verdict).toEqual({ outcome: "unlisted", reported: "A_MEMBER_NOBODY_HAS_ADDED_YET" });
    expect(isAcceptedMcpSyncVerdict(verdict)).toBe(false);
  });
});

describe("mcp-server sync — the error document a refusal produces", () => {
  // The `code` field is the whole of the structural `--json` claim: a script branches on
  // it rather than on prose. Until `describeMcpSyncRefusal` was a pure function this was
  // assertable only by spying on stdout, so it was not asserted at all.
  const refusalFor = (outcome: string, errorCode: string | null) =>
    describeMcpSyncRefusal(classifyMcpSyncAnswer(outcome, errorCode), "Circleback", "srv-1");

  it("🔴 a refused enqueue carries CLI_MCP_DISCOVERY_NOT_QUEUED", () => {
    expect(refusalFor("FAILED", DISCOVERY_NOT_QUEUED_CODE).code).toBe(
      "CLI_MCP_DISCOVERY_NOT_QUEUED"
    );
  });

  it("🔴 a discovery that RAN and failed carries CLI_MCP_DISCOVERY_FAILED", () => {
    // 🔴 THE ARM THE WHOLE SPLIT EXISTS FOR. Routing both through `reportFailure` would
    // emit `CLI_REMOTE_ERROR` for each, and this is the assertion that would red.
    expect(refusalFor("FAILED", "TIMEOUT").code).toBe("CLI_MCP_DISCOVERY_FAILED");
  });

  it("🔴 the two codes DIFFER — one code for two opposite remedies is the defect", () => {
    // Stated as an inequality rather than two literals, so a rename stays free and a
    // collapse does not. Its own block: a mutant merging the arms moves both arms above
    // and one `it` would score only the first.
    expect(refusalFor("FAILED", DISCOVERY_NOT_QUEUED_CODE).code).not.toBe(
      refusalFor("FAILED", "TIMEOUT").code
    );
  });

  it("🔴 an unlisted outcome is reported, not silently accepted", () => {
    expect(refusalFor("A_MEMBER_NOBODY_HAS_ADDED_YET", null).code).toBe("CLI_MCP_DISCOVERY_FAILED");
  });

  it("🔴 every arm exits non-zero, and on the same code — the goal did not happen", () => {
    const codes = [
      refusalFor("FAILED", DISCOVERY_NOT_QUEUED_CODE).exitCode,
      refusalFor("FAILED", "TIMEOUT").exitCode,
      refusalFor("A_MEMBER_NOBODY_HAS_ADDED_YET", null).exitCode
    ];

    expect(new Set(codes).size).toBe(1);
    expect(codes[0]).toBeGreaterThan(0);
  });

  it("🔬 CONTROL — the message names the server, so the three are not one shared string", () => {
    // Without this, every arm above would pass against a function returning one constant
    // descriptor, and the per-arm prose would be unchecked.
    expect(refusalFor("FAILED", "TIMEOUT").message).toContain("Circleback");
    expect(refusalFor("FAILED", "TIMEOUT").message).toContain("TIMEOUT");
  });
});
