import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveCommandPath } from "./command-path";
import { captureHelp } from "./command-universe";
import { applyDeprecationNotices } from "./deprecation-notice";
import { DEPRECATION_HEADING, type DeprecationRecord } from "./deprecations";

/**
 * THE DEPRECATION WARNING, DRIVEN THROUGH THE REAL BINARY.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * A WARNING ON STDOUT WOULD BE THE BREAKING CHANGE IT EXISTS TO PREVENT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `COMPATIBILITY.md` puts this in STABLE, verbatim: "Under `--json` the CLI
 * prints ONE JSON document on stdout and nothing else." A deprecation notice is
 * announced a release AHEAD of a removal precisely so nothing breaks in the
 * meantime — so if the announcement lands on stdout, every script calling that
 * command breaks on the warning, one release EARLY, and the mechanism has done
 * the opposite of its job.
 *
 * Reading the code establishes that `printWarning` writes to `process.stderr`.
 * It does not establish that the notice reaches the terminal at all, that it
 * reaches it before the command's own output, or that nothing else on the path
 * copies it to stdout. So this drives the REAL root program — every registrar,
 * every hook, the `--json` terminal contract, the argument-refusal reporting —
 * with a synthetic record attached, and reads the two streams apart.
 *
 * ── WHY A SYNTHETIC RECORD AND NOT THE DECLARED ONES ────────────────────────
 *
 * 🚨 `DEPRECATIONS` IS EMPTY, AND IT WILL BE EMPTY AGAIN AFTER EVERY CYCLE
 * COMPLETES. A suite that drove the declared list would assert nothing today,
 * pass, and go on passing — the same vacuity `eachOrRefuse` refuses one import
 * away. `applyDeprecationNotices` takes its records as a parameter for this
 * reason and for no other; the binary passes none.
 *
 * ── WHY `agent list` ────────────────────────────────────────────────────────
 *
 * It takes no positional, so commander reaches the action rather than refusing
 * the line — a refused line never runs a `preAction` hook and would measure
 * nothing. With no credential it then fails at `CLI_NOT_AUTHENTICATED` before
 * any request, so the run is offline and deterministic. `fetch` is replaced with
 * a throw anyway, so a regression that starts making a request is a failure here
 * rather than a flake somewhere else.
 */

const SANDBOX = mkdtempSync(path.join(tmpdir(), "nexus-deprecation-"));

const RECORD: DeprecationRecord = {
  // A shape that names nothing real: this file is about the WIRING, and wiring
  // it to a live shape would couple a behavioural test to the manifest's
  // contents. `deprecation-cycle.test.ts` is what checks a record's identity.
  shape: "0000drivenrec",
  path: "agent list",
  announcedIn: "0.26.0",
  removeIn: "0.27.0",
  replacement: "nexus agent search",
  reason: "It cannot page past the first ten thousand rows."
};

interface Run {
  readonly stdout: string;
  readonly stderr: string;
}

/** Everything both runs need, captured once — building the real tree is not cheap. */
let withRecord: Run;
let without: Run;
let helpText: string;
let helpWithoutRecord: string;
let unresolved: readonly string[];

/**
 * Drive one invocation of the REAL program and return the two streams apart.
 *
 * `process.exit` is replaced for the duration: several terminal paths in this
 * binary call it, and one reaching the real implementation kills the vitest
 * worker and reports as a crash naming no test. Same construction as
 * `destructive-confirmation.scan.ts`, for the same reason.
 */
