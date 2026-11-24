import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE HANG ONE REDIRECT WAS ENOUGH TO REACH, AND THE PREAMBLE THAT GOES WITH IT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `nexus-mcp login > out.log` FROM A KEYBOARD BLOCKED ON A QUESTION IN THE
 *    LOG FILE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The readline interface's `output` was `stdout`, so `rl.question()` wrote the
 * question into out.log while stdin stayed a terminal. The terminal showed
 * nothing and the process waited for a keystroke nobody had been shown.
 *
 * ── THREE INDEPENDENT PROPERTIES, ASSERTED SEPARATELY ───────────────────────
 *
 * ROUTING, the DIALOGUE and the GATE are different arms here on purpose, and no
 * one of them implies another:
 *
 *   - ROUTING. With stdout alone redirected the question CAN be shown, on
 *     stderr, so the right outcome is that the login SUCCEEDS. A fix that only
 *     added `if (!canAsk()) refuse` turns that working ask into a refusal while
 *     passing every arm that asks "does it refuse".
 *   - THE DIALOGUE. Routing only the QUESTION makes it UNANSWERABLE rather than
 *     invisible: the preamble names the page the key is copied from, so left on
 *     stdout it goes into out.log while `Paste your API key (nxs_...):` sits on
 *     the terminal with no address beside it. The result line is the other side
 *     of that line and must NOT move — `Logged in successfully…` is what a `>`
 *     redirect exists to capture.
 *   - THE GATE. Only where no stream can carry a question at all.
 *
 * ── WHY THE GATE IS NOT `canAsk()` ──────────────────────────────────────────
 *
 * `canAsk()` demands a terminal on stdin too, and a PIPE there works here today:
 * measured outside this suite, `printf 'nxs_abc\n' | node login-ask-lab.mjs`
 * resolves the question off the pipe. Nothing hangs, because no question has to
 * be read by anybody. `a piped run still asks…` is the arm that fails under a
 * bare `!canAsk()` gate.
 *
 * ── THE HAYSTACK IS PICKED PER LINE, AND THAT IS NOT A DETAIL ───────────────
 *
 * 🔴 `console.log` DOES NOT REACH A `process.stdout.write` SPY. Measured in this
 * package's own vitest 3.2.7: a `console.log` lands in a `console.log` spy and
 * is invisible to a `process.stdout.write` spy, and vice versa. So an absence
 * arm written over a `process.stdout.write` spy alone, for a string the pre-fix
 * code emitted with `console.log`, asserts over a haystack that could never have
 * held it — in any tree, under any mutant. It passes unconditionally and reads
 * exactly like protection.
 *
 * ✅ So `onStdout()` is the UNION of both captures, and `CONTROL: the stdout
 * haystack is LIVE…` writes through `console.log` and requires it back. Every
 * absence claim below sits on a haystack that control has proven can hold the
 * string, and the m2/m3 mutants red those absence arms rather than only their
 * presence twins.
 *
 * ── THE FOURTH PROPERTY: INPUT THAT ENDS WITHOUT AN ANSWER ──────────────────
 *
 * `nexus-mcp login < /dev/null` is a run the GATE correctly lets through — stdin
 * is not a terminal, and a pipe there is supported. `readline/promises`'
 * `question()` then never settles, because nothing but an answer calls it back.
 *
 * 🚨 WHAT A REAL PROCESS DOES THERE IS *EXIT 0*, NOT HANG, AND THAT IS WORSE.
 * Measured on node v24.9.0 outside this suite, no runner and no transpiler in
 * the path: the prompt is written, the `try` body never completes, its `finally`
 * never runs, and node's event loop — holding nothing, since stdin is at EOF —
 * drains and the process exits **0** having saved nothing. A caller reads that
 * as a successful login. The control, a key on the pipe, exits 0 having saved.
 *
 * ⚠️ IN HERE IT RENDERS AS A HANG, because vitest's own timers keep the loop
 * alive, so the unsettled promise never gets to drain anything. Same defect, two
 * renderings — which is why the arms below assert the EXIT CODE and the message,
 * and not merely that the command came back.
 *
 * THE HANG IS STILL REACHABLE, and it is correct to wait there: stdin OPEN with
 * nobody answering — a held-open pipe, a FIFO, a terminal nobody types at.
 * Measured on both trees, identical: still running at 12,000 ms. Input has not
 * ended, so there is nothing to refuse.
 *
 * 🔴 SO THE REFUSAL IS CONDITIONED ON INPUT *ENDING*, NEVER ON STDIN NOT BEING A
 * TERMINAL. `a piped run still asks…` below is the arm that reds under the
 * cheaper fix that refuses every non-TTY stdin.
 *
 * ── THE DEADLINE, AND WHY ITS OWN CONTROL IS THE POINT ──────────────────────
 *
 * A hang has no assertion to read: without a bound the pre-fix run of the
 * refusal arms takes the whole suite down instead of reporting. `withinDeadline`
 * turns that silence into a named failure — and `CONTROL: the deadline FIRES` is
 * what makes its green mean anything, since "settled in time" and "the deadline
 * can never reject" are otherwise the same green.
 */

