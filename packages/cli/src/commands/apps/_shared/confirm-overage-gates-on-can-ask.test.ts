import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../../../output";
import { type TriggerDeploymentResponse } from "../../../vibe-wire-types";

/**
 * THE SPEND PROMPT GATES ON `canAsk()` — EVERY STATE, NOT THE ONE THAT MOVED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `--json` IS NOT A STATEMENT ABOUT WHO IS ANSWERING. THE STREAMS ARE — AND
 *    THAT IS BOTH OF THEM, NEVER STDIN ALONE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This gate read `isJsonMode() || !process.stdin.isTTY`, so `--json` at a
 * terminal refused a question a person was standing right there to answer — the
 * same drift `confirm.destructive.ts`'s header records against this very file.
 * Dropping the `--json` disjunct left `!process.stdin.isTTY`, which is the OTHER
 * half-test and carries a hang of its own: `apps deploy >out.log 2>err.log`
 * typed at a real keyboard passes a stdin gate, `promptStream()` resolves to
 * err.log, and the operator watches a blank terminal while the process blocks on
 * a keystroke nobody was asked for. On a SPEND gate, whose whole purpose is to
 * refuse safely, and in CI it burns to the job timeout with no document and no
 * exit code to read.
 *
 * It now reads `!canAsk()` — stdin AND the prompt stream, one answer — so the
 * ask is unreachable in exactly the case where the question would be invisible.
 * `util/confirm.stream.ts` owns the reasoning and
 * `util/confirm-refuses-when-the-question-cannot-be-seen.test.ts` pins the
 * primitive's own truth table; this file pins THIS CALLER against it, because a
 * primitive nobody calls protects nothing.
 *
 * ── WHY EVERY ROW PINS ALL THREE STREAMS ────────────────────────────────────
 *
 * `canAsk()` reads three properties, so a spec pinning only stdin reads the
 * RUNNER'S ambient stdout and stderr. Measured under this runner: all three are
 * `undefined`, which is not a terminal — so a stdin-only "at a terminal" row
 * made `canAsk()` false and tested the refusal branch twice while believing it
 * tested both. It also made the verdict depend on whether the developer's own
 * terminal was attached, so the file could pass by hand and fail in CI.
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
 * ── WHY THE UNCHANGED ROWS ARE PINNED AND NOT JUST THE ONE THAT MOVED ───────
 *
 * Exactly one row moved: a terminal with BOTH outputs redirected, which used to
 * ask and now refuses. A spec covering only that row cannot tell "I changed one
 * branch" from "I changed the branch and flattened the others" — which is
 * precisely what tightening a gate risks, and the direction that costs is the
 * reachable one: narrowing too far turns a question a person could answer into a
 * refusal plus a wasted re-run. So `--json` at a terminal, a terminal with one
 * output redirected, and no terminal at all are all asserted here rather than
 * assumed.
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

const STREAMS = ["stdin", "stdout", "stderr"] as const;
type Stream = (typeof STREAMS)[number];

let realIsTty: Partial<Record<Stream, PropertyDescriptor | undefined>> = {};
let realExitCode: typeof process.exitCode;
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
 * Pin ALL THREE streams, because `canAsk()` reads all three. The runner's
 * ambient values are `undefined` — measured — so a row that sets only stdin is
 * testing the refusal branch twice and the ask branch never, and its verdict
 * moves with whether the developer's terminal happened to be attached.
 */
function setStreams(stdin: boolean, stdout: boolean, stderr: boolean): void {
  const values: Record<Stream, boolean> = { stdin, stdout, stderr };
  for (const stream of STREAMS) {
    Object.defineProperty(process[stream], "isTTY", {
      value: values[stream],
      configurable: true,
      writable: true
    });
  }
}

/** The ordinary interactive case: stdin answers, stderr carries the question. */
function atATerminal(): void {
  setStreams(true, false, true);
}

/** No terminal anywhere — a pipe, a CI runner. */
function noTerminal(): void {
  setStreams(false, false, false);
}

/**
 * The hang. A real keyboard on stdin and BOTH outputs redirected, so an answer
 * could arrive and the question has nowhere a person can read it.
 */
function bothOutputsRedirected(): void {
  setStreams(true, false, false);
}

beforeEach(() => {
  question.mockReset();
  close.mockReset();
  out = [];
  err = [];

  realIsTty = {};
  for (const stream of STREAMS) {
    realIsTty[stream] = Object.getOwnPropertyDescriptor(process[stream], "isTTY");
  }
  realExitCode = process.exitCode;
  process.exitCode = undefined;

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
  process.exitCode = realExitCode;

  for (const stream of STREAMS) {
    const descriptor = realIsTty[stream];
    if (descriptor === undefined) {
      delete (process[stream] as { isTTY?: boolean }).isTTY;
    } else {
      Object.defineProperty(process[stream], "isTTY", descriptor);
    }
  }
});

describe("no --json, no terminal: refuses with a document", () => {
  it("refuses, and never reaches the question", async () => {
    setJsonMode(false);
    noTerminal();

    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(false);
    expect(question).not.toHaveBeenCalled();
  });

  it("names the re-run on the human channel", async () => {
    setJsonMode(false);
    noTerminal();

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
    atATerminal();
    question.mockResolvedValue("y");

    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(true);
    expect(question).toHaveBeenCalledTimes(1);
  });

  it("CONTROL — a real `n` still declines", async () => {
    setJsonMode(false);
    atATerminal();
    question.mockResolvedValue("n");

    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(false);
    expect(question).toHaveBeenCalledTimes(1);
  });
});