async function drive(argv: readonly string[], records: readonly DeprecationRecord[]): Promise<Run> {
  const { buildRootProgram } = await import("./root-program");
  const { handleError } = await import("./errors");
  const { setJsonMode } = await import("./output");

  const program = buildRootProgram();
  applyDeprecationNotices(program, records);

  const out: string[] = [];
  const err: string[] = [];
  const realOut = process.stdout.write.bind(process.stdout);
  const realErr = process.stderr.write.bind(process.stderr);
  const realLog = console.log;
  const realConsoleError = console.error;
  const realWarn = console.warn;
  const realExit = process.exit;
  const previousExitCode = process.exitCode;

  // 🚨 BOTH DOORS, AND PATCHING ONLY ONE OF THEM FAILS IN THE REASSURING
  // DIRECTION. `emitDocument` writes the JSON document with `console.log`, and
  // vitest INTERCEPTS `console` by default — it routes it to its own reporter
  // rather than through `process.stdout.write`. So a harness that patched only
  // the stream would record an EMPTY stdout, and "stdout carries no deprecation
  // text" would pass over a stream nothing was ever read from. Measured here:
  // the controls below caught exactly that, which is what they are for.
  process.stdout.write = ((chunk: unknown) => {
    out.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => {
    err.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  console.log = (...parts: unknown[]) => out.push(`${parts.join(" ")}\n`);
  console.error = (...parts: unknown[]) => err.push(`${parts.join(" ")}\n`);
  console.warn = (...parts: unknown[]) => err.push(`${parts.join(" ")}\n`);
  process.exit = ((): never => {
    throw new Error("__exit__");
  }) as typeof process.exit;

  try {
    await program.parseAsync(["node", "nexus", ...argv]);
  } catch (error) {
    // The entry point ends with `.catch(err => { process.exitCode = handleError(err) })`.
    // Routing through the same function is what makes the error DOCUMENT land on
    // stdout, which is half of what this file measures.
    if (!(error instanceof Error && error.message === "__exit__")) handleError(error);
  } finally {
    process.stdout.write = realOut;
    process.stderr.write = realErr;
    console.log = realLog;
    console.error = realConsoleError;
    console.warn = realWarn;
    process.exit = realExit;
    process.exitCode = previousExitCode;
    setJsonMode(false);
  }

  return { stdout: out.join(""), stderr: err.join("") };
}

beforeAll(async () => {
  process.env.HOME = SANDBOX;
  process.env.USERPROFILE = SANDBOX;
  delete process.env.NEXUS_API_KEY;
  delete process.env.NEXUS_PROFILE;
  globalThis.fetch = (async () => {
    throw new Error("the network is blocked in the deprecation-notice gate");
  }) as typeof fetch;

  const previousCwd = process.cwd();
  process.chdir(SANDBOX);
  try {
    withRecord = await drive(["--json", "agent", "list"], [RECORD]);
    without = await drive(["--json", "agent", "list"], []);
  } finally {
    process.chdir(previousCwd);
  }

  const { buildRootProgram } = await import("./root-program");

  const helped = buildRootProgram();
  unresolved = applyDeprecationNotices(helped, [
    RECORD,
    { ...RECORD, path: "agent no-such-leaf", shape: "0000tombstone" }
  ]);
  // `captureHelp`, never `helpInformation()`. The latter renders the usage,
  // options and description and NONE of the `addHelpText` blocks — so it returns
  // a screen that looks complete and is missing every decoration this package
  // installs, this notice included. Measured: the first version of this file
  // used it and read the absence as a bug in the wiring.
  const listed = resolveCommandPath(helped, "agent list");
  helpText = listed === undefined ? "" : captureHelp(listed);

  const bare = resolveCommandPath(buildRootProgram(), "agent list");
  helpWithoutRecord = bare === undefined ? "" : captureHelp(bare);
}, 180_000);

afterAll(() => {
  process.chdir(process.cwd());
});

describe("controls — the harness measured a real invocation", () => {
  it("reached the action, so the preAction hook had somewhere to fire", () => {
    // A line commander REFUSES never runs an action and never runs a leaf's
    // preAction hook, so every assertion below would be green over nothing.
    // The authentication refusal proves the action body ran.
    expect(withRecord.stdout).toContain("CLI_NOT_AUTHENTICATED");
  });

  it("put ONE parseable document on stdout", () => {
    expect(() => JSON.parse(withRecord.stdout) as unknown).not.toThrow();
  });

  it("the run WITHOUT a record is otherwise identical", () => {
    // This is what makes every "the notice is present" assertion mean the record
    // put it there, rather than something else on the path printing it anyway.
    expect(without.stdout).toBe(withRecord.stdout);
    expect(without.stderr).not.toContain(DEPRECATION_HEADING);
  });
});

describe("the notice reaches stderr and NEVER stdout", () => {
  const STREAMS: readonly { readonly name: string; readonly read: () => string }[] = [
    { name: "stdout carries no deprecation text", read: () => withRecord.stdout }
  ];

  it.each(eachOrRefuse(STREAMS, "the streams that must stay clean"))("$name", ({ read }) => {
    expect(read()).not.toContain(DEPRECATION_HEADING);
    expect(read()).not.toContain("agent search");
  });

  it("stderr carries the whole sentence — what is going, what replaces it, and when", () => {
    expect(withRecord.stderr).toContain(DEPRECATION_HEADING);
    expect(withRecord.stderr).toContain("`nexus agent list` is going away");
    expect(withRecord.stderr).toContain("It cannot page past the first ten thousand rows.");
    expect(withRecord.stderr).toContain("Use `nexus agent search` instead.");
    expect(withRecord.stderr).toContain("Announced in 0.26.0; removed in 0.27.0 or later.");
  });

  it("leaves stdout byte-identical to the run with no deprecation at all", () => {
    // The strongest form of the promise: a consumer piping this command into
    // `jq` cannot tell, from stdout, that anything was announced.
    expect(withRecord.stdout).toBe(without.stdout);
  });
});

describe("the notice reaches `--help`, which is where COMPATIBILITY.md promises it", () => {
  it("renders on the deprecated command's own screen", () => {
    expect(helpText).toContain(DEPRECATION_HEADING);
    expect(helpText).toContain("`nexus agent list` is going away");
  });

  it("CONTROL — the same screen without a record does not carry it", () => {
    expect(helpWithoutRecord).not.toContain(DEPRECATION_HEADING);
    expect(helpWithoutRecord.length).toBeGreaterThan(100);
  });

  it("lands above the usage line, where a reader meets it first", () => {
    const notice = helpText.indexOf(DEPRECATION_HEADING);
    const usage = helpText.indexOf("Usage:");
    expect(notice).toBeGreaterThanOrEqual(0);
    expect(usage).toBeGreaterThan(notice);
  });
});

describe("a record whose path no longer resolves is reported, never thrown on", () => {
  it("returns the tombstone path and installs nothing for it", () => {
    // The ordinary state of a record whose leaf has gone, until the next
    // baseline capture retires it. Throwing here would make the binary refuse to
    // start over a bookkeeping row.
    expect([...unresolved]).toEqual(["agent no-such-leaf"]);
  });

  it("still installed the one that DID resolve", () => {
    expect(helpText).toContain(DEPRECATION_HEADING);
  });
});
