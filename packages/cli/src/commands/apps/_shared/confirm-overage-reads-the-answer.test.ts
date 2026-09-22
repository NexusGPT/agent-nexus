import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type TriggerDeploymentResponse } from "../../../vibe-wire-types";

/**
 * THE SPEND PROMPT'S OWN COMMENT CLAIMED THE "SAME READLINE IDIOM AS THE
 * DESTRUCTIVE-DELETE CONFIRMATIONS ELSEWHERE IN THE CLI". IT WAS NOT.
 *
 * Two disagreements with `confirmDestructive`, in eleven lines:
 *
 *   · `rl.close()` on the HAPPY PATH ONLY. An interface left open holds stdin,
 *     so a read that THROWS leaves the process alive with nothing to answer it —
 *     a hang rather than a report, on a gate whose whole job is to refuse
 *     safely. `confirmDestructive` and the skills-target prompt both closed in a
 *     `finally`; this one did not.
 *   · `.toLowerCase()` with NO `.trim()`. So `"y "` reads as NO, and so does a
 *     CRLF `"y\r"` — which is what a Windows terminal and any file with CRLF
 *     line endings actually deliver. The operator types `y`, is told the deploy
 *     was aborted, and nothing about the output says why.
 *
 * ── Why the CRLF case gets its own arm ──────────────────────────────────────
 *
 * It is the one a reader does not picture. `"y "` is a visible typo; `"y\r"` is
 * a correct answer from a correct terminal on the platform nobody tests on, and
 * it renders identically to `"y"` in every log.
 *
 * ── Why the refusal arm is not optional ─────────────────────────────────────
 *
 * Every accept arm below is satisfied by a function that returns `true`
 * unconditionally. The `"n"` case is what makes them mean anything.
 */

const { question, close } = vi.hoisted(() => ({ question: vi.fn(), close: vi.fn() }));

// The prompt reaches readline through a DYNAMIC import, so the mock stands in
// for the module rather than for a helper this file owns.
vi.mock("node:readline/promises", () => ({
  createInterface: () => ({ question, close })
}));

const { confirmOverageInteractively } = await import("./confirm-overage-interactively");

const CONFIRMATION_REQUIRED: Extract<
  TriggerDeploymentResponse,
  { status: "confirmation_required" }
> = {
  status: "confirmation_required",
  reason: {
    costSafetyStatus: "OVER_SOFT_LIMIT",
    message: "This organization is over its Vibe usage cap for the current period."
  }
};

const RERUN = "nexus apps deploy app-1 --sha 1a2b3c4 --confirm-overage";

let realStdinIsTty: PropertyDescriptor | undefined;
let realStderrWrite: typeof process.stderr.write;
let realStdoutWrite: typeof process.stdout.write;

beforeEach(() => {
  question.mockReset();
  close.mockReset();

  // A TTY, because the non-interactive arm returns before readline is ever
  // reached and every case below is about what happens once it IS reached.
  realStdinIsTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  Object.defineProperty(process.stdin, "isTTY", {
    value: true,
    configurable: true,
    writable: true
  });

  // The preamble and the acknowledgement go to `promptStream()`. Swallow both
  // streams so a deliberate exercise of this branch does not decorate the run.
  realStderrWrite = process.stderr.write.bind(process.stderr);
  realStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stderr.write = (() => true) as typeof process.stderr.write;
  process.stdout.write = (() => true) as typeof process.stdout.write;
});

afterEach(() => {
  process.stderr.write = realStderrWrite;
  process.stdout.write = realStdoutWrite;
  if (realStdinIsTty === undefined) {
    delete (process.stdin as { isTTY?: boolean }).isTTY;
  } else {
    Object.defineProperty(process.stdin, "isTTY", realStdinIsTty);
  }
});

describe("the spend prompt reads the answer the operator actually gave", () => {
  it("accepts a CRLF `y\\r`, which is what a Windows terminal delivers", async () => {
    question.mockResolvedValue("y\r");

    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(true);
  });

  it("accepts `y ` with a trailing space", async () => {
    question.mockResolvedValue("y ");

    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(true);
  });

  it("CONTROL — still refuses a real `n`", async () => {
    question.mockResolvedValue("n");

    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(false);
  });

  it("CONTROL — the question was actually asked", async () => {
    question.mockResolvedValue("y");

    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(true);
    // Without this, every arm above would be satisfied by a branch that never
    // reached readline at all.
    expect(question).toHaveBeenCalledTimes(1);
  });
});

describe("the spend prompt releases stdin when the read FAILS", () => {
  it("closes the interface when `rl.question` throws", async () => {
    question.mockRejectedValue(new Error("stdin closed mid-question"));

    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).rejects.toThrow(
      "stdin closed mid-question"
    );

    // 🚨 THE ARM THIS FILE EXISTS FOR. An unclosed interface holds stdin, and a
    // process holding stdin does not exit — so the failure mode is a CLI that
    // hangs forever rather than one that reports. Observed on the interface's
    // own `close`, because "the process would have exited" is not a thing a
    // spec can assert about the runner it is inside.
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("CONTROL — closes the interface on the ordinary path too", async () => {
    question.mockResolvedValue("y");

    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
