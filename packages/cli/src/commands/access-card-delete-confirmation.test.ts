import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "../exit-codes";
import { setJsonMode } from "../output";
import { isConfirmable } from "../util/confirm";

/**
 * `access-card delete` NOW ASKS, AND THAT IS A BREAKING CHANGE.
 *
 * It was the last entry in `UNCONFIRMED_DESTRUCTIVE` whose siblings all refuse
 * off a terminal: it declared no `--yes`, asked nothing, and its own Notes said
 * so. A pipeline without the flag destroyed the card, and every agent call
 * routed through it then failed 403 at run time with nobody warned.
 *
 * ── WHY THIS FILE DRIVES THE COMMAND AND NOT THE HELPER ─────────────────────
 *
 * `confirmDestructive` has its own unit coverage in
 * `src/util/confirm-refuses-when-the-question-cannot-be-seen.test.ts`, and the
 * whole population is driven in `destructive-confirmation.driven.test.ts`.
 * Neither answers the question this file asks. A helper returning false proves
 * nothing about whether THIS action calls it, and the driven gate synthesizes
 * an argv with no `--yes` only — so it never exercises the ANSWER, which is the
 * half an operator at a keyboard actually meets. Every case below parses real
 * argv through the real registrar and asserts on the SDK call that did or did
 * not happen.
 *
 * ── THE DECLINE PATH IS TWO ARMS, DELIBERATELY ──────────────────────────────
 *
 * 🚨 `expect(deleteCard).not.toHaveBeenCalled()` IS SATISFIED BY THE BUG THIS
 * CHANGE FIXES, AND BY EVERY OTHER WAY OF NOT ASKING. A command that refuses
 * before prompting also calls nothing; so does one whose registrar throws. So
 * the decline path asserts BOTH that the question was put AND that nothing was
 * destroyed — and in two separate `it` blocks, because a failing assertion
 * throws and aborts the rest of its own block, so two arms under one `it` score
 * exactly one of them per mutant and the report has no field for the
 * difference. The setup here is a few milliseconds, so one arm per block costs
 * nothing and says WHICH property survived.
 */

const { deleteCard, question } = vi.hoisted(() => ({
  deleteCard: vi.fn(),
  question: vi.fn()
}));

vi.mock("../client", () => ({
  createClient: () => ({ credentials: { cards: { delete: deleteCard } } })
}));

// The confirmation reaches readline through a DYNAMIC import in `util/ask.ts`,
// so the mock has to stand in for the real module rather than for a helper the
// command owns.
//
// 🚨 `once` RETURNS THE INTERFACE. `askLine` chains
// `rl.once("SIGINT", abort).once("close", abort)`, so a stub returning
// `undefined` throws on the second call — inside a `new Promise` executor,
// which turns it into a REJECTION the command's own catch swallows. The delete
// then does not happen for the wrong reason, and every refusal arm below would
// pass on a command that never asks at all.
vi.mock("node:readline/promises", () => ({
  createInterface: () => {
    const iface = {
      question,
      close: () => undefined,
      once: () => iface
    };
    return iface;
  }
}));

import { registerAccessCardCommands } from "./access-card";

const CARD_ID = "11111111-1111-4111-8111-111111111111";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerAccessCardCommands(program);
  await program.parseAsync(["node", "nexus", ...argv]);
}

