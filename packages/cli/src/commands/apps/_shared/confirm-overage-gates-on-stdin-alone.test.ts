import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../../../output";
import { type TriggerDeploymentResponse } from "../../../vibe-wire-types";

/**
 * THE SPEND PROMPT GATES ON STDIN ALONE — THE FOUR STATES, NOT THE ONE THAT MOVED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `--json` IS NOT A STATEMENT ABOUT WHO IS ANSWERING. STDIN IS.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This gate used to read `isJsonMode() || !process.stdin.isTTY`, so `--json` at a
 * terminal refused a question a person was standing right there to answer — the
 * same drift `confirm.destructive.ts`'s header records against this very file.
 * It now reads `!process.stdin.isTTY` alone, converging on its sibling.
 *
 * ── WHY ASKING CANNOT CORRUPT THE `--json` DOCUMENT ─────────────────────────
 *
 * `promptStream()` returns stdout only when `process.stdout.isTTY && !process
 * .stderr.isTTY`, so every reachable instance of the question landing on stdout
 * has stdout ON A TERMINAL — which is the one case where nothing is parsing it.
 * For a caller to parse stdout it must be a pipe or a file, and then the question
 * goes to stderr by construction. The document a `--json` run promises is the one
 * a machine reads, and the question never reaches it.
 *
 * ── WHY ALL FOUR STATES ARE PINNED AND NOT JUST THE ONE THAT CHANGED ────────
 *
 * The condition has two inputs, so it has four states and exactly one of them
 * moved. A spec covering only the moved row cannot tell "I changed one branch"
 * from "I changed the branch and flattened the other three" — which is precisely
 * what dropping a disjunct risks. The three unchanged rows are the regression
 * surface, so they are asserted here rather than assumed.
 *
 * ── WHY EVERY NEGATIVE ARM IS PAIRED ────────────────────────────────────────
 *
 * "No error document was printed" is satisfied by a run that printed NOTHING —
 * a mis-wired capture, a helper that returned before doing anything — as readily
 * as by the correct behaviour. So each arm asserting an absence also asserts
 * something PRESENT in the same captured output, and the refusal rows prove that
 * stdout and stderr can carry a document at all.
 */

const { question, close } = vi.hoisted(() => ({ question: vi.fn(), close: vi.fn() }));

// `askLine` chains `rl.once("SIGINT", …).once("close", …)` before it asks, so the
// stand-in has to be chainable. Returning the same object is what makes it so —
// an interface without `once` throws inside the abort promise's executor, which
// `askLine` swallows, and the spec then passes for a reason that has nothing to
// do with the branch under test.
// The three members `askLine` touches, annotated because `once` returns the
// object it lives on and an inferred self-reference is TS7022.
interface ReadlineStandIn {
  readonly question: typeof question;
  readonly close: typeof close;
  readonly once: () => ReadlineStandIn;
}

vi.mock("node:readline/promises", () => {
  const rl: ReadlineStandIn = {
    question,
    close,
    once: () => rl
  };
  return { createInterface: () => rl };
});

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

interface Captured {
  readonly stdout: string;
  readonly stderr: string;
}

let realStdinIsTty: PropertyDescriptor | undefined;
let out: string[] = [];
let err: string[] = [];
let realLog: typeof console.log;
let realError: typeof console.error;
let realStdoutWrite: typeof process.stdout.write;
let realStderrWrite: typeof process.stderr.write;

/** Both channels, so an absence on one is read against a presence on the other. */
function captured(): Captured {
  return { stdout: out.join("\n"), stderr: err.join("\n") };
}

/**
 * Pin stdin, which is what the gate reads. The runner's ambient value is
 * `undefined` — measured — so a spec that does not set it is testing the
 * no-terminal rows twice and the terminal rows never.
 */
function setStdinTty(isTty: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", {
    value: isTty,
    configurable: true,
    writable: true
  });
}

