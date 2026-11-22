import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../../output";
import { type ClaudeTarget } from "../../util/claude-target";
import { type SkillsInstallOpts } from "../claude-code";

/**
 * THE SKILLS LOCATION PICKER GATES ON `canAsk()`, AND A STDIN GATE LEFT A HANG.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `nexus skills update >out.log 2>err.log`, TYPED AT A REAL KEYBOARD.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * stdin is still a terminal, so a gate on `process.stdin.isTTY` lets the picker
 * run. `promptStream()` then resolves to stderr — which is err.log — so the
 * three candidate paths and `Choose [1/2/3, default 1]:` land in a file, the
 * terminal shows nothing, and the process blocks on a keystroke nobody was
 * asked for. The operator sees a command that has stopped, with no prompt and
 * no error; in CI it burns to the job timeout.
 *
 * `canAsk()` is both halves of the conversation in one answer — stdin says an
 * ANSWER can arrive, the prompt stream says the QUESTION can be read — so the
 * picker is unreachable in exactly the case where it would be invisible, and
 * detection stands instead. `util/confirm.stream.ts` owns the reasoning.
 *
 * ── WHY THE CONTROL ANSWERS `9` AND NOT `1` ─────────────────────────────────
 *
 * 🚨 THE OBVIOUS CONTROL IS VACUOUS HERE. Answering `1` (or pressing return)
 * returns `detected` — which is also what the refusal returns — so an arm built
 * on it passes whether the picker ran or was skipped, and it passes on the
 * hanging tree too. An unrecognised answer resolves to `null`, which no skipped
 * picker can produce, so `null` is the only outcome that proves the question was
 * actually put and answered. It also needs no filesystem: `2` and `3` call
 * `resolveClaudeTarget`, which walks the real disk.
 *
 * ── WHY EVERY ROW PINS ALL THREE STREAMS ────────────────────────────────────
 *
 * `canAsk()` reads three properties. Measured under this runner, all three are
 * ambiently `undefined`, which is not a terminal — so a row setting only stdin
 * exercises the refusal branch while believing it exercises the ask, and its
 * verdict moves with whether the developer's own terminal happened to be
 * attached.
 */

const { question, close } = vi.hoisted(() => ({ question: vi.fn(), close: vi.fn() }));

/**
 * `askLine` chains `rl.once("SIGINT", …).once("close", …)` before it asks, so
 * the stand-in has to be chainable; `once` returns the object it lives on, and
 * an inferred self-reference is TS7022, hence the annotation.
 */
interface ReadlineStandIn {
  readonly question: typeof question;
  readonly close: typeof close;
  readonly once: () => ReadlineStandIn;
}

vi.mock("node:readline/promises", () => {
  const rl: ReadlineStandIn = { question, close, once: () => rl };
  return { createInterface: () => rl };
});

const { maybePickLocation } = await import("./update.pick-location");

const PROJECT_ROOT = path.join(path.sep, "work", "detected-project");
const CWD = path.join(path.sep, "work", "detected-project", "packages", "widget");
const HOME = path.join(path.sep, "home", "operator");

/** The auto-detected target, differing from `CWD`, which is what makes the picker run. */
const DETECTED: ClaudeTarget = {
  skillsDir: path.join(PROJECT_ROOT, ".claude", "skills"),
  claudeDir: path.join(PROJECT_ROOT, ".claude"),
  projectRoot: PROJECT_ROOT,
  claudeMdPath: path.join(PROJECT_ROOT, "CLAUDE.md"),
  settingsJsonPath: path.join(PROJECT_ROOT, ".claude", "settings.json"),
  hooksDir: path.join(PROJECT_ROOT, ".claude", "hooks"),
  agentsDir: path.join(PROJECT_ROOT, ".claude", "agents"),
  reason: "detected-git"
};

/** No explicit flag, no --yes/--force: every short-circuit above the gate is off. */
const OPTS: SkillsInstallOpts = {};

const STREAMS = ["stdin", "stdout", "stderr"] as const;
type Stream = (typeof STREAMS)[number];