describe("access-card delete asks before it destroys", () => {
  const stdinWasTty = process.stdin.isTTY;
  const stdoutWasTty = process.stdout.isTTY;
  const stderrWasTty = process.stderr.isTTY;
  const exitCodeWas = process.exitCode;

  beforeEach(() => {
    deleteCard.mockReset();
    question.mockReset();
    deleteCard.mockResolvedValue({ deleted: true });
    process.exitCode = undefined;
  });

  afterEach(() => {
    setTty(stdinWasTty === true, stdoutWasTty === true, stderrWasTty === true);
    process.exitCode = exitCodeWas;
    setJsonMode(false);
  });

  /**
   * All three streams, every time. `canAsk()` reads stdin AND the stream the
   * question would be written on, and `promptStream()` picks between stdout and
   * stderr — so leaving one of the three at whatever the runner happened to
   * give us makes which branch runs a property of the environment.
   */
  function setTty(stdin: boolean, stdout: boolean, stderr: boolean): void {
    Object.defineProperty(process.stdin, "isTTY", { value: stdin, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: stdout, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: stderr, configurable: true });
  }

  /**
   * The error document a refusal owes a `--json` caller, parsed off stdout.
   *
   * JSON mode is set directly rather than by passing `--json`: that flag is a
   * GLOBAL on the root program, which this harness does not build, so putting
   * it in argv is `error: unknown option '--json'` from commander and the arm
   * reds before the command runs.
   */
  async function refusalDocument(argv: string[]): Promise<{ message?: string; hint?: string }> {
    setJsonMode(true);
    const chunks: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => void chunks.push(args.map(String).join(" "));
    try {
      await run(argv);
    } finally {
      console.log = log;
    }
    const parsed: unknown = JSON.parse(chunks.join("\n"));
    const error = (parsed as { error?: { message?: string; hint?: string } }).error;
    return { message: error?.message, hint: error?.hint };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CONTROL. Every refusal arm below asserts "the delete did NOT happen", which
  // is also what a broken harness, a wrong SDK path or a registrar that threw
  // produce. This proves the harness CAN see a delete.
  // ───────────────────────────────────────────────────────────────────────────
  it("CONTROL: --yes on a terminal deletes, and asks nothing", async () => {
    setTty(true, true, true);

    await run(["access-card", "delete", CARD_ID, "--yes"]);

    expect(question).not.toHaveBeenCalled();
    expect(deleteCard).toHaveBeenCalledWith(CARD_ID);
  });

  it("the flag is declared through confirmable(), not hand-rolled", () => {
    // 🚨 `expect(options).toContain("--yes")` WAS WRITTEN HERE FIRST AND IS
    // VACUOUS: a hand-rolled `.option("--yes", …)` satisfies it exactly, and
    // that spelling is invisible to `isConfirmable` — which is the WeakSet
    // `confirmable` alone writes, and the only thing `compatibility-figures`
    // reads to claim every `--yes` goes through the one helper. So the arm
    // asserts the REGISTRATION, which is the property that can be lost.
    const program = new Command();
    program.name("nexus").exitOverride();
    registerAccessCardCommands(program);

    const accessCard = program.commands.find((c) => c.name() === "access-card");
    const remove = accessCard?.commands.find((c) => c.name() === "delete");
    expect(remove, "access-card delete is not registered").toBeDefined();
    if (remove === undefined) return;

    expect(isConfirmable(remove)).toBe(true);
  });

  it("PROCEEDS when stdin is a terminal and the operator answers y", async () => {
    setTty(true, true, true);
    question.mockResolvedValue("y");

    await run(["access-card", "delete", CARD_ID]);

    expect(question).toHaveBeenCalledTimes(1);
    expect(deleteCard).toHaveBeenCalledWith(CARD_ID);
  });

  // ── THE DECLINE PATH, IN TWO ARMS. See this file's header. ────────────────

  it("DECLINE, arm 1 of 2: the question WAS put", async () => {
    setTty(true, true, true);
    question.mockResolvedValue("n");

    await run(["access-card", "delete", CARD_ID]);

    // Alone, arm 2 is satisfied by never asking at all. This is the half that
    // says the operator was consulted.
    expect(question).toHaveBeenCalledTimes(1);
  });

  it("DECLINE, arm 2 of 2: nothing was destroyed", async () => {
    setTty(true, true, true);
    question.mockResolvedValue("n");

    await run(["access-card", "delete", CARD_ID]);

    // Alone, arm 1 is satisfied by a command that asks and then deletes anyway.
    expect(deleteCard).not.toHaveBeenCalled();
  });

  it("ABORTS on a bare Enter — the capital in [y/N] is a promise", async () => {
    setTty(true, true, true);
    question.mockResolvedValue("");

    await run(["access-card", "delete", CARD_ID]);

    expect(question).toHaveBeenCalledTimes(1);
    expect(deleteCard).not.toHaveBeenCalled();
  });

  // ── CANNOT ASK: the two shapes, and they say different things ─────────────

  it("REFUSES with no terminal, and reports it with invalid-input", async () => {
    // A pipeline. The shipped behaviour until now was a silent delete here.
    setTty(false, false, false);

    await run(["access-card", "delete", CARD_ID]);

    expect(question).not.toHaveBeenCalled();
    expect(deleteCard).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(EXIT_CODES["invalid-input"]);
  });

  it("REFUSES when stdin is a terminal and NEITHER output stream can show the question", async () => {
    // `nexus access-card delete <id> >out.log 2>err.log` from a real keyboard.
    // stdin is readable, so a gate on stdin alone passes it through and the
    // process blocks on a keystroke nobody was asked for.
    setTty(true, false, false);

    await run(["access-card", "delete", CARD_ID]);

    expect(question).not.toHaveBeenCalled();
    expect(deleteCard).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(EXIT_CODES["invalid-input"]);
  });

  it("REFUSES under --json with a document on stdout naming the missing terminal", async () => {
    // A refusal owes the caller something to parse. `console.error` + a non-zero
    // exit is the one combination a script cannot work around.
    setTty(false, false, false);

    const doc = await refusalDocument(["access-card", "delete", CARD_ID]);

    expect(deleteCard).not.toHaveBeenCalled();
    expect(doc.message).toContain("refusing without a terminal");
    expect(doc.message).toContain(CARD_ID);
    expect(String(doc.hint ?? "")).toContain("--yes");
  });

  it("names the REDIRECTED streams, not a missing terminal, when stdin is a TTY", async () => {
    // The two causes prescribe the same remedy from different situations, and
    // the operator reads this out of the file they redirected to. "No terminal"
    // over a run typed at a terminal sends them looking for the wrong thing.
    setTty(true, false, false);

    const doc = await refusalDocument(["access-card", "delete", CARD_ID]);

    expect(deleteCard).not.toHaveBeenCalled();
    expect(doc.message).toContain("stdout and stderr are both redirected");
    expect(String(doc.hint ?? "")).toContain("--yes");
  });
});