interface FakeInterfaceOptions {
  readonly input: unknown;
  readonly output: unknown;
}

interface FakeInterface {
  readonly options: FakeInterfaceOptions;
  /** Every question `rl.question()` was asked, so "nothing was asked" is measurable. */
  readonly questions: string[];
  readonly closed: boolean;
  question(query: string): Promise<string>;
  once(event: string, handler: () => void): FakeInterface;
  close(): void;
  /** What stdin reaching EOF does: the interface closes, and no answer arrives. */
  endInput(): void;
}

/**
 * The interface is mocked rather than driven, because the hang is the ABSENCE of
 * an answer and a real readline over the runner's own stdin cannot withhold one
 * honestly. Every interface it hands out is recorded, so "nothing was opened" is
 * a measured claim and not an inferred one.
 *
 * ── THE TWO BEHAVIOURS THE FAKE REPRODUCES, AND WHY THEY ARE MEASURED ───────
 *
 * 🔴 A HAND-WRITTEN FAKE IS A CLAIM ABOUT THE REAL THING, so each behaviour
 * below was read off node v24.9.0 rather than assumed:
 *
 *   - `question()` NEVER SETTLES when input ends. Measured against a 1,500 ms
 *     bound with stdin at `/dev/null`: neither resolved nor rejected, and still
 *     pending after an explicit `rl.close()`. The control — a line on the pipe —
 *     resolved, so the probe can tell the two apart. That is why `question()`
 *     here only ever resolves through `answerers`, and never on close.
 *   - `close` FIRES on both routes. At EOF the interface emits it (measured in
 *     the same probe), and `rl.close()` emits it too (measured on a PassThrough
 *     held open, with a before-close control reading 0). So {@link endInput}
 *     models the EOF route and `close()` models the explicit one, and both run
 *     the handlers.
 *
 * ⚠️ `question()` resolving on close would make the input-ended arms pass for the
 * wrong reason — the subject would never need its own close path at all.
 */
const { createInterface, interfaces, answerers } = vi.hoisted(() => {
  const interfaces: FakeInterface[] = [];
  const answerers: Array<(line: string) => void> = [];
  const createInterface = vi.fn((options: FakeInterfaceOptions): FakeInterface => {
    const closeHandlers: Array<() => void> = [];
    // The flag is a local and `closed` reads it, so nothing closes over `rl`
    // before it exists — and `close` stays idempotent, as the real one is: the
    // subject's own `finally` closes an interface that EOF already closed.
    let closed = false;
    const fireClose = (): void => {
      if (closed) return;
      closed = true;
      while (closeHandlers.length) (closeHandlers.shift() as () => void)();
    };
    const rl: FakeInterface = {
      options,
      questions: [],
      get closed(): boolean {
        return closed;
      },
      question(query: string): Promise<string> {
        rl.questions.push(query);
        return new Promise<string>((resolve) => answerers.push(resolve));
      },
      once(event: string, handler: () => void): FakeInterface {
        if (event === "close") closeHandlers.push(handler);
        return rl;
      },
      close: fireClose,
      endInput: fireClose
    };
    interfaces.push(rl);
    return rl;
  });
  return { createInterface, interfaces, answerers };
});

vi.mock("node:readline/promises", () => ({ default: { createInterface }, createInterface }));

/** The browser open is a side effect, and a login about to REFUSE must not make it. */
const { execMock } = vi.hoisted(() => ({ execMock: vi.fn() }));
vi.mock("node:child_process", () => ({ exec: execMock }));

