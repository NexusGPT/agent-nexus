import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * THE HANG THAT A STDIN GATE LETS THROUGH.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A QUESTION YOU CANNOT SEE IS NOT A PROMPT. IT IS A HANG WITH A REASON.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus <destructive verb> >out.log 2>err.log`, typed at a real keyboard.
 * stdin is a terminal, so a gate on stdin alone lets the ask happen;
 * `promptStream()` then resolves to stderr, which is the file, so the terminal
 * stays blank and the process blocks on a keystroke nobody has been asked for.
 * No document, no exit code, nothing to read — and in CI it burns to the job's
 * timeout.
 *
 * `canAsk()` is both halves of the conversation and `confirmDestructive` gates
 * on it, so the ask is unreachable in exactly the case where the question would
 * be invisible, and the operator gets the refusal document in the file they
 * redirected to.
 *
 * ── WHY THE DEADLINE, AND WHY IT IS THE POINT OF THE FILE ───────────────────
 *
 * A hang is worse than a red: there is no assertion to read and no failure to
 * name, so without a bound the pristine-tree run of the arm below takes the
 * whole suite down with it instead of reporting. {@link withinDeadline} turns
 * the silence into a named failure, and the two CONTROL arms are what make its
 * green mean anything — one proves the harness can reach an ask at all, the
 * other proves this deadline fires on a question that genuinely never settles.
 * Without the second, "resolved in time" and "the deadline is broken" are the
 * same green.
 */

const { question } = vi.hoisted(() => ({ question: vi.fn() }));

// The ask reaches readline through a DYNAMIC import inside `askLine`, so the
// mock stands in for the module rather than for a helper this package owns.
// `askLine` chains `rl.once("SIGINT", …).once("close", …)`, so `once` returns
// the interface.
vi.mock("node:readline/promises", () => {
  const rl = {
    question,
    close: (): undefined => undefined,
    once: (): unknown => rl
  };
  return { createInterface: (): unknown => rl };
});

import { canAsk, confirmDestructive } from "./confirm";

/**
 * A promise that never settles — what `rl.question` does when the person it is
 * addressed to never saw it. This is the real behaviour, not a stand-in for it:
 * the defect is that nothing ever arrives.
 */
const NEVER = (): Promise<string> => new Promise<string>(() => undefined);

const DEADLINE_MS = 2_000;

/** Bound the wait, so a hang arrives as a named failure instead of as silence. */
async function withinDeadline<T>(label: string, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `${label} did not settle within ${DEADLINE_MS}ms — it is blocked on a keystroke ` +
              `for a question written to a redirected stream, which is the hang this file exists to refuse.`
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

const RERUN = "nexus customer delete 3b1f8e42 --yes";

describe("a confirmation refuses when its question cannot be seen", () => {
  const stdinWas = process.stdin.isTTY;
  const stdoutWas = process.stdout.isTTY;
  const stderrWas = process.stderr.isTTY;
  const exitCodeWas = process.exitCode;

  function setTty(stdin: boolean, stdout: boolean, stderr: boolean): void {
    Object.defineProperty(process.stdin, "isTTY", { value: stdin, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: stdout, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: stderr, configurable: true });
  }

  /** Both outputs redirected, the operator's keyboard still attached. The defect. */
  function setBothOutputsRedirected(): void {
    setTty(true, false, false);
  }

  beforeEach(() => {
    question.mockReset();
    question.mockImplementation(NEVER);
    process.exitCode = undefined;
  });

  afterEach(() => {
    setTty(stdinWas === true, stdoutWas === true, stderrWas === true);
    process.exitCode = exitCodeWas;
    setJsonMode(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CONTROLS. Every assertion below this pair is "the ask did not happen" or
  // "the call came back", and a broken harness produces both for free.
  // ───────────────────────────────────────────────────────────────────────────

  it("CONTROL: with a visible stream the ask DOES happen and the answer is read", async () => {
    setTty(true, false, true);
    question.mockResolvedValue("y");

    const proceed = await withinDeadline(
      "confirmDestructive",
      confirmDestructive("Delete it?", {})
    );

    expect(question).toHaveBeenCalledTimes(1);
    expect(proceed).toBe(true);
  });

  it("CONTROL: the deadline FIRES on a question that never settles", async () => {
    // Without this, a deadline that could never reject would make the arm below
    // green on a tree that hangs. The condition is reachable here precisely
    // because stderr is a terminal, so the ask is legitimate and the silence is
    // the operator's, not the stream's.
    setTty(true, false, true);

    await expect(
      withinDeadline("confirmDestructive", confirmDestructive("Delete it?", {}))
    ).rejects.toThrow(/did not settle within 2000ms/);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE DEFECT.
  // ───────────────────────────────────────────────────────────────────────────

  it("RETURNS instead of blocking when stdout and stderr are both redirected", async () => {
    setBothOutputsRedirected();

    const proceed = await withinDeadline(
      "confirmDestructive",
      confirmDestructive("Delete it?", {})
    );

    expect(proceed).toBe(false);
  });

  it("never puts the question at all when nobody could read it", async () => {
    // Its positive twin is the first CONTROL above, over this same spy: that one
    // requires a call, so "not called" here cannot be satisfied by a mock that
    // is never reachable.
    setBothOutputsRedirected();

    await withinDeadline("confirmDestructive", confirmDestructive("Delete it?", {}));

    expect(question).not.toHaveBeenCalled();
  });

  it("sets a non-zero exit code, so a script learns nothing happened", async () => {
    setBothOutputsRedirected();

    await withinDeadline("confirmDestructive", confirmDestructive("Delete it?", {}));

    expect(process.exitCode).not.toBe(0);
    expect(process.exitCode).not.toBe(undefined);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE REFUSAL IS A DOCUMENT. A bare `console.error` + exit 1 left stdout empty
  // under --json, and this helper is shared, so that defect reached every
  // destructive verb routing through it.
  // ───────────────────────────────────────────────────────────────────────────

  it("refuses under --json with a parseable document on stdout naming the cause and the remedy", async () => {
    setBothOutputsRedirected();
    setJsonMode(true);

    const chunks: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]): void => void chunks.push(args.map(String).join(" "));

    try {
      await withinDeadline(
        "confirmDestructive",
        confirmDestructive("Delete it?", { rerun: RERUN })
      );
    } finally {
      console.log = log;
    }

    // POSITIVE FIRST: an empty capture would satisfy every negative claim below
    // and is also what a broken console.log swap produces.
    expect(chunks.join("\n")).not.toBe("");
    const parsed: unknown = JSON.parse(chunks.join("\n"));
    const error = (parsed as { error?: { message?: string; hint?: string | null } }).error;
    expect(error?.message).toContain("nowhere to show the question");
    expect(String(error?.hint ?? "")).toContain(RERUN);
  });

  it("tells the two causes apart — an unreadable ANSWER is not an invisible QUESTION", async () => {
    // Same remedy, different situation. An operator who redirected both streams
    // reads this out of the file they redirected to, and "no terminal" over a
    // run typed AT a terminal sends them looking for the wrong thing.
    const said: string[] = [];
    const error = console.error;
    console.error = (...args: unknown[]): void => void said.push(args.map(String).join(" "));

    try {
      setTty(false, false, false);
      await withinDeadline("stdin closed", confirmDestructive("Delete it?", {}));
      setBothOutputsRedirected();
      await withinDeadline("outputs redirected", confirmDestructive("Delete it?", {}));
    } finally {
      console.error = error;
    }

    const messages = said.filter((line) => line.includes("Delete it?"));
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain("refusing without a terminal to ask");
    expect(messages[1]).toContain("stdout and stderr are both redirected");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE ESCAPE HATCH THE REFUSAL NAMES HAS TO WORK, or the document sends the
  // operator somewhere that refuses them again.
  // ───────────────────────────────────────────────────────────────────────────

  it("still proceeds on --yes with nothing visible, and asks nothing", async () => {
    setBothOutputsRedirected();

    const proceed = await withinDeadline(
      "confirmDestructive --yes",
      confirmDestructive("Delete it?", { yes: true })
    );

    expect(question).not.toHaveBeenCalled();
    expect(proceed).toBe(true);
  });
});

describe("canAsk() is both halves of the conversation", () => {
  const stdinWas = process.stdin.isTTY;
  const stdoutWas = process.stdout.isTTY;
  const stderrWas = process.stderr.isTTY;

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: stdinWas, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: stdoutWas, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: stderrWas, configurable: true });
  });

  it("answers the whole truth table, so neither half can be the only one checked", () => {
    // The table is asserted WHOLE, in one arm: a failing assertion aborts its
    // own block, so four separate expects would score only the first row that
    // moved. Row `t f f` is the defect — a readable answer and no readable
    // question — and it is the only row an isTTY-on-stdin gate gets wrong.
    const rows: string[] = [];
    for (const stdin of [true, false]) {
      for (const stdout of [true, false]) {
        for (const stderr of [true, false]) {
          Object.defineProperty(process.stdin, "isTTY", { value: stdin, configurable: true });
          Object.defineProperty(process.stdout, "isTTY", { value: stdout, configurable: true });
          Object.defineProperty(process.stderr, "isTTY", { value: stderr, configurable: true });
          const bit = (flag: boolean): string => (flag ? "t" : "f");
          rows.push(`${bit(stdin)} ${bit(stdout)} ${bit(stderr)} -> ${String(canAsk())}`);
        }
      }
    }

    expect(rows).toEqual([
      "t t t -> true",
      "t t f -> true",
      "t f t -> true",
      "t f f -> false",
      "f t t -> false",
      "f t f -> false",
      "f f t -> false",
      "f f f -> false"
    ]);
  });

  it("treats an ABSENT isTTY as not a terminal, not as unknown", () => {
    // `isTTY` is `boolean | undefined` on these streams — a pipe leaves the
    // property undefined rather than false, and a truthiness test that happened
    // to read `undefined` as a terminal would reopen the hang.
    Object.defineProperty(process.stdin, "isTTY", { value: undefined, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });

    expect(canAsk()).toBe(false);
  });
});