beforeEach(() => {
  question.mockReset();
  close.mockReset();
  out = [];
  err = [];

  realStdinIsTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");

  realLog = console.log;
  realError = console.error;
  realStdoutWrite = process.stdout.write.bind(process.stdout);
  realStderrWrite = process.stderr.write.bind(process.stderr);

  console.log = (...args: unknown[]): void => void out.push(args.map(String).join(" "));
  console.error = (...args: unknown[]): void => void err.push(args.map(String).join(" "));
  process.stdout.write = ((text: string | Uint8Array): boolean => {
    out.push(typeof text === "string" ? text.replace(/\n$/, "") : "");
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((text: string | Uint8Array): boolean => {
    err.push(typeof text === "string" ? text.replace(/\n$/, "") : "");
    return true;
  }) as typeof process.stderr.write;
});

afterEach(() => {
  console.log = realLog;
  console.error = realError;
  process.stdout.write = realStdoutWrite;
  process.stderr.write = realStderrWrite;

  setJsonMode(false);

  if (realStdinIsTty === undefined) {
    delete (process.stdin as { isTTY?: boolean }).isTTY;
  } else {
    Object.defineProperty(process.stdin, "isTTY", realStdinIsTty);
  }
});

describe("no --json, no terminal: refuses with a document", () => {
  it("refuses, and never reaches the question", async () => {
    setJsonMode(false);
    setStdinTty(false);

    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(false);
    expect(question).not.toHaveBeenCalled();
  });

  it("names the re-run on the human channel", async () => {
    setJsonMode(false);
    setStdinTty(false);

    await confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN);

    // The PAIR for the `not.toHaveBeenCalled` above: this run demonstrably
    // produced output, so that absence is about the branch and not about a
    // capture that recorded nothing.
    const { stderr } = captured();
    expect(stderr).toContain("nothing was deployed");
    expect(stderr).toContain("--confirm-overage");
  });
});

describe("no --json, at a terminal: asks", () => {
  it("asks, and returns the answer", async () => {
    setJsonMode(false);
    setStdinTty(true);
    question.mockResolvedValue("y");

    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(true);
    expect(question).toHaveBeenCalledTimes(1);
  });

  it("CONTROL — a real `n` still declines", async () => {
    setJsonMode(false);
    setStdinTty(true);
    question.mockResolvedValue("n");

    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(false);
    expect(question).toHaveBeenCalledTimes(1);
  });
});

describe("--json, no terminal: refuses with an error DOCUMENT on stdout", () => {
  it("puts one parseable error document on stdout, and never asks", async () => {
    setJsonMode(true);
    setStdinTty(false);

    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(false);
    expect(question).not.toHaveBeenCalled();

    // 🚨 THIS ARM IS THE POSITIVE CONTROL FOR THE `--json` AT-A-TERMINAL ROW
    // BELOW. That row asserts stdout carries NO document; this one proves the
    // same capture, on the same channel, DOES carry one when the branch runs.
    // Without it, the absence below passes over a broken stdout capture.
    const { stdout } = captured();
    const document = JSON.parse(stdout.trim()) as {
      error: { message: string; hint: string | null; code: string };
    };
    expect(document.error.code).toBe("CLI_REMOTE_ERROR");
    expect(document.error.message).toContain("nothing was deployed");
    expect(document.error.hint).toContain("OVER_SOFT_LIMIT");
  });

  it("never puts the confirmation payload's own status on stdout", async () => {
    setJsonMode(true);
    setStdinTty(false);

    await confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN);

    const { stdout } = captured();
    // Paired: the document IS there (so the haystack is real), and the payload
    // key is not. A consumer reading `.status` must never find
    // "confirmation_required" where a successful deploy puts "created".
    expect(stdout).toContain("CLI_REMOTE_ERROR");
    expect(stdout).not.toContain("confirmation_required");
  });
});

describe("--json AT A TERMINAL: asks — the one row that changed", () => {
  it("asks instead of refusing, and returns the answer", async () => {
    setJsonMode(true);
    setStdinTty(true);
    question.mockResolvedValue("y");

    // 🚨 THE WHOLE POINT. Under `isJsonMode() || !process.stdin.isTTY` this
    // resolved false having printed a refusal, with an operator sitting at the
    // keyboard able to answer. `--json` describes the OUTPUT; stdin is the only
    // test of who is answering.
    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(true);
    expect(question).toHaveBeenCalledTimes(1);
  });

  it("prints NO error document on stdout, while the preamble still reaches the operator", async () => {
    setJsonMode(true);
    setStdinTty(true);
    question.mockResolvedValue("y");

    await confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN);

    const { stdout, stderr } = captured();
    // The PRESENT half, asserted first so the absence below is read against a
    // run that demonstrably produced output: the figures the y/N refers to went
    // to the operator.
    expect(stderr).toContain("OVER_SOFT_LIMIT");
    // The ABSENT half: no refusal document, because nothing was refused. The
    // row above proves this very capture can hold one.
    expect(stdout).not.toContain("CLI_REMOTE_ERROR");
    expect(stdout).not.toContain("nothing was deployed");
  });

  it("CONTROL — a real `n` declines, and the decline keeps the re-run hint", async () => {
    setJsonMode(true);
    setStdinTty(true);
    question.mockResolvedValue("n");

    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(false);

    // The decline hint is one of the four reasons this gate does NOT route
    // through `confirmDestructive`, whose decline prints "Aborted." and nothing
    // else — losing the re-run line that `confirm.stream.ts`'s header records
    // as a measured defect.
    expect(captured().stderr).toContain("--confirm-overage");
  });
});