let realIsTty: Partial<Record<Stream, PropertyDescriptor | undefined>> = {};
let said: string[] = [];
let realStdoutWrite: typeof process.stdout.write;
let realStderrWrite: typeof process.stderr.write;

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

/** The hang: a real keyboard, and no output a person can read. */
function bothOutputsRedirected(): void {
  setStreams(true, false, false);
}

/** What `rl.question` does when the person it is addressed to never saw it. */
const NEVER = (): Promise<string> => new Promise<string>(() => undefined);

const DEADLINE_MS = 2_000;

/**
 * A hang is worse than a red: there is no assertion to read and no failure to
 * name, so an unbounded `await` here takes the whole suite to the runner's
 * timeout. This turns the silence into a named failure.
 */
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

beforeEach(() => {
  question.mockReset();
  close.mockReset();
  said = [];

  realIsTty = {};
  for (const stream of STREAMS) {
    realIsTty[stream] = Object.getOwnPropertyDescriptor(process[stream], "isTTY");
  }

  // The options and the question go to `promptStream()`. Capture both, so an
  // absence is read against a presence rather than against an empty harness.
  realStdoutWrite = process.stdout.write.bind(process.stdout);
  realStderrWrite = process.stderr.write.bind(process.stderr);
  const record = ((text: string | Uint8Array): boolean => {
    said.push(typeof text === "string" ? text : "");
    return true;
  }) as typeof process.stdout.write;
  process.stdout.write = record;
  process.stderr.write = record;
});

