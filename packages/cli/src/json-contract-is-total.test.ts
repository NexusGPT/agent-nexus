import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import type { Command } from "commander";
import { beforeAll, describe, expect, it } from "vitest";

import { deriveCommandLeaves } from "./command-universe";
import { describeStdout } from "./commands/json-one-document.scan";
import { CliArgumentError, handleError, installArgumentRefusalReporting } from "./errors";
import { installJsonTerminalContract } from "./json-terminal-contract";
import { isJsonMode, setJsonMode } from "./output";
import { buildRootProgram } from "./root-program";

/**
 * `--json` HOLDS ON EVERY WAY THE PROCESS CAN TERMINATE — the whole tree, driven.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS COVERS THAT THE TWO EXISTING GATES STRUCTURALLY CANNOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `json-one-document.test.ts` drives every LEAF with a synthesized argv and parses
 * stdout. `json-refusal-above-the-hook-chain.test.ts` drives the six refusals that
 * synthesizer removes by construction. Both are about a run that ends in an ACTION
 * or in a REFUSAL. Neither has a case for a run that ends in neither, and there are
 * three of those — measured on `dist/index.js` at 0.26.0, before the fix:
 *
 *   nexus --json --help           14915 bytes of prose, exit 0
 *   nexus --json --version        "0.26.0", exit 0
 *   nexus --json zzznope --help   14915 bytes of ROOT HELP, exit 0  <- a TYPO, exit 0
 *
 * A fourth escaped for a different reason. `deriveCommandLeaves()` selects
 * `children.length === 0`, and `nexus docs` has a `search` child while carrying an
 * action of its own — the ONE command in this tree that is invocable AND a
 * namespace. It is outside the leaf population by construction, so the
 * one-document gate never drove it, and it printed 412 bytes of ANSI prose under
 * `--json`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE POPULATION IS THE TREE AND THE OBLIGATIONS ARE NAMED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 🚨 A COUNT FLOOR IS A GATE WITH A HOLE THE EXACT SHAPE OF THE DEFECT. "at least
 * N must pass" is satisfied by an item LEAVING the population — measured in this
 * repository: 11 cases became 10, all passing, and the case that vanished was the
 * one under investigation. So the floors below are anti-vacuity controls only, and
 * the real obligation is {@link MUST_COVER}: an explicit list of population keys
 * that FAILS BY NAME when one is missing. A rename that drops a case from the walk
 * turns that list red instead of shrinking the gate.
 *
 * 🚨 AND AN EMPTY `.each` TABLE IS SILENTLY DROPPED BY VITEST — zero tests
 * registered, file reported PASSED, exit 0. Every table here goes through
 * {@link eachOrRefuse} for that reason; `@nexus/types/testing/each-or-refuse`
 * carries the measurement.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS GATE DOES NOT COVER, SAID RATHER THAN IMPLIED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  - It drives `--help` on every node, `--version` on the root, the typo shape on
 *    every namespace, and every invocable non-leaf. It does NOT re-drive the 519
 *    leaves' ACTIONS — `json-one-document.test.ts` owns that population and stubs
 *    the network to do it. A leaf action that prints prose is that gate's red,
 *    not this one's.
 *  - It reads STDOUT only. Prose on stderr is correct and expected: the profile
 *    banner, warnings and commander's own error sentence all live there.
 *  - It runs the tree IN PROCESS. `isProcessEntryPoint()` and everything that
 *    only exists in `dist/` are outside it — the probes in the PR body are the
 *    evidence for those, not this file.
 */

const NO_SUCH_COMMAND = "__nexus_no_such_command__";

/** What a driven run is expected to answer. */
type Expectation =
  /** One JSON document, not an error envelope, exit 0. */
  | "document"
  /** One JSON error envelope, exit NON-ZERO. A typo must never read as success. */
  | "error-document";

interface Case {
  /** The population key. Reads like the command line, because that is what it is. */
  readonly name: string;
  readonly argv: readonly string[];
  readonly expect: Expectation;
  /** Which shape of terminal path this is, for the coverage controls. */
  readonly kind: "help" | "version" | "typo" | "invocable-namespace" | "print-contract";
}