const { loadConfig, saveConfig, resolveBaseUrl } = vi.hoisted(() => ({
  loadConfig: vi.fn(() => ({}) as Record<string, unknown>),
  saveConfig: vi.fn(),
  resolveBaseUrl: vi.fn(() => "https://api.example.invalid")
}));
vi.mock("../config", () => ({ loadConfig, saveConfig, resolveBaseUrl }));

import { loginCommand } from "./login";

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
              `a question written to a redirected stream, which is the hang this file refuses.`
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

const KEY_PROMPT = "Paste your API key (nxs_...): ";
const SETTINGS_URL = "https://app.nexusgpt.io/app/settings/api-keys";
const GOOD_KEY = "nxs_live_example";

describe("a nexus-mcp login prompt is never written where nobody can read it", () => {
  const stdinWas = process.stdin.isTTY;
  const stdoutWas = process.stdout.isTTY;
  const stderrWas = process.stderr.isTTY;
  const exitCodeWas = process.exitCode;

  let stdoutWrites: string[] = [];
  let stderrWrites: string[] = [];
  let logged: string[] = [];
  let errored: string[] = [];

  /**
   * Everything a `>` redirect would capture, from BOTH mechanisms that reach it.
   * See the header: neither capture alone can see the other's writes.
   */
  const onStdout = (): string => stdoutWrites.join("") + logged.join("\n");
  /** Everything a `2>` redirect would capture, from both mechanisms. */
  const onStderr = (): string => stderrWrites.join("") + errored.join("\n");

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

  /** Answer the question the way a terminal would. */
  function typeLine(line: string): void {
    const answer = answerers.shift();
    if (!answer) throw new Error("nothing asked a question — there is no answer to deliver");
    answer(line);
  }

  beforeEach(() => {
    createInterface.mockClear();
    execMock.mockClear();
    saveConfig.mockClear();
    loadConfig.mockReturnValue({});
    interfaces.length = 0;
    answerers.length = 0;
    stdoutWrites = [];
    stderrWrites = [];
    logged = [];
    errored = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown): boolean => {
      stdoutWrites.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown): boolean => {
      stderrWrites.push(String(chunk));
      return true;
    });
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]): void => {
      logged.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]): void => {
      errored.push(args.map(String).join(" "));
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
    );
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setTty(stdinWas === true, stdoutWas === true, stderrWas === true);
    process.exitCode = exitCodeWas;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CONTROLS. Every refusal arm below is "it came back" or "nothing happened",
  // and a harness that cannot reach the ask at all produces both for free.
  // ───────────────────────────────────────────────────────────────────────────

  it("CONTROL: with a visible stream the login asks, reads the answer and saves", async () => {
    setTty(true, true, true);

    const run = loginCommand([]);
    await Promise.resolve();
    typeLine(GOOD_KEY);
    await withinDeadline("login", run);

    expect(createInterface).toHaveBeenCalledTimes(1);
    expect(interfaces[0].questions).toEqual([KEY_PROMPT]);
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ apiKey: GOOD_KEY }));
  });

  it("CONTROL: the deadline FIRES on a question nobody ever answers", async () => {
    // The ask is legitimate here and the silence is the operator's, not the
    // stream's. Without this arm, a deadline that could never reject would make
    // every refusal arm below green on a tree that still hangs.
    //
    // 🔴 ALL THREE ARE TERMINALS, AND THAT IS THE WHOLE POINT OF THE STATE.
    // This arm was first written with `setStdoutRedirected()`, which is a state
    // the SUBJECT decides something about — so a mutant that refuses there made
    // the CONTROL red, and a control that moves with the implementation is an
    // arm wearing a control's name. Measured: mutating the gate to fire on
    // stdout alone reported `promise resolved "undefined" instead of rejecting`
    // HERE, 4ms, alongside the nine real kills. Every TTY combination the gate
    // can refuse is excluded by asking on the one state nothing refuses.
    setTty(true, true, true);

    await expect(withinDeadline("login", loginCommand([]))).rejects.toThrow(
      /did not settle within 2000ms/
    );
  });

  it("CONTROL: the stdout haystack is LIVE for a console.log, which is how the pre-fix code wrote the preamble", () => {
    // 🔴 THE ARM THAT STOPS EVERY `onStdout()` ABSENCE CLAIM BELOW FROM BEING
    // VACUOUS. `console.log` is invisible to a `process.stdout.write` spy in
    // this runner, so an absence asserted over that spy alone could never have
    // failed. This requires the union capture to hold a `console.log` string.
    console.log(`probe ${SETTINGS_URL} probe`);

    expect(onStdout()).toContain(SETTINGS_URL);
  });

  it("CONTROL: the stderr haystack is LIVE for a stream write, which is how the prompt stream writes", () => {
    process.stderr.write(`probe ${SETTINGS_URL} probe\n`);

    expect(onStderr()).toContain(SETTINGS_URL);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ROUTING — the half that makes the single-redirect case WORK rather than
  // refuse. A gate-only fix passes every refusal arm and fails these.
  // ───────────────────────────────────────────────────────────────────────────

  it("opens the readline interface on the PROMPT stream, not on stdout", () => {
    // THE MECHANISM, not a shape. `rl.question()` writes the query to the
    // interface's own `output`, so this is the single thing that decides where
    // the question lands — and it is also what echoes the operator's keystrokes.
    setStdoutRedirected();

    void loginCommand([]);

    expect(interfaces).toHaveLength(1);
    expect(interfaces[0].options.output).toBe(process.stderr);
  });

  it("does not open the interface on the redirected stdout", () => {
    // Separate `it` from the arm above: a failing assertion aborts its own
    // block, so this claim written underneath that one would go unscored by
    // every mutant that moves the output at all.
    setStdoutRedirected();

    void loginCommand([]);

    expect(interfaces[0].options.output).not.toBe(process.stdout);
  });

  it("still reads the answer and saves when stdout alone is redirected", async () => {
    // The outcome that makes the routing worth more than a refusal: the operator
    // is right there, so the login completes rather than being turned away.
    setStdoutRedirected();

    const run = loginCommand([]);
    await Promise.resolve();
    typeLine(GOOD_KEY);
    await withinDeadline("login", run);

    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ apiKey: GOOD_KEY }));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE DIALOGUE. Routing the question alone leaves it UNANSWERABLE: the page
  // the key comes from is in the log file. Presence and absence are separate
  // `it` blocks over haystacks the controls above proved live.
  // ───────────────────────────────────────────────────────────────────────────

  it("writes the settings-page preamble to the prompt stream", () => {
    setStdoutRedirected();

    void loginCommand([]);

    expect(onStderr()).toContain(SETTINGS_URL);
  });

  it("keeps the settings-page preamble OUT of the redirected stdout", () => {
    setStdoutRedirected();

    void loginCommand([]);

    expect(onStdout()).not.toContain(SETTINGS_URL);
  });

  it("writes the copy-a-key instruction to the prompt stream", () => {
    setStdoutRedirected();

    void loginCommand([]);

    expect(onStderr()).toContain("Create or copy an API key");
  });

  it("keeps the copy-a-key instruction OUT of the redirected stdout", () => {
    setStdoutRedirected();

    void loginCommand([]);

    expect(onStdout()).not.toContain("Create or copy an API key");
  });

  it("writes the Validating acknowledgement to the prompt stream", async () => {
    setStdoutRedirected();

    const run = loginCommand([]);
    await Promise.resolve();
    typeLine(GOOD_KEY);
    await withinDeadline("login", run);

    expect(onStderr()).toContain("Validating");
  });

  it("keeps the Validating acknowledgement OUT of the redirected stdout", async () => {
    setStdoutRedirected();

    const run = loginCommand([]);
    await Promise.resolve();
    typeLine(GOOD_KEY);
    await withinDeadline("login", run);

    expect(onStdout()).not.toContain("Validating");
  });

  it("leaves the RESULT on stdout, which is what the redirect exists to capture", async () => {
    // 🔴 THE OTHER SIDE OF THE DIALOGUE/RESULT LINE, and the arm that stops the
    // cure overshooting. A fix that routed every write to the prompt stream
    // would pass every arm above and empty the log file the operator asked for.
    setStdoutRedirected();

    const run = loginCommand([]);
    await Promise.resolve();
    typeLine(GOOD_KEY);
    await withinDeadline("login", run);

    expect(logged.join("\n")).toContain("Logged in successfully");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE PIPE. `canAsk()` alone would refuse this, and it is a supported run —
  // measured working on the pre-fix code.
  // ───────────────────────────────────────────────────────────────────────────

  it("a piped run ASKS THE QUESTION — asserted before any answer is delivered", async () => {
    // 🔴 ITS OWN `expect` FIRES; THE ARM BELOW'S DOES NOT, AND THAT IS WHY BOTH
    // EXIST. That one must `typeLine` before it can assert what was saved, and
    // `typeLine` throws outright when nothing asked — so under a gate widened to
    // a bare `!canAsk()` it reds at line 252 on the FIXTURE'S precondition and
    // `expect(createInterface)…` never runs. The unit of a test result is the
    // BLOCK, so that red proves the path was reached and scores nothing about
    // what the arm claims (`core/vacuous-assertions.md`, fourth form).
    //
    // Measured three times in one mission — here, and in both of `packages/cli`'s
    // ask-site specs — so it is the mission's commonest false kill rather than a
    // local quirk: a mutant that stops a question being asked is scored dead by
    // the fixture DECLINING to answer a question nobody asked.
    //
    // `questions` is the interface's own record, so "it asked" is measured on the
    // subject rather than inferred from the fixture not having thrown.
    setTty(false, false, false);

    void loginCommand([]).catch(() => undefined);
    await Promise.resolve();

    expect(createInterface).toHaveBeenCalledTimes(1);
    expect(interfaces[0]?.questions).toContain(KEY_PROMPT);
  });

  it("a piped run still asks, with no terminal anywhere", async () => {
    // stdin is a pipe, so `canAsk()` is false — and nothing hangs, because the
    // answer arrives from the pipe and no question has to be read by anyone.
    // This is the arm that reds under a bare `!canAsk()` gate.
    setTty(false, false, false);

    const run = loginCommand([]);
    await Promise.resolve();
    typeLine(GOOD_KEY);
    await withinDeadline("piped login", run);

    expect(createInterface).toHaveBeenCalledTimes(1);
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ apiKey: GOOD_KEY }));
  });

  it("a piped run opens no browser, because nobody is at a terminal to see it", () => {
    setTty(false, false, false);

    void loginCommand([]);

    expect(execMock).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INPUT THAT ENDS WITHOUT AN ANSWER — `< /dev/null`. The gate above correctly
  // lets this through, and `question()` never settles. See the header: a real
  // process exits 0 here; in this runner it renders as a hang.
  // ───────────────────────────────────────────────────────────────────────────

  /** `< /dev/null`: stdin is a file at EOF, so no terminal anywhere and no line. */
  async function runWithInputEnded(): Promise<void> {
    setTty(false, false, false);

    const run = loginCommand([]);
    await Promise.resolve();
    const rl = interfaces[0];
    if (!rl) throw new Error("no interface was opened — there is no input to end");
    rl.endInput();
    await withinDeadline("login with input ended", run);
  }

  it("RETURNS instead of blocking when input ends before the key arrives", async () => {
    setTty(false, false, false);

    const run = loginCommand([]);
    await Promise.resolve();
    interfaces[0].endInput();

    await expect(withinDeadline("login with input ended", run)).resolves.toBeUndefined();
  });

  it("catches an input end that arrives in the SAME TICK as the question", async () => {
    // The ordering arm. The close listener is attached BEFORE the question is
    // written, so an EOF already sitting on stdin cannot slip through the gap —
    // a listener attached after the first `await` would miss this close and the
    // command would go back to settling never.
    setTty(false, false, false);

    const run = loginCommand([]);
    interfaces[0].endInput();

    await expect(withinDeadline("login with input ended", run)).resolves.toBeUndefined();
  });

  it("carries a non-zero exit code, so a caller cannot read silence as a login", async () => {
    // 🔴 THE ARM THAT MATTERS MOST, because the shipped behaviour is exit 0 and
    // not a hang — see the header. Asserted over what the command SET.
    await runWithInputEnded();

    expect(process.exitCode).not.toBe(0);
  });

  it("sets an exit code at all when input ended, rather than leaving it undefined", async () => {
    // Separate `it`: `not.toBe(0)` above is satisfied by `undefined`, which is
    // exactly what the unfixed command leaves behind.
    await runWithInputEnded();

    expect(process.exitCode).toBeDefined();
  });

  it("names the question that went unanswered, so the operator knows what was wanted", async () => {
    // Presence, on the haystack `CONTROL: the stderr haystack is LIVE…` proved
    // can hold a stream write.
    await runWithInputEnded();

    expect(onStderr()).toContain("Paste your API key (nxs_...)");
  });

  it("says input ENDED, rather than reporting an empty answer", async () => {
    // The distinction the CLI's prompter header argues for: handing the empty
    // string back reads as "the operator typed nothing" and is reported as a
    // second, wrong refusal. These are different causes and different remedies.
    await runWithInputEnded();

    expect(onStderr()).toContain("input ended");
  });

  it("names the pipe that DOES work, so the remedy is the supported run", async () => {
    await runWithInputEnded();

    expect(onStderr()).toContain("| nexus-mcp login");
  });

  it("names NEXUS_API_KEY, the remedy that removes the prompt entirely", async () => {
    await runWithInputEnded();

    expect(onStderr()).toContain("NEXUS_API_KEY");
  });

  it("keeps the input-ended refusal OUT of stdout, which a caller parses", async () => {
    // Absence, over `onStdout()` — the haystack `CONTROL: the stdout haystack is
    // LIVE for a console.log…` proved can hold a string, and which `leaves the
    // RESULT on stdout` puts a real string into on the success path.
    await runWithInputEnded();

    expect(onStdout()).not.toContain("input ended");
  });

  it("saves nothing when input ends before the key arrives", async () => {
    // Its positive twins are the first CONTROL and `a piped run still asks…`,
    // over this same spy.
    await runWithInputEnded();

    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("reports no success when input ends before the key arrives", async () => {
    await runWithInputEnded();

    expect(onStdout()).not.toContain("Logged in successfully");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE GATE — the one state with no stream left to ask on.
  // ───────────────────────────────────────────────────────────────────────────

  it("RETURNS instead of blocking when stdout and stderr are both redirected", async () => {
    setBothOutputsRedirected();

    await expect(withinDeadline("refused login", loginCommand([]))).resolves.toBeUndefined();
  });

  it("asks no question when nobody could read it", async () => {
    // Its positive twin is the first CONTROL, over this same spy: that arm
    // requires an interface and a recorded question, so "none" here cannot be
    // satisfied by a mock that is simply never reachable.
    setBothOutputsRedirected();

    await withinDeadline("refused login", loginCommand([]));

    expect(createInterface).not.toHaveBeenCalled();
  });

  it("opens no browser when it is about to refuse", async () => {
    // Why the gate sits above step 1 rather than at the ask: a window that
    // appears for a login that then refuses is worse than no window.
    setBothOutputsRedirected();

    await withinDeadline("refused login", loginCommand([]));

    expect(execMock).not.toHaveBeenCalled();
  });

  it("says nothing about the settings page when it refuses", async () => {
    // Paired with the dialogue arms, which require that same string on stderr
    // for a reachable run — so this is not a claim an inert command satisfies.
    setBothOutputsRedirected();

    await withinDeadline("refused login", loginCommand([]));

    expect(onStdout()).not.toContain(SETTINGS_URL);
  });

  it("names the question it refused, so the operator knows what stopped the run", async () => {
    setBothOutputsRedirected();

    await withinDeadline("refused login", loginCommand([]));

    expect(onStderr()).toContain("Paste your API key (nxs_...)");
  });

  it("names the cause, which is the pair of redirected streams", async () => {
    setBothOutputsRedirected();

    await withinDeadline("refused login", loginCommand([]));

    expect(onStderr()).toContain("nowhere to show the question");
  });

  it("names a remedy that removes the prompt rather than only the cause", async () => {
    // `NEXUS_API_KEY` is read ahead of the config file by `resolveApiKey`, so it
    // skips this command entirely — the same remedy `config.ts` already names
    // when no key is found at all.
    setBothOutputsRedirected();

    await withinDeadline("refused login", loginCommand([]));

    expect(onStderr()).toContain("NEXUS_API_KEY");
  });

  it("carries a non-zero exit code, so a script learns the login did not happen", async () => {
    // Asserted over what the command SET, never over a constant: `1 !== 0` is
    // true whatever this command does.
    setBothOutputsRedirected();

    await withinDeadline("refused login", loginCommand([]));

    expect(process.exitCode).not.toBe(0);
  });

  it("sets an exit code at all, rather than leaving it undefined", async () => {
    // Separate `it`: `not.toBe(0)` above is satisfied by `undefined`, which is
    // what a command that refused and forgot to say so leaves behind.
    setBothOutputsRedirected();

    await withinDeadline("refused login", loginCommand([]));

    expect(process.exitCode).toBeDefined();
  });

  it("saves nothing when it refuses", async () => {
    setBothOutputsRedirected();

    await withinDeadline("refused login", loginCommand([]));

    expect(saveConfig).not.toHaveBeenCalled();
  });
});
