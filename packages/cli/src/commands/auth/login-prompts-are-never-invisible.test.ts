import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleError } from "../../errors";
import { CategorizedCliError, EXIT_CODES } from "../../exit-codes";
import { setJsonMode } from "../../output";

/**
 * THE HANG ONE REDIRECT WAS ENOUGH TO REACH.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `nexus auth login > out.log` FROM A KEYBOARD BLOCKED ON A QUESTION IN THE
 *    LOG FILE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `login.prompter.ts` named `stdout` twice — the readline interface's `output`
 * and the hand-written question write — so neither of them consulted
 * `promptStream()` and `canAsk()` could not reach either. One `> out.log` put
 * the question in the file while stdin stayed a terminal, and the process waited
 * for a keystroke nobody had been shown. All five `auth login` prompts funnel
 * through the one `ask`, so the whole command had it.
 *
 * ── THE TWO HALVES ARE ASSERTED SEPARATELY, BECAUSE A GATE ALONE IS A BUG ────
 *
 * ROUTING and GATING are different arms here on purpose. With stdout alone
 * redirected the question CAN be shown — on stderr — so the right outcome is
 * that the ask SUCCEEDS, and `routes the question…` below is what pins that. A
 * fix that only added `if (!canAsk()) refuse` would turn that working ask into a
 * refusal while passing every arm that asks "does it refuse"; the refusal arms
 * below cannot see the difference, and the routing arms cannot see a missing
 * gate. Both directions are needed and neither implies the other.
 *
 * ── WHY THE GATE IS NOT `canAsk()` ──────────────────────────────────────────
 *
 * `canAsk()` demands a terminal on stdin too, and `auth login` deliberately
 * supports a PIPE there — the line queue in the prompter exists for
 * `printf 'nxs_…\nwork\n' | nexus auth login` (NEX-1879 defect 3). A bare
 * `!canAsk()` gate refuses every one of those runs even though nothing hangs:
 * the answer comes off the pipe and no question has to be read by anyone.
 * `a piped run still asks…` is the arm that fails under that mutant, and it is
 * the reason this file's gate is `canAsk()`'s question half guarded by stdin.
 *
 * ── THE DEADLINE, AND WHY ITS OWN CONTROL IS THE POINT ──────────────────────
 *
 * A hang has no assertion to read: without a bound the pristine-tree run of the
 * refusal arms takes the whole suite down instead of reporting. `withinDeadline`
 * turns that silence into a named failure — and `CONTROL: the deadline FIRES`
 * is what makes its green mean anything, since "resolved in time" and "the
 * deadline can never reject" are otherwise the same green.
 */

interface FakeInterfaceOptions {
  readonly input: unknown;
  readonly output: unknown;
}

interface FakeInterface {
  readonly options: FakeInterfaceOptions;
  readonly handlers: Map<string, (arg: string) => void>;
  closed: boolean;
  on(event: string, listener: (arg: string) => void): FakeInterface;
  close(): void;
}

/**
 * The interface is mocked rather than driven, because the hang is the ABSENCE of
 * a `line` event and a real readline over a fake stdin cannot withhold one
 * honestly. Every interface it hands out is recorded, so "nothing was opened" is
 * a measurable claim and not an inferred one.
 */
const { createInterface, interfaces } = vi.hoisted(() => {
  const interfaces: FakeInterface[] = [];
  const createInterface = vi.fn((options: FakeInterfaceOptions): FakeInterface => {
    const handlers = new Map<string, (arg: string) => void>();
    const rl: FakeInterface = {
      options,
      handlers,
      closed: false,
      on(event, listener) {
        handlers.set(event, listener);
        return rl;
      },
      close() {
        rl.closed = true;
      }
    };
    interfaces.push(rl);
    return rl;
  });
  return { createInterface, interfaces };
});

vi.mock("node:readline/promises", () => ({ default: { createInterface }, createInterface }));

/**
 * `openUrl` is the IRREVERSIBLE ACT the hoisted gate exists to sit above, and it
 * is mocked because the real one spawns `open`/`xdg-open` at the developer's
 * desktop. One `vi.fn` serves both halves of the pair below — the presence arm
 * and the absence arm read the SAME object, which is what makes the absence a
 * measurement rather than a claim about a haystack that could never hold a call.
 */