/** A command called `process.exit`, which a spec must never actually do. */
class ProcessExitCalled extends Error {
  constructor(readonly code: number) {
    super(`process exit ${code}`);
    this.name = "ProcessExitCalled";
  }
}

interface Run extends Case {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | undefined;
}

function pathOf(chain: readonly Command[]): string[] {
  return chain.map((command) => command.name());
}

/**
 * Every case, from a walk of the REAL tree — root first, hidden commands included.
 *
 * Walked off the built program rather than through `deriveCommandLeaves()`,
 * because that projection keeps only `isLeaf` nodes and this gate is about the
 * namespaces too. The leaf halves of the two walks are cross-checked in the
 * controls, so a disagreement is a red rather than a silent difference of opinion.
 */
function buildCases(): Case[] {
  const root = buildRootProgram();
  const cases: Case[] = [];

  const visit = (command: Command, chain: readonly Command[]): void => {
    const chainHere = [...chain, command];
    const path = pathOf(chainHere);
    const argvPrefix = path.slice(1);
    const label = path.join(" ");

    cases.push({
      name: `${label} --help`,
      argv: [...argvPrefix, "--json", "--help"],
      expect: "document",
      kind: "help"
    });

    const isNamespace = command.commands.length > 0;
    const hasAction =
      typeof (command as Command & { _actionHandler?: unknown })._actionHandler === "function";

    if (isNamespace) {
      // The typo, both spellings. WITHOUT `--help` this was already refused; WITH
      // it, commander runs `_outputHelpIfRequested` (command.js:1567) BEFORE the
      // unknown-command branch (command.js:1609), so the help screen won the race
      // and the run exited 0. Both are in the population so the pair can never
      // again disagree in silence.
      cases.push({
        name: `${label} ${NO_SUCH_COMMAND}`,
        argv: [...argvPrefix, NO_SUCH_COMMAND, "--json"],
        expect: "error-document",
        kind: "typo"
      });
      cases.push({
        name: `${label} ${NO_SUCH_COMMAND} --help`,
        argv: [...argvPrefix, NO_SUCH_COMMAND, "--json", "--help"],
        expect: "error-document",
        kind: "typo"
      });
    }

    // `--print-contract` is a SECOND terminal path with a zero exit, on 177
    // commands, and it is the one no driven gate reached: the flag is in no
    // synthesized argv and the exit is not a refusal. Its listener wrote to
    // `process.stdout` directly — BELOW commander's door — so the construction in
    // `json-terminal-contract.ts` structurally could not cover it.
    if (command.options.some((option) => option.long === "--print-contract")) {
      cases.push({
        name: `${label} --print-contract`,
        argv: [...argvPrefix, "--json", "--print-contract"],
        expect: "document",
        kind: "print-contract"
      });
    }

    if (isNamespace && hasAction) {
      // The population hole `deriveCommandLeaves()` has by construction.
      cases.push({
        name: label,
        argv: [...argvPrefix, "--json"],
        expect: "document",
        kind: "invocable-namespace"
      });
    }

    for (const child of command.commands) visit(child, chainHere);
  };

  visit(root, []);

  cases.push({
    name: "nexus --version",
    argv: ["--json", "--version"],
    expect: "document",
    kind: "version"
  });

  return cases;
}

/**
 * Drive the REAL root program the way the binary does, and capture both streams.
 *
 * `onSuccessfulExit: "throw"` is the switch `installArgumentRefusalReporting`
 * declares for exactly this: in production a `--help` returns from the exit
 * callback and commander calls `process.exit(0)`, which in a worker takes the
 * whole suite with it. The throw carries `exitCode` 0, and that is how a
 * successful terminal exit is told apart from a refusal here — `handleError`
 * would map it to 1 and print an error document over the help.
 *
 * 🚨 NOTHING HERE SETS JSON MODE ITSELF. `--json` rides in argv exactly as a
 * caller types it; whether the process notices is the measurement. A harness that
 * called `setJsonMode(true)` first would be testing a world where this defect
 * cannot exist.
 */