describe("--json, no terminal: refuses with an error DOCUMENT on stdout", () => {
  it("puts one parseable error document on stdout, and never asks", async () => {
    setJsonMode(true);
    noTerminal();

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
    noTerminal();

    await confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN);

    const { stdout } = captured();
    // Paired: the document IS there (so the haystack is real), and the payload
    // key is not. A consumer reading `.status` must never find
    // "confirmation_required" where a successful deploy puts "created".
    expect(stdout).toContain("CLI_REMOTE_ERROR");
    expect(stdout).not.toContain("confirmation_required");
  });
});

describe("--json AT A TERMINAL: asks — the row the `--json` disjunct got wrong", () => {
  it("asks instead of refusing, and returns the answer", async () => {
    setJsonMode(true);
    atATerminal();
    question.mockResolvedValue("y");

    // 🚨 Under `isJsonMode() || !process.stdin.isTTY` this resolved false having
    // printed a refusal, with an operator sitting at the keyboard able to
    // answer. `--json` describes the OUTPUT; only the streams say who is
    // answering, and here both halves of the conversation exist.
    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(true);
    expect(question).toHaveBeenCalledTimes(1);
  });

  it("prints NO error document on stdout, while the preamble still reaches the operator", async () => {
    setJsonMode(true);
    atATerminal();
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
    atATerminal();
    question.mockResolvedValue("n");

    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(false);

    // The decline hint is one of the four reasons this gate does NOT route
    // through `confirmDestructive`, whose decline prints "Aborted." and nothing
    // else — losing the re-run line that `confirm.stream.ts`'s header records
    // as a measured defect.
    expect(captured().stderr).toContain("--confirm-overage");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE ROW THAT MOVED. A real keyboard, both outputs redirected.
//
// 🚨 A HANG IS WORSE THAN A RED, SO EVERY ARM HERE IS BOUNDED. On the stdin-gated
// tree these calls never settle, and an unbounded `await` would take the whole
// suite to the runner's timeout with no assertion to read — the same silence the
// operator gets. `withinDeadline` converts it into a named failure.
// ─────────────────────────────────────────────────────────────────────────────

/** What `rl.question` does when the person it is addressed to never saw it. */
const NEVER = (): Promise<string> => new Promise<string>(() => undefined);

const DEADLINE_MS = 2_000;

async function withinDeadline<T>(label: string, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `${label} did not settle within ${DEADLINE_MS}ms — it is blocked on a keystroke ` +
              `for a question written to a redirected stream, which is the hang this file refuses.`
          )
        ),
      DEADLINE_MS
    );
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

describe("at a terminal with BOTH outputs redirected: refuses — the hang this closes", () => {
  // 🚨 EVERY ARM BELOW IS ITS OWN `it`, DELIBERATELY. A failing assertion throws
  // and aborts the rest of its own block, so "returned false" and "never asked"
  // written under one `it` would be scored on whichever a mutant reaches first —
  // and "never asked" is satisfied for free by a refusal, which is exactly the
  // arm that has to be able to fail on its own.
  it("RETURNS instead of blocking on a keystroke nobody was asked for", async () => {
    setJsonMode(false);
    bothOutputsRedirected();
    question.mockImplementation(NEVER);

    await expect(
      withinDeadline(
        "confirmOverageInteractively",
        confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)
      )
    ).resolves.toBe(false);
  });

  it("never puts the question at all, because nobody could have read it", async () => {
    setJsonMode(false);
    bothOutputsRedirected();
    question.mockImplementation(NEVER);

    await withinDeadline(
      "confirmOverageInteractively",
      confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)
    );

    // Its positive twin is "no --json, at a terminal: asks" above, over this
    // same spy — so "not called" here cannot be satisfied by a mock that is
    // never reachable in this file at all.
    expect(question).not.toHaveBeenCalled();
  });

  it("refuses with a document, into the file the operator redirected to", async () => {
    setJsonMode(false);
    bothOutputsRedirected();
    question.mockImplementation(NEVER);

    await withinDeadline(
      "confirmOverageInteractively",
      confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)
    );

    // The PRESENT half that pairs with the absence above: this run demonstrably
    // produced output, so "never asked" is about the branch and not about a
    // capture that recorded nothing.
    const { stderr } = captured();
    expect(stderr).toContain("nothing was deployed");
    expect(stderr).toContain("--confirm-overage");
  });

  it("sets a non-zero exit code, so a scripted deploy learns nothing happened", async () => {
    setJsonMode(false);
    bothOutputsRedirected();
    question.mockImplementation(NEVER);

    await withinDeadline(
      "confirmOverageInteractively",
      confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)
    );

    // A spend gate that stops while reporting success is the worst outcome
    // available, so the status is asserted and not inferred from the document.
    expect(process.exitCode).not.toBe(0);
    expect(process.exitCode).not.toBe(undefined);
  });
});

describe("ONE output redirected still asks — the guard against narrowing too far", () => {
  // The expensive direction of this change is over-refusing: a question a person
  // could have answered becomes a refusal plus a wasted re-run. `promptStream()`
  // picks whichever output a person can read, so each of these rows has one.
  it("stdout redirected, stderr a terminal: asks on stderr", async () => {
    setJsonMode(false);
    setStreams(true, false, true);
    question.mockResolvedValue("y");

    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(true);
    expect(question).toHaveBeenCalledTimes(1);
  });

  it("stderr redirected, stdout a terminal: asks on stdout", async () => {
    setJsonMode(false);
    setStreams(true, true, false);
    question.mockResolvedValue("y");

    // The one combination where `promptStream()` returns stdout. Nothing is
    // parsing stdout here, because it is a terminal — `confirm.stream.ts`'s
    // header owns why that is safe.
    await expect(confirmOverageInteractively(CONFIRMATION_REQUIRED, RERUN)).resolves.toBe(true);
    expect(question).toHaveBeenCalledTimes(1);
  });
});