const { openUrl } = vi.hoisted(() => ({ openUrl: vi.fn((_url: string): void => undefined) }));

vi.mock("../../util/open-url", () => ({ openUrl }));

import type { UserOrganization } from "./_shared/fetch-organizations";
import { promptPlatformOperatorOrg } from "./login.platform-operator-org";
import { createPrompter } from "./login.prompter";
import { resolveApiKey } from "./login.resolve-key";
import { selectOrganization } from "./login.select-organization";
import { SETTINGS_URL } from "./login.settings-url";

const DEADLINE_MS = 2_000;

/** Two memberships, so the selector takes its PROMPTING branch rather than the silent one. */
const TWO_ORGS: readonly UserOrganization[] = [
  { organizationId: "org_alpha", name: "Alpha", role: "admin" },
  { organizationId: "org_beta", name: "Beta", role: "member" }
];

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

describe("an auth login prompt is never written where nobody can read it", () => {
  const stdinWas = process.stdin.isTTY;
  const stdoutWas = process.stdout.isTTY;
  const stderrWas = process.stderr.isTTY;
  const exitCodeWas = process.exitCode;

  let toStdout: string[] = [];
  let toStderr: string[] = [];
  /**
   * What `console.log` was handed — a SEPARATE haystack from the two above.
   *
   * 🚨 VITEST SUBSTITUTES ITS OWN `console`, SO `console.log` NEVER REACHES
   * `process.stdout.write` HERE. A spy on the stream therefore captures only
   * direct `promptStream()` writes, and an absence arm phrased over `toStdout`
   * is satisfied by a haystack that could never have held the string — measured,
   * against the mutant that puts the organization list back on `console.log`:
   * the presence arm red and its `toStdout` pair stayed green. The sixth form in
   * `core/vacuous-assertions.md`. So an "it is NOT on the wrong stream" claim
   * goes over THIS array, which the same mutant proves can hold it.
   */
  let logged: string[] = [];

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

  /** Deliver a line as the terminal would, to the interface `ask` opened. */
  function typeLine(line: string): void {
    // Indexed, not `.at(-1)`: this package's `lib` predates `Array.prototype.at`,
    // and vitest transpiles without typechecking — so the green run said nothing
    // and the pre-commit typecheck is what refused it (TS2550).
    const rl: FakeInterface | undefined = interfaces[interfaces.length - 1];
    if (!rl) throw new Error("no readline interface was opened — nothing to type into");
    const onLine = rl.handlers.get("line");
    if (!onLine) throw new Error("the interface registered no `line` handler");
    onLine(line);
  }

  beforeEach(() => {
    createInterface.mockClear();
    openUrl.mockClear();
    interfaces.length = 0;
    toStdout = [];
    toStderr = [];
    logged = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]): void => {
      logged.push(args.map(String).join(" "));
    });
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown): boolean => {
      toStdout.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown): boolean => {
      toStderr.push(String(chunk));
      return true;
    });
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setTty(stdinWas === true, stdoutWas === true, stderrWas === true);
    process.exitCode = exitCodeWas;
    setJsonMode(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CONTROLS. Every refusal arm below is "it came back" or "nothing was opened",
  // and a harness that cannot reach an ask at all produces both for free.
  // ───────────────────────────────────────────────────────────────────────────

  it("CONTROL: with a visible stream the ask happens and the typed line is read", async () => {
    setTty(true, true, true);
    const { ask } = createPrompter();

    const answer = ask(KEY_PROMPT);
    typeLine("nxs_live");

    await expect(withinDeadline("ask", answer)).resolves.toBe("nxs_live");
    expect(createInterface).toHaveBeenCalledTimes(1);
  });

  it("CONTROL: the deadline FIRES on an ask nobody ever answers", async () => {
    // Reachable precisely because stderr is a terminal: the ask is legitimate
    // and the silence is the operator's, not the stream's. Without this arm, a
    // deadline that could never reject would make every refusal arm below green
    // on a tree that still hangs.
    setTty(true, true, true);
    const { ask } = createPrompter();

    await expect(withinDeadline("ask", ask(KEY_PROMPT))).rejects.toThrow(
      /did not settle within 2000ms/
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ROUTING — the half that makes the single-redirect case WORK rather than
  // refuse. A gate-only fix passes every refusal arm and fails these.
  // ───────────────────────────────────────────────────────────────────────────

  it("routes the question to stderr when stdout alone is redirected, and still reads the answer", async () => {
    setStdoutRedirected();
    const { ask } = createPrompter();

    const answer = ask(KEY_PROMPT);
    typeLine("nxs_live");

    await expect(withinDeadline("ask", answer)).resolves.toBe("nxs_live");
    expect(toStderr.join("")).toContain("Paste your API key");
  });

  it("writes NOTHING to the redirected stdout, so the log file is not where the question went", () => {
    // Paired with the arm above over the same two haystacks: that one requires
    // the question on stderr, so this absence cannot be satisfied by a prompter
    // that writes nowhere at all.
    setStdoutRedirected();
    const { ask } = createPrompter();

    void ask(KEY_PROMPT);

    expect(toStdout.join("")).not.toContain("Paste your API key");
  });

  it("opens the readline interface on the PROMPT stream, not on stdout", () => {
    // THE MECHANISM, not the shape. A fix that routed only the hand-written
    // question would satisfy the two arms above while readline kept echoing the
    // operator's keystrokes into the log file — the half of the dialogue this
    // arm is the only one to see.
    setStdoutRedirected();
    const { ask } = createPrompter();

    void ask(KEY_PROMPT);

    expect(interfaces).toHaveLength(1);
    expect(interfaces[0].options.output).toBe(process.stderr);
    expect(interfaces[0].options.output).not.toBe(process.stdout);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE PIPE. `canAsk()` alone would refuse this, and it is a supported run.
  // ───────────────────────────────────────────────────────────────────────────

  it("a piped run OPENS the interface, asserted BEFORE anything is typed into it", async () => {
    // 🔴 ITS OWN ASSERTION FIRES; THE ARM BELOW'S DOES NOT. That one has to
    // `typeLine` before it can assert the answer, and `typeLine` throws outright
    // when no interface was opened — so under a gate widened to a bare
    // `!canAsk()` it reds inside the HELPER and `resolves.toBe(...)` never runs.
    // The unit of a test result is the BLOCK, so that red proves the path was
    // reached and scores nothing about what the arm claims
    // (`core/vacuous-assertions.md`, fourth form). This one asserts first.
    setTty(false, false, false);
    const { ask } = createPrompter();

    void ask(KEY_PROMPT).catch(() => undefined);

    expect(createInterface).toHaveBeenCalledTimes(1);
  });

  it("a piped run still asks, with both outputs redirected and no terminal anywhere", async () => {
    // stdin is a pipe, so `canAsk()` is false — and nothing hangs, because the
    // answer arrives from the pipe and no question has to be read by anyone.
    // This is the arm that reds under a bare `!canAsk()` gate.
    setTty(false, false, false);
    const { ask } = createPrompter();

    const answer = ask(KEY_PROMPT);
    typeLine("nxs_piped");

    await expect(withinDeadline("piped ask", answer)).resolves.toBe("nxs_piped");
    expect(createInterface).toHaveBeenCalledTimes(1);
  });

  it("still queues a second prompt's line across the gap between prompts", async () => {
    // The gate sits above the line queue, so it must not have broken it:
    // NEX-1879 defect 3 was the second prompt never resolving on piped stdin.
    setTty(false, false, false);
    const { ask } = createPrompter();

    const first = ask(KEY_PROMPT);
    typeLine("nxs_piped");
    await expect(withinDeadline("first ask", first)).resolves.toBe("nxs_piped");

    typeLine("work");
    await expect(withinDeadline("second ask", ask("Profile name [acme]: "))).resolves.toBe("work");
    expect(createInterface).toHaveBeenCalledTimes(1);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE GATE — the one state with no stream left to ask on.
  // ───────────────────────────────────────────────────────────────────────────

  it("REFUSES instead of blocking when stdout and stderr are both redirected", async () => {
    setBothOutputsRedirected();
    const { ask } = createPrompter();

    await expect(withinDeadline("refused ask", ask(KEY_PROMPT))).rejects.toBeInstanceOf(
      CategorizedCliError
    );
  });

  it("REJECTS rather than throwing synchronously, so one catch covers both refusals", () => {
    // Caught by this file against its own first implementation: a gate at the
    // top of `ask` throws before any promise exists, so `ask(q).catch(…)` never
    // runs and a caller must handle two shapes. `ask` is declared
    // `Promise<string>` and its input-ended refusal already rejects.
    setBothOutputsRedirected();
    const { ask } = createPrompter();

    let threw = false;
    let returned: unknown;
    try {
      returned = ask(KEY_PROMPT);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(returned).toBeInstanceOf(Promise);
    void (returned as Promise<string>).catch(() => undefined);
  });

  it("opens no interface when nobody could read the question", async () => {
    // Its positive twin is the first CONTROL, over this same spy: that arm
    // requires an interface, so "none opened" here cannot be satisfied by a mock
    // that is never reachable.
    setBothOutputsRedirected();
    const { ask } = createPrompter();

    await expect(withinDeadline("refused ask", ask(KEY_PROMPT))).rejects.toThrow();

    expect(createInterface).not.toHaveBeenCalled();
  });

  it("writes the question to neither stream when nobody could read it", async () => {
    // Paired with the routing arms, which require the question on stderr for the
    // same prompt text — so this is not a claim an inert prompter satisfies.
    setBothOutputsRedirected();
    const { ask } = createPrompter();

    await expect(withinDeadline("refused ask", ask(KEY_PROMPT))).rejects.toThrow();

    expect(toStdout.join("")).not.toContain("Paste your API key");
    expect(toStderr.join("")).not.toContain("Paste your API key");
  });

  it("refuses with the invalid-input exit code, which is the invocation's category", async () => {
    setBothOutputsRedirected();
    const { ask } = createPrompter();

    const refusal: unknown = await withinDeadline("refused ask", ask(KEY_PROMPT)).catch(
      (err: unknown) => err
    );

    expect(refusal).toBeInstanceOf(CategorizedCliError);
    expect((refusal as CategorizedCliError).exitCode).toBe(EXIT_CODES["invalid-input"]);
  });

  it("names the question it refused, so the operator knows which prompt stopped the run", async () => {
    setBothOutputsRedirected();
    const { ask } = createPrompter();

    const refusal: unknown = await withinDeadline("refused ask", ask(KEY_PROMPT)).catch(
      (err: unknown) => err
    );

    expect((refusal as CategorizedCliError).message).toContain("Paste your API key (nxs_...)");
    expect((refusal as CategorizedCliError).message).toContain("nowhere to show the question");
  });

  it("names a re-run that removes the prompt, rather than only the cause", async () => {
    setBothOutputsRedirected();
    const { ask } = createPrompter();

    const refusal: unknown = await withinDeadline("refused ask", ask(KEY_PROMPT)).catch(
      (err: unknown) => err
    );

    const hint = String((refusal as CategorizedCliError).hint ?? "");
    expect(hint).toContain("--api-key");
    expect(hint).toContain("--profile");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE REFUSAL IS A DOCUMENT. A throw with no document leaves stdout empty
  // under --json, which is the one flag whose promise is that a failure parses.
  // `login.command.ts` routes a categorized throw through `handleError`.
  // ───────────────────────────────────────────────────────────────────────────

  it("reaches stdout as ONE parseable document under --json, naming the cause and the remedy", async () => {
    setBothOutputsRedirected();
    setJsonMode(true);
    const { ask } = createPrompter();

    const refusal: unknown = await withinDeadline("refused ask", ask(KEY_PROMPT)).catch(
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
    expect(error?.message).toContain("nowhere to show the question");
    expect(String(error?.hint ?? "")).toContain("--api-key");
    expect(error?.code).not.toBe(undefined);
    expect(code).toBe(EXIT_CODES["invalid-input"]);
  });

  it("carries a non-zero code, so a script learns the login did not happen", async () => {
    // Separate `it` from the category arm on purpose: a failing assertion aborts
    // its own block, so a non-zero claim written under the equality above would
    // go unscored by every mutant that moves the category. And asserted over the
    // REFUSAL rather than over the table — `EXIT_CODES["invalid-input"] !== 0` is
    // true whatever this prompter does.
    setBothOutputsRedirected();
    const { ask } = createPrompter();

    const refusal: unknown = await withinDeadline("refused ask", ask(KEY_PROMPT)).catch(
      (err: unknown) => err
    );

    expect((refusal as CategorizedCliError).exitCode).not.toBe(0);
    expect((refusal as CategorizedCliError).exitCode).not.toBe(undefined);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // WHERE THE GATE SITS, NOT WHAT IT TESTS.
  //
  // 🚨 FOUND BY BUGBOT ON THE PROMOTION, NOT BY ANY ARM ABOVE, AND THAT IS THE
  // POINT OF WRITING IT DOWN. The gate was `ask`'s first statement, and `ask`
  // runs AFTER `resolveApiKey` has printed the settings preamble and called
  // `openUrl` — so `nexus auth login >out.log 2>err.log` from a keyboard OPENED A
  // BROWSER WINDOW for a login that then exited 1. Every refusal arm above passed:
  // they ask WHETHER it refuses, and the defect is WHEN.
  //
  // So the pair below is over `openUrl`, and the PRESENCE arm is what makes the
  // absence one evidence — one `vi.fn`, one call shape, two trees. An absence arm
  // with no presence twin over the same instrument is the sixth form in
  // `core/vacuous-assertions.md`, and this file already carries one specimen of
  // it (`logged` vs `toStdout`, above).
  //
  // The REAL prompter is used rather than a resolving stub, deliberately: with
  // the hoist deleted, `ask`'s own gate still refuses, so the run still rejects
  // and `openUrl` is the ONLY thing that moves. That asymmetry is what proves
  // these arms measure the gate's POSITION and not its condition.
  // ───────────────────────────────────────────────────────────────────────────

  it("opens the settings page when the key prompt can be shown — the act the gate sits above", async () => {
    setStdoutRedirected();
    const { ask } = createPrompter();

    const resolved = resolveApiKey(ask, undefined);
    typeLine("nxs_live");

    await expect(withinDeadline("resolveApiKey", resolved)).resolves.toMatchObject({
      apiKey: "nxs_live"
    });
    expect(openUrl).toHaveBeenCalledWith(SETTINGS_URL);
  });

  it("opens NO browser window when the key prompt could not be shown", async () => {
    // The bugbot finding, as an arm. Its twin is directly above, over this same
    // `vi.fn` and this same argument, so "not called" cannot be satisfied by a
    // mock nothing could ever reach.
    setBothOutputsRedirected();
    const { ask } = createPrompter();

    await expect(
      withinDeadline("refused resolveApiKey", resolveApiKey(ask, undefined))
    ).rejects.toBeInstanceOf(CategorizedCliError);

    expect(openUrl).not.toHaveBeenCalled();
  });

  it("prints no settings preamble either, so the log file carries nothing about a login that did not happen", async () => {
    // Its own `it`: a failing assertion aborts its block, so this claim written
    // under the one above would go unscored by every mutant that moves that one.
    setBothOutputsRedirected();
    const { ask } = createPrompter();

    await withinDeadline("refused resolveApiKey", resolveApiKey(ask, undefined)).catch(
      () => undefined
    );

    expect(toStdout.join("")).not.toContain(SETTINGS_URL);
    expect(toStderr.join("")).not.toContain(SETTINGS_URL);
  });

  it("refuses with the invocation's own category, so login.command.ts hands it to handleError", async () => {
    // `resolveApiKey` THROWS where `ask` returns-and-rejects, and the category is
    // what `login.command.ts`'s catch keys on: a `CategorizedCliError` goes to
    // `handleError`, anything else is restamped `local-failed` — exit 9 under a
    // document saying something else.
    setBothOutputsRedirected();
    const { ask } = createPrompter();

    const refusal: unknown = await withinDeadline(
      "refused resolveApiKey",
      resolveApiKey(ask, undefined)
    ).catch((err: unknown) => err);

    expect(refusal).toBeInstanceOf(CategorizedCliError);
    expect((refusal as CategorizedCliError).exitCode).toBe(EXIT_CODES["invalid-input"]);
    expect((refusal as CategorizedCliError).message).toContain("Paste your API key (nxs_...)");
  });

  it("leaves a --api-key run alone, because it asks nothing at all", async () => {
    // The arm that fails if the gate is hoisted too far — above `if (!apiKey)`
    // rather than inside it. A scripted login with the key in the invocation is
    // the sanctioned way to run with both outputs redirected, and refusing it
    // would break the remedy this file's own hint prints.
    setBothOutputsRedirected();
    const { ask } = createPrompter();

    await expect(
      withinDeadline("provided key", resolveApiKey(ask, "nxs_from_flag"))
    ).resolves.toMatchObject({ apiKey: "nxs_from_flag" });

    expect(openUrl).not.toHaveBeenCalled();
    expect(createInterface).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE PREAMBLE SHARES THE QUESTION'S STREAM.
  //
  // 🚨 FOUND BY BUGBOT ON THIS PR, NOT BY THE ARMS ABOVE, AND THAT IS THE POINT
  // OF WRITING IT DOWN. Routing the question alone left the numbered
  // organization list on `console.log`: under `> out.log` the terminal showed
  // `Select active organization [1]:` and the numbers it asks for went into the
  // file, so a personal token with several memberships was unanswerable from
  // what was visible. Every arm above passed — they only ever asked where the
  // QUESTION went. `promptLine`'s own docblock names this defect ("splitting a
  // dialogue across two streams is the same defect as asking on the wrong one,
  // one step later"), and a spend gate had already shipped it once.
  // ───────────────────────────────────────────────────────────────────────────

  it("puts the numbered organization list on the question's stream, not the redirected one", async () => {
    setStdoutRedirected();
    const answered: string[] = [];

    const chosen = await selectOrganization(async (question: string): Promise<string> => {
      answered.push(question);
      return "2";
    }, TWO_ORGS);

    // POSITIVE FIRST: the ask has to have happened, or "not on stdout" below is
    // satisfied by a function that printed nothing and asked nothing.
    expect(answered).toHaveLength(1);
    expect(chosen?.orgId).toBe("org_beta");
    expect(toStderr.join("")).toContain("Beta");
  });

  it("keeps that list off console.log, which is the stream the question is NOT on", async () => {
    // The pair of the arm above, over the haystack that CAN hold it: `logged`,
    // not `toStdout`. The mutant restoring `console.log` reds this one and the
    // presence arm together; phrased over `toStdout` it could not fail at all.
    setStdoutRedirected();

    await selectOrganization(async (): Promise<string> => "1", TWO_ORGS);

    expect(logged.join("\n")).not.toContain("Beta");
  });

  it("puts the platform-operator audit warning on the question's stream", async () => {
    // The warning is the one thing an operator most needs in front of them while
    // answering: this key acts on organizations they are not a member of.
    setStdoutRedirected();

    const choice = await promptPlatformOperatorOrg(
      async (): Promise<string> => "org_target",
      TWO_ORGS
    );

    expect(choice?.orgId).toBe("org_target");
    expect(toStderr.join("")).toContain("recorded in the admin audit log");
  });

  it("keeps that warning off console.log", async () => {
    // Its own `it`, not a second assertion under the presence arm: a failing
    // assertion aborts its block, so an absence claim written below the presence
    // claim goes unscored by every mutant that moves the presence one.
    setStdoutRedirected();

    await promptPlatformOperatorOrg(async (): Promise<string> => "org_target", TWO_ORGS);

    expect(logged.join("\n")).not.toContain("recorded in the admin audit log");
  });
});