async function drive(argv: readonly string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | undefined;
}> {
  const out: string[] = [];
  const err: string[] = [];
  const realLog = console.log;
  const realError = console.error;
  const realStdoutWrite = process.stdout.write.bind(process.stdout);
  const realStderrWrite = process.stderr.write.bind(process.stderr);

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

  const previousExitCode = process.exitCode;
  process.exitCode = undefined;

  // 🚨 `--print-contract` CALLS `process.exit(0)` ITSELF, AND A REAL ONE HERE
  // TAKES THE WHOLE TEST WORKER WITH IT — which reads as a crashed suite, not as
  // one driven command. Commander's own exits are already neutralised by
  // `onSuccessfulExit: "throw"`; this covers the exits a COMMAND makes, which
  // that switch knows nothing about.
  const realExit = process.exit;
  process.exit = ((code?: number): never => {
    throw new ProcessExitCalled(typeof code === "number" ? code : 0);
  }) as typeof process.exit;

  try {
    const program = buildRootProgram();
    installArgumentRefusalReporting(program, { onSuccessfulExit: "throw" });
    await program.parseAsync(["node", "nexus", ...argv]);
  } catch (error) {
    if (error instanceof ProcessExitCalled) {
      process.exitCode = error.code;
    } else if (error instanceof CliArgumentError && error.exitCode === 0) {
      // `--help` / `--version`: commander's own successful exit, made observable.
      process.exitCode = 0;
    } else {
      process.exitCode = handleError(error);
    }
  } finally {
    process.exit = realExit;
    console.log = realLog;
    console.error = realError;
    process.stdout.write = realStdoutWrite;
    process.stderr.write = realStderrWrite;
    // The run boundary. One `nexus` process runs one command; this file runs
    // hundreds, and a mode left set would make the next case pass without a fix.
    setJsonMode(false);
  }

  const exitCode = process.exitCode;
  process.exitCode = previousExitCode;
  return { stdout: out.join("\n"), stderr: err.join("\n"), exitCode };
}

interface ErrorDocument {
  readonly error?: { readonly message?: unknown; readonly hint?: unknown; readonly code?: unknown };
}

