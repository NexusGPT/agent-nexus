import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleError } from "../../../errors";
import { CategorizedCliError, EXIT_CODES } from "../../../exit-codes";
import { setJsonMode } from "../../../output";

/**
 * THE HANG ONE REDIRECT WAS ENOUGH TO REACH, AND THE SPLIT DIALOGUE BEHIND IT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `nexus eval conv new … > out.log` FROM A KEYBOARD BLOCKED ON A PROMPT IN
 *    THE LOG FILE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nextLine` named `process.stdout` directly, so a single `> out.log` put the
 * prompt in the file while stdin stayed a terminal, and the process waited for a
 * keystroke nobody had been shown. Every prompt in the session funnels through
 * that one `nextLine` — this loop's and `runCandidateLoop`'s — so one write was
 * the whole defect. ONE routing half, not `auth login`'s two: the interface
 * passes no `output` and `terminal: false`, so there is no echo to route.
 *
 * ── PRESENCE AND ABSENCE ARE SEPARATE `it` BLOCKS, PER ROUTED LINE ──────────
 *
 * `auth login` shipped sixteen green arms over a hole this file is shaped to
 * catch: it routed the QUESTION and left the numbered organization list the
 * question refers to on `console.log`, so the prompt was visible and the
 * information needed to answer it was not. Every arm there asked where the
 * QUESTION went; none asked where the PREAMBLE went.
 *
 * So each routed line gets two arms over the same captured output — it reached
 * the prompt stream, and it is absent from the redirected stdout — and they are
 * separate blocks because a failing assertion aborts its own block, which would
 * leave the second claim unscored by every mutant that moves the first.
 *
 * ── AND THE RESULT SIDE IS ARMED TOO, AGAINST OVER-ROUTING ──────────────────
 *
 * "route the dialogue" has an opposite failure nobody writes an arm for: route
 * EVERYTHING, and a `>` redirect captures nothing. `leaves the … banner on
 * stdout` and its sibling are what fail when the boundary moves the wrong way,
 * and m7 is the mutant that scores them.
 *
 * ── THE DEADLINE, AND WHY ITS OWN CONTROL IS THE POINT ──────────────────────
 *
 * A hang has no assertion to read: unbounded, the pristine run of the refusal
 * arms takes the suite down instead of reporting. `withinDeadline` turns that
 * silence into a named failure — and `CONTROL: the deadline FIRES` is what makes
 * its green mean anything, since "settled in time" and "the deadline can never
 * reject" are otherwise the same green.
 */

interface FakeInterfaceOptions {
  readonly input?: unknown;
  readonly output?: unknown;
  readonly terminal?: unknown;
}

interface FakeInterface {
  readonly options: FakeInterfaceOptions;
  closed: boolean;
  close(): void;
  [Symbol.asyncIterator](): AsyncIterator<string>;
}

/**
 * The interface is mocked rather than driven, because the hang is the ABSENCE of
 * a line and a real readline over a fake stdin cannot withhold one honestly. The
 * iterator buffers, so a test scripts its whole session up front; withholding is
 * then simply scripting nothing. Every interface handed out is recorded, so
 * "none was opened" is measurable rather than inferred.
 */
const { createInterface, interfaces, scriptLines, endInput } = vi.hoisted(() => {
  const interfaces: FakeInterface[] = [];
  const buffered: IteratorResult<string>[] = [];
  const waiting: ((r: IteratorResult<string>) => void)[] = [];

  const push = (result: IteratorResult<string>): void => {
    const waiter = waiting.shift();
    if (waiter) waiter(result);
    else buffered.push(result);
  };
  /** Script the lines the operator would type, in order, before the run starts. */
  const scriptLines = (...lines: string[]): void => {
    for (const value of lines) push({ value, done: false });
  };
  /** Ctrl-D / end of a pipe. */
  const endInput = (): void => push({ value: undefined as unknown as string, done: true });

  const createInterface = vi.fn((options: FakeInterfaceOptions): FakeInterface => {
    const rl: FakeInterface = {
      options,
      closed: false,
      close() {
        rl.closed = true;
      },
      [Symbol.asyncIterator]: () => ({
        next: () =>
          new Promise<IteratorResult<string>>((resolve) => {
            const ready = buffered.shift();
            if (ready) resolve(ready);
            else waiting.push(resolve);
          })
      })
    };
    interfaces.push(rl);
    return rl;
  });

  return { createInterface, interfaces, scriptLines, endInput };
});