afterEach(() => {
  process.stdout.write = realStdoutWrite;
  process.stderr.write = realStderrWrite;
  setJsonMode(false);
  for (const stream of STREAMS) {
    const descriptor = realIsTty[stream];
    if (descriptor === undefined) {
      delete (process[stream] as { isTTY?: boolean }).isTTY;
    } else {
      Object.defineProperty(process[stream], "isTTY", descriptor);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLS. Every assertion below them is "the picker did not run" or "the call
// came back", and a harness that can never reach the picker produces both free.
// ─────────────────────────────────────────────────────────────────────────────

describe("CONTROLS — the picker is reachable, and the deadline can fire", () => {
  it("CONTROL: at a terminal the question IS put, and its answer decides", async () => {
    atATerminal();
    question.mockResolvedValue("9");

    // `null` is the discriminator: it is reachable ONLY through an answered
    // question. A skipped picker returns `detected`, never `null`.
    await expect(
      withinDeadline("maybePickLocation", maybePickLocation(DETECTED, OPTS, CWD, HOME))
    ).resolves.toBeNull();
    expect(question).toHaveBeenCalledTimes(1);
  });

  it("CONTROL: the three candidate paths reach the operator before the question", async () => {
    atATerminal();
    question.mockResolvedValue("9");

    await withinDeadline("maybePickLocation", maybePickLocation(DETECTED, OPTS, CWD, HOME));

    // The PRESENT half that every absence below is read against: this harness
    // demonstrably carries output.
    const transcript = said.join("");
    expect(transcript).toContain(PROJECT_ROOT);
    expect(transcript).toContain(CWD);
    expect(transcript).toContain(path.join(HOME, ".claude"));
  });

  it("CONTROL: the deadline FIRES on a question that never settles", async () => {
    // Without this, a deadline that could never reject would make every bounded
    // arm below green on a tree that hangs. Reachable here precisely because
    // stderr is a terminal, so the ask is legitimate and the silence is the
    // operator's rather than the stream's.
    atATerminal();
    question.mockImplementation(NEVER);

    await expect(
      withinDeadline("maybePickLocation", maybePickLocation(DETECTED, OPTS, CWD, HOME))
    ).rejects.toThrow(/did not settle within 2000ms/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE DEFECT. Each property is its own `it`: a failing assertion throws and
// aborts the rest of its block, so "kept detection" and "never asked" under one
// `it` would be scored on whichever a mutant reaches first — and "never asked"
// is satisfied for free by any run that returns early, which is exactly the arm
// that has to be able to fail on its own.
// ─────────────────────────────────────────────────────────────────────────────

describe("at a terminal with BOTH outputs redirected: keeps detection, never blocks", () => {
  it("RETURNS the detected target instead of blocking on a keystroke", async () => {
    bothOutputsRedirected();
    question.mockImplementation(NEVER);

    await expect(
      withinDeadline("maybePickLocation", maybePickLocation(DETECTED, OPTS, CWD, HOME))
    ).resolves.toBe(DETECTED);
  });

  it("never puts the question at all, because nobody could have read it", async () => {
    bothOutputsRedirected();
    question.mockImplementation(NEVER);

    await withinDeadline("maybePickLocation", maybePickLocation(DETECTED, OPTS, CWD, HOME));

    // Its positive twin is the first CONTROL above, over this same spy, which
    // REQUIRES a call — so "not called" here cannot be satisfied by a mock that
    // is unreachable in this file.
    expect(question).not.toHaveBeenCalled();
  });

  it("writes nothing into the redirected stream — no half-asked dialogue", async () => {
    bothOutputsRedirected();
    question.mockImplementation(NEVER);

    await withinDeadline("maybePickLocation", maybePickLocation(DETECTED, OPTS, CWD, HOME));

    // Printing the options and then not asking would leave three paths and a
    // dangling prompt in the operator's log file with nothing waiting on them.
    // The second CONTROL proves this capture records output when there is any.
    expect(said.join("")).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE GUARD AGAINST NARROWING TOO FAR. The expensive direction of this change
// is over-refusing: a choice a person could have made silently becomes
// "detection stands", and dozens of files go to a root nobody confirmed.
// ─────────────────────────────────────────────────────────────────────────────

describe("ONE output redirected still asks", () => {
  it("stdout redirected, stderr a terminal: asks on stderr", async () => {
    setStreams(true, false, true);
    question.mockResolvedValue("9");

    await expect(
      withinDeadline("maybePickLocation", maybePickLocation(DETECTED, OPTS, CWD, HOME))
    ).resolves.toBeNull();
    expect(question).toHaveBeenCalledTimes(1);
  });

  it("stderr redirected, stdout a terminal: asks on stdout", async () => {
    setStreams(true, true, false);
    question.mockResolvedValue("9");

    // The one combination where `promptStream()` returns stdout, and the one
    // case a stdout-based gate would have refused outright.
    await expect(
      withinDeadline("maybePickLocation", maybePickLocation(DETECTED, OPTS, CWD, HOME))
    ).resolves.toBeNull();
    expect(question).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE ROWS THAT DID NOT MOVE, asserted rather than assumed: tightening a gate
// can flatten its neighbours, and nothing in a green run says which.
// ─────────────────────────────────────────────────────────────────────────────

describe("the short-circuits above the gate are unchanged", () => {
  it("no terminal at all: detection stands and nothing is asked", async () => {
    setStreams(false, false, false);
    question.mockImplementation(NEVER);

    await expect(
      withinDeadline("maybePickLocation", maybePickLocation(DETECTED, OPTS, CWD, HOME))
    ).resolves.toBe(DETECTED);
  });

  it("--json at a terminal: detection stands, so the document stays one document", async () => {
    atATerminal();
    setJsonMode(true);
    question.mockImplementation(NEVER);

    await expect(
      withinDeadline("maybePickLocation", maybePickLocation(DETECTED, OPTS, CWD, HOME))
    ).resolves.toBe(DETECTED);
  });

  it("--yes at a terminal: detection stands", async () => {
    atATerminal();
    question.mockImplementation(NEVER);

    await expect(
      withinDeadline("maybePickLocation", maybePickLocation(DETECTED, { yes: true }, CWD, HOME))
    ).resolves.toBe(DETECTED);
  });

  it("already standing in the detected root: there is nothing to disambiguate", async () => {
    atATerminal();
    question.mockImplementation(NEVER);

    await expect(
      withinDeadline("maybePickLocation", maybePickLocation(DETECTED, OPTS, PROJECT_ROOT, HOME))
    ).resolves.toBe(DETECTED);
  });
});