/** The verdict on one run, as a sentence, or `undefined` when it is compliant. */
function violation(run: Run): string | undefined {
  const shape = describeStdout(run.stdout);
  if (shape.documents !== 1 || shape.prose) {
    return (
      `stdout is not ONE JSON document (documents=${shape.documents}, prose=${shape.prose}); ` +
      `first 120 bytes: ${JSON.stringify(run.stdout.slice(0, 120))}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(run.stdout.trim());
  } catch (error) {
    return `stdout did not parse: ${error instanceof Error ? error.message : String(error)}`;
  }

  const asError = parsed as ErrorDocument;
  const isErrorEnvelope = typeof asError === "object" && asError !== null && "error" in asError;

  if (run.expect === "error-document") {
    if (!isErrorEnvelope) {
      return `expected the {"error":…} envelope, got keys [${Object.keys(parsed as object).join(", ")}]`;
    }
    const keys = Object.keys(asError.error ?? {}).sort();
    if (keys.join(",") !== "code,hint,message") {
      return `the error envelope must carry exactly code+hint+message, got [${keys.join(", ")}]`;
    }
    // THE HALF THAT MATTERS MOST. A typo answering exit 0 is a silent wrong
    // answer to any script that branches on the status.
    if (run.exitCode === 0 || run.exitCode === undefined) {
      return `a refusal exited ${String(run.exitCode)} — a typo must never read as success`;
    }
    return undefined;
  }

  if (isErrorEnvelope) {
    return `expected a payload document, got an error envelope: ${run.stdout.slice(0, 160)}`;
  }
  if (run.exitCode !== 0 && run.exitCode !== undefined) {
    return `a successful terminal path exited ${String(run.exitCode)}`;
  }
  return undefined;
}

/**
 * THE NAMED OBLIGATION SET — what this gate MUST be covering, by name.
 *
 * Never a count. Every entry is a population key the walk is required to
 * produce, so a rename, a moved command or a walk that quietly stops descending
 * fails HERE, naming the missing line, instead of shrinking the population and
 * passing. Each of the four defects this gate was built for is named
 * individually, and so is one ordinary member of every shape.
 */
const MUST_COVER: readonly string[] = [
  // The three terminal paths that answered prose at exit 0.
  "nexus --help",
  "nexus --version",
  `nexus ${NO_SUCH_COMMAND} --help`,
  // The typo without --help, so the pair cannot diverge unnoticed.
  `nexus ${NO_SUCH_COMMAND}`,
  // The invocable namespace — the command outside the leaf population entirely.
  "nexus docs",
  "nexus docs --help",
  // A namespace, a leaf, and a typo one level down.
  "nexus agent --help",
  "nexus agent get --help",
  `nexus agent ${NO_SUCH_COMMAND} --help`,
  // The zero-exit path that writes BELOW commander's stdout door.
  "nexus agent list --print-contract",
  "nexus workflow edge create --print-contract",
  // A hidden top-level command: the rendering-based detectors cannot see these,
  // and `upgrade` reinstalls the running binary, so its help is worth pinning.
  "nexus upgrade --help",
  // Three deep leaves across unrelated namespaces, so a walk that stops after
  // depth 2 cannot pass.
  "nexus vibe deploy --help",
  "nexus workflow node-types --help",
  "nexus auth login --help"
];

let runs: Run[] = [];
let byName: Map<string, Run> = new Map();
let derivedLeaves: string[] = [];

beforeAll(async () => {
  // The bare `docs` action reads no network — it prints URLs it composes — but a
  // stub is cheap and makes "this gate never leaves the process" a fact rather
  // than a reading of one command's source.
  globalThis.fetch = (() => {
    throw new Error("the json-contract gate does not reach the network");
  }) as typeof fetch;

  derivedLeaves = await deriveCommandLeaves();

  const cases = buildCases();
  const collected: Run[] = [];
  for (const [index, testCase] of cases.entries()) {
    // 🚨 YIELD A MACROTASK, PERIODICALLY. vitest's worker RPC carries a
    // HARDCODED 60s timeout with no config knob. Every `await` below resolves
    // from already-imported modules, so the loop drains the microtask queue and
    // never yields — and a long enough run starves the poll phase, producing
    // `Unhandled Error: [vitest-worker]: Timeout calling "onTaskUpdate"` with
    // every test reported PASSED and the process exiting 1, on an error naming
    // no test. Measured on a sibling gate three times.
    if (index % 50 === 0) await new Promise((resolve) => setImmediate(resolve));
    const driven = await drive(testCase.argv);
    collected.push({ ...testCase, ...driven });
  }
  runs = collected;
  byName = new Map(runs.map((run) => [run.name, run]));
}, 600_000);

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLS — a gate over nothing must REFUSE, never pass
// ─────────────────────────────────────────────────────────────────────────────

describe("controls", () => {
  it("CONTROL: json mode is off before anything is driven", () => {
    expect(isJsonMode()).toBe(false);
  });

  it("the population is the whole tree, not a fragment of it", () => {
    // 587 nodes today: 501 leaves, 86 namespaces including the root. Removing
    // the eighteen hidden top-level `upgrade` aliases took the tree from 605,
    // and they were childless, so the namespace and `--print-contract` floors
    // below are untouched by that change.
    // Floors, not the obligation — MUST_COVER is the obligation.
    expect(runs.filter((run) => run.kind === "help").length).toBeGreaterThan(570);
    expect(runs.filter((run) => run.kind === "typo").length).toBeGreaterThan(160);
    expect(runs.filter((run) => run.kind === "version").length).toBe(1);
    expect(runs.filter((run) => run.kind === "invocable-namespace").length).toBeGreaterThan(0);
    // 177 commands declare `--print-contract` when this landed.
    expect(runs.filter((run) => run.kind === "print-contract").length).toBeGreaterThan(150);
  });

  it("this gate and command-universe see the SAME leaves", () => {
    // Two walks of one tree. A disagreement means one of them is reading a CLI
    // this package does not ship, and neither could say which.
    // `deriveCommandLeaves()` writes a path WITHOUT the program name; this file
    // keys on the line a caller types, which starts with it. One `replace`, in
    // one direction, rather than two spellings of a path living side by side.
    const helped = new Set(
      runs
        .filter((run) => run.kind === "help")
        .map((run) => run.name.replace(/ --help$/, "").replace(/^nexus ?/, ""))
    );
    const missing = derivedLeaves.filter((leaf) => !helped.has(leaf));
    expect(
      missing,
      `\n\n${missing.length} leaf/leaves the command universe knows about were never driven ` +
        `here. The two walks disagree, and neither can say which tree is the real one.\n\n` +
        `${missing.slice(0, 40).join("\n")}`
    ).toEqual([]);
  });

  it("every driven run produced OUTPUT — a silent tree would pass every parse", () => {
    const silent = runs.filter((run) => run.stdout.trim() === "").map((run) => run.name);
    expect(silent).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE NAMED OBLIGATION — missing by name, never missing by count
// ─────────────────────────────────────────────────────────────────────────────

describe("the obligation set is covered by NAME", () => {
  it("every required population key was actually driven", () => {
    const absent = MUST_COVER.filter((name) => !byName.has(name));
    expect(
      absent,
      `\n\n${absent.length} required case(s) are not in the population.\n` +
        `That is a case LEAVING the gate, which is exactly how a count floor passes ` +
        `over the defect it was built for. Fix the walk, or — if the command was ` +
        `genuinely renamed — rename it here in the same change.\n\n${absent.join("\n")}`
    ).toEqual([]);
  });

  it.each(eachOrRefuse(MUST_COVER, "MUST_COVER, the named obligation set"))(
    "%s honours the --json contract",
    (name) => {
      const run = byName.get(name);
      expect(run, `"${name}" is not in the population — see the case above`).toBeDefined();
      expect(violation(run as Run), `${name}\n  argv: ${(run as Run).argv.join(" ")}`).toBe(
        undefined
      );
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// THE CONTRACT, OVER THE WHOLE POPULATION
// ─────────────────────────────────────────────────────────────────────────────

describe("--json emits one parseable document on every terminal path", () => {
  it("no --help screen escapes the contract", () => {
    const offenders = runs
      .filter((run) => run.kind === "help")
      .map((run) => ({ run, why: violation(run) }))
      .filter((entry) => entry.why !== undefined)
      .map((entry) => `  ${entry.run.name}\n      ${entry.why ?? ""}`);

    expect(
      offenders,
      `\n\n${offenders.length} command(s) answer --json --help with something a caller ` +
        `cannot parse.\n\n${offenders.join("\n\n")}`
    ).toEqual([]);
  });

  it("--version answers a document", () => {
    const run = byName.get("nexus --version");
    expect(run).toBeDefined();
    expect(violation(run as Run)).toBe(undefined);
    expect(JSON.parse((run as Run).stdout.trim())).toEqual({ version: expect.any(String) });
  });

  it("an invocable namespace answers a document — the leaf population misses these", () => {
    const offenders = runs
      .filter((run) => run.kind === "invocable-namespace")
      .map((run) => ({ run, why: violation(run) }))
      .filter((entry) => entry.why !== undefined)
      .map((entry) => `  ${entry.run.name}\n      ${entry.why ?? ""}`);

    expect(offenders, `\n\n${offenders.join("\n\n")}`).toEqual([]);
  });

  it("a TYPO is refused, with a document and a non-zero exit — never a success", () => {
    const offenders = runs
      .filter((run) => run.kind === "typo")
      .map((run) => ({ run, why: violation(run) }))
      .filter((entry) => entry.why !== undefined)
      .map(
        (entry) =>
          `  ${entry.run.name}\n      ${entry.why ?? ""}\n      exit: ${String(entry.run.exitCode)}`
      );

    expect(
      offenders,
      `\n\n${offenders.length} unknown-command invocation(s) do not refuse properly.\n` +
        `An unknown command answering exit 0 is a silent wrong answer to every script ` +
        `that branches on the status.\n\n${offenders.join("\n\n")}`
    ).toEqual([]);
  });

  it("the help document carries the command path it is the help FOR", () => {
    const wrong = runs
      .filter((run) => run.kind === "help")
      .filter((run) => {
        try {
          const parsed = JSON.parse(run.stdout.trim()) as { help?: { command?: unknown } };
          return parsed.help?.command !== run.name.replace(/ --help$/, "");
        } catch {
          return true;
        }
      })
      .map((run) => run.name);

    expect(wrong.slice(0, 20), `${wrong.length} help document(s) name the wrong command`).toEqual(
      []
    );
  });

  it("--print-contract answers a document — it writes BELOW commander's stdout door", () => {
    const offenders = runs
      .filter((run) => run.kind === "print-contract")
      .map((run) => ({ run, why: violation(run) }))
      .filter((entry) => entry.why !== undefined)
      .map((entry) => `  ${entry.run.name}\n      ${entry.why ?? ""}`);

    expect(
      offenders,
      `\n\n${offenders.length} command(s) answer --json --print-contract with something a ` +
        `caller cannot parse.\nThis path calls process.stdout.write directly, so the ` +
        `commander-door construction cannot reach it — the branch has to be in the ` +
        `listener.\n\n${offenders.join("\n\n")}`
    ).toEqual([]);
  });

  it("json mode does not leak out of a driven run", () => {
    expect(isJsonMode()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INSTALLING TWICE — the shape that emits a WELL-FORMED EMPTY document
// ─────────────────────────────────────────────────────────────────────────────

describe("installing the terminal contract twice does not empty the help document", () => {
  /**
   * The first version of `json-terminal-contract.ts` held its capture buffer in a
   * closure and rewrapped `outputHelp` on every install, with a docblock claiming
   * a second call was harmless. It was not, and the failure was silent in the
   * worst direction: the inner wrapper's `finally` fired FIRST with an EMPTY
   * buffer, `emitDocument`'s first-wins rule gave that empty document stdout, and
   * the real help was diverted to stderr behind it. Exit 0, one parseable
   * document, `text: ""` — every assertion in this file's main body passes over
   * it, because they all drive a program installed once.
   *
   * A second install is the natural thing to do after registering more commands,
   * which is the whole reason the function claims to be idempotent. So it is
   * tested rather than promised.
   */
  it("emits the REAL help text, not an empty one, after a second install", async () => {
    const program = buildRootProgram();
    installJsonTerminalContract(program);
    installJsonTerminalContract(program);
    installArgumentRefusalReporting(program, { onSuccessfulExit: "throw" });

    const out: string[] = [];
    const realLog = console.log;
    const realWrite = process.stdout.write.bind(process.stdout);
    console.log = (...args: unknown[]): void => void out.push(args.map(String).join(" "));
    process.stdout.write = ((text: string | Uint8Array): boolean => {
      out.push(typeof text === "string" ? text.replace(/\n$/, "") : "");
      return true;
    }) as typeof process.stdout.write;

    try {
      await program.parseAsync(["node", "nexus", "agent", "--json", "--help"]);
    } catch (error) {
      if (!(error instanceof CliArgumentError) || error.exitCode !== 0) throw error;
    } finally {
      console.log = realLog;
      process.stdout.write = realWrite;
      setJsonMode(false);
    }

    const stdout = out.join("\n");
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });

    const document = JSON.parse(stdout.trim()) as { help: { command: string; text: string } };
    expect(document.help.command).toBe("nexus agent");
    // 🚨 THE ASSERTION THAT FAILED ON THE OLD SHAPE. An empty string is a
    // well-formed document and a useless one.
    expect(document.help.text).toContain("Usage: nexus agent");
    expect(document.help.text.length).toBeGreaterThan(500);
  });
});