vi.mock("node:readline", () => ({ default: { createInterface }, createInterface }));

const { goldenConversations, createClient } = vi.hoisted(() => {
  const goldenConversations = {
    create: vi.fn(async () => ({ id: "conv-77", title: "refund flow" })),
    addUserTurn: vi.fn(async () => undefined),
    generate: vi.fn(async () => ({
      candidate: { content: "THE AGENT ANSWER", toolCalls: [{ name: "lookup_order" }] }
    })),
    accept: vi.fn(async () => ({ index: 0 })),
    setCheckpoint: vi.fn(async () => undefined),
    ready: vi.fn(async () => undefined)
  };
  return { goldenConversations, createClient: vi.fn(() => ({ goldenConversations })) };
});

vi.mock("../../../client", () => ({ createClient }));

import { runAuthoringRepl } from "./run-authoring-repl";

const DEADLINE_MS = 2_000;

/** Bound the wait, so a hang arrives as a named failure instead of as silence. */
async function withinDeadline<T>(label: string, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `${label} did not settle within ${DEADLINE_MS}ms — it is blocked on a keystroke for ` +
              `a prompt written to a redirected stream, which is the hang this file refuses.`
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

const USER_PROMPT = "you › ";
const LEGEND = "Type a user message";
const GENERATING = "agent … generating";
const CANDIDATE = "THE AGENT ANSWER";
const BANNER_ID = "conv-77";
const CLOSING = "No turns accepted";

describe("an eval repl prompt is never written where nobody can read it", () => {
  const stdinWas = process.stdin.isTTY;
  const stdoutWas = process.stdout.isTTY;
  const stderrWas = process.stderr.isTTY;

  let toStdoutWrite: string[] = [];
  let toConsoleLog: string[] = [];
  let toStderr: string[] = [];

  /**
   * EVERYTHING THAT WOULD LAND IN `out.log`, and it has to be the UNION.
   *
   * 🔴 A `process.stdout.write` SPY CANNOT SEE `console.log` UNDER VITEST, SO AN
   * ABSENCE ARM POINTED AT ONE ALONE IS VACUOUS FOR EVERY `console.log` LINE —
   * the haystack could not hold the string in ANY tree, under any mutation, and
   * it reads exactly like protection. Measured here, 2026-11-21, vitest 3.2.7,
   * with the direct write as the control: `VIA_DIRECT_WRITE` was captured and
   * `VIA_CONSOLE_LOG` was not. The tell in a battery is an asymmetric pair — a
   * mutant that reds the presence arm and leaves its absence twin green.
   *
   * In production both calls go to fd 1, so modelling stdout as one stream is
   * what makes these arms true to the redirect. This file's routed lines are
   * split across both calls — the legend and the candidate were `console.log`,
   * the prompt and the progress line were direct writes — so neither capture
   * alone is the haystack for all of them.
   */
  function stdoutText(): string {
    return `${toStdoutWrite.join("")}\n${toConsoleLog.join("")}`;
  }

  /** The program object `runAuthoringRepl` only ever asks for global options. */
  const program = { optsWithGlobals: () => ({}) } as unknown as Parameters<
    typeof runAuthoringRepl
  >[0];
  const OPTS = { agentId: "a-1", deploymentId: "d-1", title: "refund flow" };

  function setTty(stdinTty: boolean, stdoutTty: boolean, stderrTty: boolean): void {
    Object.defineProperty(process.stdin, "isTTY", { value: stdinTty, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: stdoutTty, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: stderrTty, configurable: true });
  }

  /** The measured defect: a keyboard, and stdout alone sent to a file. */
  function setStdoutRedirected(): void {
    setTty(true, false, true);
  }

  /** The one state with nowhere left to ask: a keyboard and both outputs in files. */
  function setBothOutputsRedirected(): void {
    setTty(true, false, false);
  }

  /** Run one session to completion under the current tty state. */
  function run(): Promise<void> {
    return runAuthoringRepl(program, OPTS);
  }

  beforeEach(() => {
    createInterface.mockClear();
    // 🔴 THE CLIENT SPIES ARE CLEARED HERE, AND THE ABSENCE ARM BELOW IS WHY.
    // They live in `vi.hoisted` and are therefore module-scoped, so without this
    // `expect(create).not.toHaveBeenCalled()` would be scored against every
    // earlier arm's calls and could never pass — the opposite of a vacuous
    // absence, and just as useless. `mockClear` keeps each implementation.
    for (const spy of Object.values(goldenConversations)) spy.mockClear();
    interfaces.length = 0;
    // The line queues inside `vi.hoisted` are module-scoped and deliberately NOT
    // cleared here: every arm consumes exactly what it scripts, and the deadline
    // control — the one arm that leaves a reader waiting — settles it with its
    // own `endInput()`. ⚠️ That drainage is REASONED from each arm's script, not
    // asserted: an `afterEach` depth check would fire on every hanging mutant and
    // make the battery's per-arm attribution unreadable.
    toStdoutWrite = [];
    toConsoleLog = [];
    toStderr = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown): boolean => {
      toStdoutWrite.push(String(chunk));
      return true;
    });
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]): void => {
      toConsoleLog.push(args.map(String).join(" "));
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown): boolean => {
      toStderr.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setTty(stdinWas === true, stdoutWas === true, stderrWas === true);
    setJsonMode(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CONTROLS. Every refusal arm below is "it came back" or "nothing reached a
  // stream", and a harness that cannot reach a prompt produces both for free.
  // ───────────────────────────────────────────────────────────────────────────

  it("CONTROL: with a visible stream the session runs and reads the scripted lines", async () => {
    setTty(true, true, true);
    scriptLines("hello", "d");

    await expect(withinDeadline("session", run())).resolves.toBeUndefined();

    expect(goldenConversations.addUserTurn).toHaveBeenCalledWith("conv-77", { text: "hello" });
    expect(toStderr.join("")).toContain(USER_PROMPT);
  });

  it("CONTROL: the deadline FIRES on a prompt nobody ever answers", async () => {
    // Reachable precisely because stderr is a terminal: the prompt is legitimate
    // and the silence is the operator's, not the stream's. Without this arm a
    // deadline that could never reject would make every refusal arm green on a
    // tree that still hangs.
    setTty(true, true, true);

    await expect(withinDeadline("session", run())).rejects.toThrow(/did not settle within 2000ms/);
    endInput();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ROUTING — the half that makes the single-redirect case WORK rather than
  // refuse. A gate-only fix passes every refusal arm and fails these.
  // ───────────────────────────────────────────────────────────────────────────

  it("routes the prompt to stderr when stdout alone is redirected, and still reads the answer", async () => {
    setStdoutRedirected();
    scriptLines("hello", "d");

    await expect(withinDeadline("session", run())).resolves.toBeUndefined();

    expect(toStderr.join("")).toContain(USER_PROMPT);
  });

  it("keeps the prompt OFF the redirected stdout, so the log file is not where it went", async () => {
    // Paired with the arm above over the same two haystacks: that one requires
    // the prompt on stderr, so this absence cannot be satisfied by a REPL that
    // writes nowhere at all.
    setStdoutRedirected();
    scriptLines("hello", "d");

    await withinDeadline("session", run());

    expect(stdoutText()).not.toContain(USER_PROMPT);
  });

  it("REGRESSION GUARD: opens the interface with no stdout for readline to echo into", async () => {
    // Passes on BOTH trees by construction — the pristine interface already
    // passed no `output` — so it scores none of this change's mutants and is
    // reported as a guard rather than as a kill. What it exists to catch is a
    // later "fix" adding `output: process.stdout`, which would put the
    // operator's own keystrokes in the log file: the half `auth login` had and
    // this site does not.
    setStdoutRedirected();
    scriptLines("hello", "d");

    await withinDeadline("session", run());

    expect(interfaces).toHaveLength(1);
    expect(interfaces[0].options.output).not.toBe(process.stdout);
    expect(interfaces[0].options.terminal).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE WHOLE DIALOGUE, NOT THE PROMPT. Presence and absence per line, in
  // separate blocks. This is the hole sixteen green arms hid in `auth login`.
  // ───────────────────────────────────────────────────────────────────────────

  it("puts the [d]one legend on the prompt stream — it is the only statement of how to answer", async () => {
    setStdoutRedirected();
    scriptLines("hello", "d");

    await withinDeadline("session", run());

    expect(toStderr.join("")).toContain(LEGEND);
  });

  it("keeps the [d]one legend OFF the redirected stdout", async () => {
    setStdoutRedirected();
    scriptLines("hello", "d");

    await withinDeadline("session", run());

    expect(stdoutText()).not.toContain(LEGEND);
  });

  it("puts 'agent … generating' on the prompt stream — it tells the operator to wait", async () => {
    setStdoutRedirected();
    scriptLines("hello", "d");

    await withinDeadline("session", run());

    expect(toStderr.join("")).toContain(GENERATING);
  });

  it("keeps 'agent … generating' OFF the redirected stdout", async () => {
    setStdoutRedirected();
    scriptLines("hello", "d");

    await withinDeadline("session", run());

    expect(stdoutText()).not.toContain(GENERATING);
  });

  it("puts the agent candidate on the prompt stream — [a]ccept decides on exactly that text", async () => {
    // The sharpest case in either file. The action prompt asks the operator to
    // accept THIS content; invisible, the decision cannot be made at all.
    setStdoutRedirected();
    scriptLines("hello", "d");

    await withinDeadline("session", run());

    expect(toStderr.join("")).toContain(CANDIDATE);
    expect(toStderr.join("")).toContain("[a]ccept");
  });

  it("keeps the agent candidate OFF the redirected stdout", async () => {
    setStdoutRedirected();
    scriptLines("hello", "d");

    await withinDeadline("session", run());

    expect(stdoutText()).not.toContain(CANDIDATE);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE RESULT SIDE — armed against OVER-ROUTING, the opposite failure. A `>`
  // redirect exists to capture these, and routing them captures nothing.
  // ───────────────────────────────────────────────────────────────────────────

  it("leaves the conversation ID banner on stdout, which is what a redirect is for", async () => {
    setStdoutRedirected();
    scriptLines("hello", "d");

    await withinDeadline("session", run());

    expect(stdoutText()).toContain(BANNER_ID);
  });

  it("leaves the closing outcome line on stdout", async () => {
    setStdoutRedirected();
    scriptLines("hello", "d");

    await withinDeadline("session", run());

    expect(stdoutText()).toContain(CLOSING);
  });

  it("leaves the READY outcome and its id on stdout when a turn was accepted", async () => {
    setStdoutRedirected();
    scriptLines("hello", "a", "d");

    await withinDeadline("session", run());

    expect(goldenConversations.ready).toHaveBeenCalledWith("conv-77");
    expect(stdoutText()).toContain("is READY (conv-77)");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE PIPE. `canAsk()` alone would refuse this, and it is a PUBLISHED mode:
  // the help says "SCRIPTED STDIN WORKS" and the CHANGELOG shipped the promise.
  // ───────────────────────────────────────────────────────────────────────────

  it("a piped run still runs, with both outputs redirected and no terminal anywhere", async () => {
    // stdin is a pipe, so `canAsk()` is false — and nothing hangs, because the
    // lines arrive from the pipe and no prompt has to be read by anyone. This is
    // the arm that reds under a bare `!canAsk()` gate.
    setTty(false, false, false);
    scriptLines("hello", "d");

    await expect(withinDeadline("piped session", run())).resolves.toBeUndefined();

    expect(goldenConversations.addUserTurn).toHaveBeenCalledWith("conv-77", { text: "hello" });
  });

  it("a piped run reads a SECOND line across the gap between prompts", async () => {
    // The gate sits above the read, so it must not have broken the sequencing
    // that makes `printf 'msg\\na\\nd\\n' | nexus eval conv new` work.
    setTty(false, false, false);
    scriptLines("hello", "a", "d");

    await expect(withinDeadline("piped session", run())).resolves.toBeUndefined();

    expect(goldenConversations.accept).toHaveBeenCalledWith("conv-77");
    expect(goldenConversations.ready).toHaveBeenCalledWith("conv-77");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE GATE — the one state with no stream left to ask on.
  // ───────────────────────────────────────────────────────────────────────────

  it("REFUSES instead of blocking when stdout and stderr are both redirected", async () => {
    setBothOutputsRedirected();

    await expect(withinDeadline("refused session", run())).rejects.toBeInstanceOf(
      CategorizedCliError
    );
  });

  it("does NOT finish the session silently, which is what a `null` return would do", async () => {
    // `null` is this REPL's end-of-input signal, so a gate that returned it
    // instead of throwing would exit 0 under "No turns accepted — conversation
    // left in DRAFT." — a cheerful wrong outcome, and one every refusal arm
    // above would still report as a pass if it only checked for a throw.
    setBothOutputsRedirected();

    await withinDeadline("refused session", run()).catch(() => undefined);

    expect(stdoutText()).not.toContain(CLOSING);
  });

  it("refuses with the invalid-input exit code, which is the invocation's category", async () => {
    setBothOutputsRedirected();

    const refusal: unknown = await withinDeadline("refused session", run()).catch(
      (err: unknown) => err
    );

    expect(refusal).toBeInstanceOf(CategorizedCliError);
    expect((refusal as CategorizedCliError).exitCode).toBe(EXIT_CODES["invalid-input"]);
  });

  it("carries a non-zero code, so a script learns the session did not happen", async () => {
    // Separate from the category arm on purpose: a failing assertion aborts its
    // own block, so a non-zero claim written under the equality above would go
    // unscored by every mutant that moves the category. Asserted over the
    // REFUSAL, never over the table — `EXIT_CODES["invalid-input"] !== 0` is
    // true whatever this REPL does.
    setBothOutputsRedirected();

    const refusal: unknown = await withinDeadline("refused session", run()).catch(
      (err: unknown) => err
    );

    expect((refusal as CategorizedCliError).exitCode).not.toBe(0);
    expect((refusal as CategorizedCliError).exitCode).not.toBe(undefined);
  });

  it("names the prompt it refused, so the operator knows which one stopped the run", async () => {
    setBothOutputsRedirected();

    const refusal: unknown = await withinDeadline("refused session", run()).catch(
      (err: unknown) => err
    );

    expect((refusal as CategorizedCliError).message).toContain("you");
    expect((refusal as CategorizedCliError).message).toContain("nowhere to show the prompt");
  });

  it("names a re-run that removes the prompt, rather than only the cause", async () => {
    // The pipe, not a flag: no flag can answer these prompts, because the REPL
    // IS the prompts. Asserting the pipe is asserting the honest remedy.
    setBothOutputsRedirected();

    const refusal: unknown = await withinDeadline("refused session", run()).catch(
      (err: unknown) => err
    );

    const hint = String((refusal as CategorizedCliError).hint ?? "");
    expect(hint).toContain("printf");
    expect(hint).toContain("| nexus eval conv new");
  });

  it("writes the prompt to neither stream when nobody could read it", async () => {
    // Paired with the routing arms, which require this same prompt text on
    // stderr — so this is not a claim an inert REPL satisfies.
    setBothOutputsRedirected();

    await withinDeadline("refused session", run()).catch(() => undefined);

    expect(stdoutText()).not.toContain(USER_PROMPT);
    expect(toStderr.join("")).not.toContain(USER_PROMPT);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // WHERE THE GATE SITS, NOT WHAT IT TESTS — AND HERE THE ACT IS A REMOTE WRITE.
  //
  // 🚨 FOUND BY BUGBOT ON THE PROMOTION, NOT BY ANY ARM ABOVE. The gate was
  // `nextLine`'s first statement, and `nextLine` is not reached until
  // `goldenConversations.create` has already made a DRAFT conversation in the
  // operator's organization. So a refused session left a row behind over the
  // network and then threw `invalid-input`. Every refusal arm above passed: they
  // ask WHETHER it refuses, and the defect is WHEN.
  //
  // The pair below is over `goldenConversations.create`, PRESENCE first. An
  // absence arm with no presence twin over the same instrument is the sixth form
  // in `core/vacuous-assertions.md`, and this file's own header records the
  // measured specimen that makes it a rule here rather than a caution: a
  // `process.stdout.write` spy cannot see a `console.log` under vitest, so the
  // absence was green because the haystack could never have held the string.
  // ───────────────────────────────────────────────────────────────────────────

  it("creates the draft conversation when the prompt can be shown — the act the gate sits above", async () => {
    setStdoutRedirected();
    scriptLines("hello", "d");

    await withinDeadline("session", run());

    expect(goldenConversations.create).toHaveBeenCalledWith({
      agentId: "a-1",
      deploymentId: "d-1",
      title: "refund flow"
    });
  });

  it("creates NO draft conversation when the prompt could not be shown", async () => {
    // The bugbot finding, as an arm. Its twin is directly above, over this same
    // `vi.fn`, so "not called" cannot be satisfied by a mock nothing reaches —
    // and `beforeEach` clears the spy, so it cannot be satisfied by luck either.
    setBothOutputsRedirected();

    await expect(withinDeadline("refused session", run())).rejects.toBeInstanceOf(
      CategorizedCliError
    );

    expect(goldenConversations.create).not.toHaveBeenCalled();
  });

  it("prints no authoring banner either, so the log file names no conversation that exists", async () => {
    // Its own `it`: a failing assertion aborts its block, so this claim written
    // under the one above would go unscored by every mutant that moves that one.
    // And it is the half `create` alone cannot see — a banner naming `conv-77`
    // over a conversation that was never created is a second wrong outcome.
    setBothOutputsRedirected();

    await withinDeadline("refused session", run()).catch(() => undefined);

    expect(stdoutText()).not.toContain(BANNER_ID);
  });

  it("opens no readline interface when nobody could read the prompt", async () => {
    // Its positive twin is the first CONTROL, over this same spy: that arm
    // requires an interface, so "none opened" cannot be satisfied by a mock that
    // is never reachable. It is also the arm that would fail if the gate were
    // left where it was — the interface is opened before `nextLine` is ever
    // called.
    setBothOutputsRedirected();

    await withinDeadline("refused session", run()).catch(() => undefined);

    expect(createInterface).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE REFUSAL IS A DOCUMENT. `new.command.ts` already routes a categorized
  // throw through `handleError` without restamping it, so no command-file change
  // was needed here — and this arm is what pins that claim.
  // ───────────────────────────────────────────────────────────────────────────

  it("reaches stdout as ONE parseable document under --json, naming the cause and the remedy", async () => {
    setBothOutputsRedirected();
    setJsonMode(true);

    const refusal: unknown = await withinDeadline("refused session", run()).catch(
      (err: unknown) => err
    );

    const said: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]): void => void said.push(args.map(String).join(" "));
    let code: number;
    try {
      code = handleError(refusal);
    } finally {
      console.log = log;
    }

    // POSITIVE FIRST: an empty capture satisfies every claim below it, and is
    // also what a broken console.log swap produces.
    expect(said.join("\n")).not.toBe("");
    const parsed: unknown = JSON.parse(said.join("\n"));
    const error = (parsed as { error?: { message?: string; hint?: string | null; code?: string } })
      .error;
    expect(error?.message).toContain("nowhere to show the prompt");
    expect(String(error?.hint ?? "")).toContain("printf");
    expect(error?.code).not.toBe(undefined);
    expect(code).toBe(EXIT_CODES["invalid-input"]);
  });
});
