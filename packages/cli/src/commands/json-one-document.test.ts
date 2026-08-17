import { mkdirSync } from "node:fs";

import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * THE ONE-DOCUMENT GATE — every leaf, driven under `--json`, stdout parsed.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A GATE AND NOT MORE TESTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The root epilogue promises "--json prints ONE JSON document on STDOUT and
 * nothing else", and 7 command paths of 501 asserted it — `json-output.test.ts`
 * and `json-purity.test.ts`, both hand-listed. Ten commands broke the promise
 * while both files were green, because a hand-listed spec is evidence about the
 * commands somebody thought of.
 *
 * 🔴 `phone-number-confirm.test.ts` IS THE WORKED EXAMPLE AND IT IS WORTH
 * READING BEFORE TOUCHING THIS FILE. It drives `phone-number buy` under
 * `--json`, asserts the SDK call and the exit code, is green — and mocks
 * `console.log` to `() => undefined`. It cannot see that the command emitted two
 * documents, because it threw the output away. A spec that discards the thing
 * the contract is about tests everything except the contract.
 *
 * So: the population is DERIVED (`deriveCommandLeaves()`, the same walk the
 * classification gate and the docs generator read), the output is CAPTURED, and
 * `JSON.parse` is the assertion.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE SANDBOX — this gate RUNS 500 REAL COMMANDS, INCLUDING `auth logout --all`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `clearConfig()` deletes `~/.nexus-mcp/config.json`. `auth login` writes it.
 * `auth pin` writes `.nexusrc` into the working directory. None of that may
 * touch the machine running the suite, and mocking `../config` wholesale would
 * also mock the pure helpers half the auth surface is made of.
 *
 * So `HOME` is moved instead, in `vi.hoisted` — BEFORE the imports, because
 * `config.ts` computes `CONFIG_DIR` from `os.homedir()` at module load and a
 * later assignment would be read too late. `os.homedir()` honours `$HOME` on
 * POSIX, so the whole config surface relocates with one variable and every code
 * path stays real.
 *
 * `node:child_process` and `fetch` are stubbed for the same reason and a second
 * one: `upgrade` runs a package manager against the running binary, and `auth
 * login` opens a browser. A command that needs either lands in the unmeasured
 * shadow, which the ledger counts.
 */

const SANDBOX = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/nexus-one-document-gate-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  // A cross-org key: `resolveProfile` answers "override" for it, so the auth
  // surface has an identity to report instead of refusing at its first line.
  process.env.NEXUS_API_KEY = "nxs_p_stubkeyforthegate";
  delete process.env.NEXUS_PROFILE;
  delete process.env.NEXUS_BASE_URL;
  delete process.env.NEXUS_ENV;
  delete process.env.NEXUS_ORGANIZATION_ID;
  return dir;
});

/**
 * The SDK stub: a self-similar, depth-bounded proxy over an ARRAY.
 *
 * An array target is what makes it survive contact with the printers —
 * `Array.isArray` is true, `.map`/`.length` are real, and `JSON.stringify`
 * terminates because the depth is capped. Every unknown property yields another
 * one, so every field is TRUTHY and every `if (data.x)` branch is taken. That is
 * deliberate: the branch behind a truthy field is the branch that prints the
 * SECOND document, so the stub is the worst case for this invariant rather than
 * a plausible one.
 */
const stubValue = vi.hoisted(() => {
  const make = (depth: number): unknown => {
    if (depth >= 3) return "stub";
    const target: unknown[] = [make(depth + 1)];
    return new Proxy(target, {
      get(t, prop, receiver) {
        if (typeof prop === "symbol") return Reflect.get(t, prop, receiver);
        if (Reflect.has(t, prop)) return Reflect.get(t, prop, receiver);
        return make(depth + 1);
      }
    });
  };
  return () => make(0);
});

/**
 * The indirection the two hoisted blocks need.
 *
 * `vi.hoisted` factories run in declaration order before every import, so the
 * client stub cannot close over a value declared after it. A mutable holder,
 * assigned once below, lets each stay a hoisted constant.
 */
const stubValueRef = vi.hoisted(() => ({ make: (): unknown => undefined }));

/**
 * How many requests the stubbed seams were asked to make, since the last reset.
 *
 * The TEST owns the stubs, so the test owns the counter — a scan that stubbed
 * its own seams and then counted them would be measuring itself. It is the only
 * mechanical signal for "did anything leave this process before it failed",
 * which is what separates a bad argument from an outage.
 */
const requests = vi.hoisted(() => ({ count: 0 }));

/** Any `client.<a>.<b>(…)` resolves to a stub value. `then` must stay undefined
 * or `await` on the client itself would recurse forever. */
const stubClient = vi.hoisted(() => {
  const callable = (): unknown =>
    new Proxy(function () {} as unknown as object, {
      get(_t, prop) {
        if (prop === "then") return undefined;
        return callable();
      },
      apply() {
        requests.count += 1;
        return Promise.resolve(stubValueRef.make());
      }
    });
  return callable;
});

stubValueRef.make = stubValue;

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return { ...actual, createClient: () => stubClient() };
});

vi.mock("../util/tenant-http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../util/tenant-http")>();
  return {
    ...actual,
    tenantRequest: async () => {
      requests.count += 1;
      return stubValueRef.make();
    },
    tenantStream: async () => {
      requests.count += 1;
    }
  };
});

vi.mock("../util/admin-http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../util/admin-http")>();
  return {
    ...actual,
    adminRequest: async () => {
      requests.count += 1;
      return stubValueRef.make();
    }
  };
});

vi.mock("node:child_process", () => ({
  exec: () => undefined,
  execSync: () => "",
  execFileSync: () => "",
  spawn: () => {
    throw new Error("spawn is blocked in the one-document gate");
  },
  spawnSync: () => ({ status: 0, stdout: "", stderr: "" })
}));

import { Command } from "commander";

import { deriveCommandLeaves } from "../command-universe";
import {
  CliArgumentError,
  type FailureCause,
  handleError,
  installArgumentRefusalReporting,
  refuse,
  reportFailure
} from "../errors";
import { isJsonMode, setJsonMode } from "../output";
import {
  ERROR_DOCUMENT_LEDGER,
  ERROR_LEDGER_CEILING,
  LEDGER_CEILING,
  MISCODED_CEILING,
  MISCODED_LEDGER,
  ONE_DOCUMENT_LEDGER,
  PAYLOAD_FLOOR,
  UNCHECKED_CEILING
} from "./json-one-document.ledger";
import {
  describeStdout,
  EXEMPT_LEAVES,
  NETWORK_STUB_MESSAGE,
  PAYLOAD_PASSTHROUGH_LEAVES,
  runOneDocumentScan,
  type ScanReport,
  STREAMING_LEAVES
} from "./json-one-document.scan";

let report: ScanReport;
let derived: string[];

beforeAll(async () => {
  mkdirSync(SANDBOX, { recursive: true });
  globalThis.fetch = (async () => {
    requests.count += 1;
    // The message is the SOUND half of the miscode check: when it reaches an
    // error document, the failure IS a network failure because the harness made
    // it one, so the code must say so.
    throw new Error(NETWORK_STUB_MESSAGE);
  }) as typeof fetch;

  const { buildRootProgram } = await import("../root-program");
  derived = await deriveCommandLeaves();

  // 🚨 THE WORKING DIRECTORY MOVES TOO, AND FINDING OUT WHY COST A `git status`.
  //
  // Several commands write relative to `process.cwd()`: `auth pin` drops a
  // `.nexusrc`, and `claude-code install` unpacks a whole `.claude/` tree of
  // skills and hooks. Driven from the package directory, this gate committed
  // that tree into the repository the first time it ran. Every module is already
  // resolved by now — the imports above are done and the dynamic one resolves by
  // URL — so moving the cwd only relocates the commands' own writes.
  const previousCwd = process.cwd();
  process.chdir(SANDBOX);
  try {
    report = await runOneDocumentScan({
      buildProgram: () => buildRootProgram(),
      sandboxDir: SANDBOX,
      requestCount: () => requests.count,
      resetRequests: () => {
        requests.count = 0;
      }
    });
  } finally {
    process.chdir(previousCwd);
  }
}, 900_000);

// ─────────────────────────────────────────────────────────────────────────────
// THE DETECTOR — proven able to fail, before anything is measured with it
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `describeStdout` IS the assertion, so a broken one would pass everything.
 *
 * These are the three shapes the tree actually produced, verbatim in structure:
 * a clean document, two concatenated ones (`printRecord` then `printSuccess`),
 * and a document with a prose trailer (`... then "Next: attach to deployment"`).
 */
describe("the detector separates one document from the two shapes that broke", () => {
  it("one document is one document", () => {
    expect(describeStdout('{\n  "id": "x"\n}')).toEqual({ documents: 1, prose: false });
    expect(describeStdout('[\n  { "id": "x" }\n]')).toEqual({ documents: 1, prose: false });
  });

  it("two concatenated documents are TWO, not one and not unparseable", () => {
    const stdout = '{\n  "id": "x"\n}\n{\n  "success": true\n}';
    expect(describeStdout(stdout)).toEqual({ documents: 2, prose: false });
    // And the thing a caller would actually hit:
    expect(() => JSON.parse(stdout)).toThrow();
  });

  it("a prose trailer after a document is reported as prose, not as a second document", () => {
    expect(describeStdout('{\n  "id": "x"\n}\nNext: attach it to a deployment.')).toEqual({
      documents: 1,
      prose: true
    });
  });

  it("bare prose is prose with no documents", () => {
    expect(describeStdout("No profiles. Run: nexus auth login")).toEqual({
      documents: 0,
      prose: true
    });
  });

  it("a brace inside a STRING does not close a document", () => {
    expect(describeStdout('{ "hint": "use {id} here" }')).toEqual({ documents: 1, prose: false });
    expect(describeStdout('{ "hint": "a quote \\" and a }" }')).toEqual({
      documents: 1,
      prose: false
    });
  });

  it("an unterminated document is prose, never a silent success", () => {
    expect(describeStdout('{ "id": "x"')).toEqual({ documents: 0, prose: true });
  });

  it("nothing is nothing — and the gate must not read that as clean", () => {
    expect(describeStdout("   \n ")).toEqual({ documents: 0, prose: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLS — a broken scan must REFUSE, never pass over nothing
// ─────────────────────────────────────────────────────────────────────────────

describe("controls", () => {
  it("the population is the whole CLI, not a fragment of it", () => {
    expect(report.leafCount).toBeGreaterThan(450);
    expect(report.runs.length).toBeGreaterThan(450);
  });

  it("this gate and command-universe see the SAME command set", () => {
    // Two consumers of one derivation. A disagreement means one of them is
    // reading a tree the CLI does not ship, and neither could say which.
    const scanned = new Set(report.runs.map((run) => run.leaf));
    const missing = derived.filter((leaf) => !scanned.has(leaf) && !EXEMPT_LEAVES.includes(leaf));
    expect(missing).toEqual([]);
  });

  it("the scan REACHED a payload on most of the tree — a green over nothing is not green", () => {
    // 349 when this landed. The floor sits far enough below that only a broken
    // harness crosses it; the ratchet on the shadow is UNMEASURED_CEILING.
    expect(report.counts.clean).toBeGreaterThan(300);
  });

  it("the argv synthesizer actually synthesized arguments", () => {
    // 358 of 502 runs carried a placeholder. A synthesizer that silently stopped
    // producing values would leave every command at commander's own refusal —
    // stdout empty, every run `silent`, and the violation count zero.
    expect(report.runsWithSynthesizedArgs).toBeGreaterThan(250);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE EXEMPTIONS — non-empty, small, and REAL
// ─────────────────────────────────────────────────────────────────────────────

describe("the streaming and passthrough exemptions cannot become a dumping ground", () => {
  it("both lists are non-empty — an empty exemption list means the constant moved", () => {
    expect(STREAMING_LEAVES.length).toBeGreaterThan(0);
    expect(PAYLOAD_PASSTHROUGH_LEAVES.length).toBeGreaterThan(0);
  });

  it("the exemption is SMALL, and growing it is a deliberate edit here", () => {
    // 7, raised from 6 for `mcp serve`. Its stdout IS the MCP stdio transport —
    // newline-delimited JSON-RPC for as long as the host holds the pipe — so
    // there is no last document to wait for and driving it would block on a
    // stdin that never closes. That is the strongest member of the streaming
    // list, not a borderline one.
    //
    // Raising this is the cost the gate charges, and it is the whole mechanism:
    // the lists are written out rather than derived precisely so a new exemption
    // cannot arrive without a second edit a reviewer reads.
    expect(EXEMPT_LEAVES.length).toBeLessThanOrEqual(7);
  });

  it("every exempt leaf is a real command — a stale exemption is a hole", () => {
    const strays = EXEMPT_LEAVES.filter((leaf) => !derived.includes(leaf));
    expect(strays).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE LEDGER — four directions
// ─────────────────────────────────────────────────────────────────────────────

describe("the ledger only ever shrinks", () => {
  it("LEDGER 1: no command violates without being written down", () => {
    const unledgered = report.violations
      .filter((run) => ONE_DOCUMENT_LEDGER[run.key] === undefined)
      .map((run) => `  ${run.key}\n      ${run.detail}\n      argv: ${run.argv.join(" ")}`);

    expect(
      unledgered,
      `\n\n${unledgered.length} command(s) print more than one JSON document under --json ` +
        `and have no ledger entry.\nFix the command. Only if the defect is genuinely being ` +
        `deferred, add the entry AND raise LEDGER_CEILING in the same change.\n\n` +
        unledgered.join("\n\n")
    ).toEqual([]);
  });

  it("LEDGER 2: an entry whose command is now clean must be deleted", () => {
    const violating = new Set(report.violations.map((run) => run.key));
    const stale = Object.keys(ONE_DOCUMENT_LEDGER)
      .filter((key) => !violating.has(key))
      .sort();

    expect(
      stale,
      `\n\n${stale.length} ledger entr(y/ies) record a defect that no longer reproduces.\n` +
        `Delete the line — a stale exemption is read as "known broken" by everyone who ` +
        `meets it.\n\n${stale.join("\n")}`
    ).toEqual([]);
  });

  it("LEDGER 3: an entry naming a command outside the tree is a rename nobody followed", () => {
    const keys = Object.keys(ONE_DOCUMENT_LEDGER).map((key) => key.replace(/ --dry-run$/, ""));
    const gone = keys.filter((leaf) => !derived.includes(leaf)).sort();
    expect(gone).toEqual([]);
  });

  it("LEDGER 4: the violation count is at or below its recorded ceiling", () => {
    expect(report.violations.length).toBeLessThanOrEqual(LEDGER_CEILING);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE SHADOW — what this instrument did NOT check, counted rather than hidden
// ─────────────────────────────────────────────────────────────────────────────

describe("the unchecked shadow is counted, never read as clean", () => {
  it("a run checked by NEITHER clause is unchecked, and that count only falls", () => {
    // `error-path` is deliberately NOT in here. A compliant error document is a
    // measurement of clause 2, not an absence — see the ledger's own note on
    // why the old 153 flattened a passing majority into a failing-looking one.
    const unchecked = report.counts.silent + report.counts.undrivable;

    expect(
      unchecked,
      `\n\n${unchecked} of ${report.runs.length} runs were checked by NEITHER clause ` +
        `(silent=${report.counts.silent}, undrivable=${report.counts.undrivable}); ` +
        `the ceiling is ${UNCHECKED_CEILING}.\n` +
        `A command the scan cannot drive is UNCHECKED, not clean. Either make it drivable ` +
        `— a better placeholder, a stubbed seam — or raise the ceiling deliberately.`
    ).toBeLessThanOrEqual(UNCHECKED_CEILING);
  });

  it("runs that reached a real payload stay above the floor", () => {
    expect(report.counts.clean).toBeGreaterThanOrEqual(PAYLOAD_FLOOR);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLAUSE 2 — a failure is a JSON document on STDOUT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The epilogue's OTHER `--json` promise, and it had no funnel at all until this
 * change. 93 runs of 502 failed with prose on stderr and an empty stdout: a
 * non-zero exit and nothing to parse, which is the one combination a script
 * cannot work around by shape OR by status.
 */
describe("clause 2: under --json, a failure is a document on stdout", () => {
  it("CONTROL: the error path was actually exercised", () => {
    // 154 when this landed. A zero here would mean the scan drove nothing into
    // a failure, and every assertion below would be vacuous.
    expect(report.errorCounts["error-document"]).toBeGreaterThan(80);
  });

  it("CONTROL: commander refusals reached the funnel", () => {
    // 41 when this landed. The refusal class is the half closed by construction;
    // a zero here means the installer stopped being wired into the root program
    // and every one of those commands silently went back to an empty stdout.
    expect(report.commanderRefusals).toBeGreaterThan(30);
  });

  it("ERROR LEDGER 1: no failure hides from the caller without being written down", () => {
    const unledgered = report.errorViolations
      .filter((run) => ERROR_DOCUMENT_LEDGER[run.key] === undefined)
      .map((run) => `  ${run.key}  [${run.errorOutcome}]\n      ${run.errorDetail}`);

    expect(
      unledgered,
      `\n\n${unledgered.length} command(s) fail under --json without putting a document on ` +
        `stdout.\nUse "refuse(message, hint)" from errors.ts — never console.error + ` +
        `process.exitCode.\n\n${unledgered.join("\n\n")}`
    ).toEqual([]);
  });

  it("ERROR LEDGER 2: an entry whose command now answers properly must be deleted", () => {
    const violating = new Set(report.errorViolations.map((run) => run.key));
    const stale = Object.keys(ERROR_DOCUMENT_LEDGER)
      .filter((key) => !violating.has(key))
      .sort();
    expect(stale).toEqual([]);
  });

  it("ERROR LEDGER 3: the count is at or below its recorded ceiling", () => {
    expect(report.errorViolations.length).toBeLessThanOrEqual(ERROR_LEDGER_CEILING);
  });
});

/**
 * Clause 2b — the CODE on the document, not its shape.
 *
 * A document exists so a machine can branch on it. `CLI_INVALID_ARGUMENTS` on a
 * connectivity failure is worse than the prose it replaced, because a caller
 * branching on `code` stops retrying something retryable and blames the user's
 * flags. Four tests, two of them sound and two inferred — see the ledger.
 */
describe("clause 2b: the error document's code says what actually happened", () => {
  it("CONTROL: the scan observed requests actually going out", () => {
    // A zero here means the counters stopped being incremented, and both
    // inferred arms below would silently pass on everything.
    const withRequests = report.runs.filter((run) => run.requestsAttempted > 0);
    expect(withRequests.length).toBeGreaterThan(100);
  });

  it("CONTROL: the scan observed runs where NOTHING left the process", () => {
    const withoutRequests = report.runs.filter((run) => run.requestsAttempted === 0);
    expect(withoutRequests.length).toBeGreaterThan(50);
  });

  it("MISCODE LEDGER 1: no failure is labelled as something it is not", () => {
    const unledgered = report.miscoded
      .filter((run) => MISCODED_LEDGER[run.key] === undefined)
      .map(
        (run) =>
          `  ${run.key}  code=${run.errorCode ?? "(absent)"} requests=${run.requestsAttempted}\n` +
          `      ${run.errorDetail}`
      );

    expect(
      unledgered,
      `\n\n${unledgered.length} command(s) put a document on stdout whose "code" contradicts ` +
        `what happened.\nUse refuse() ONLY for an invocation rejected before anything was sent; ` +
        `everything else goes through reportFailure(cause, …).\n\n${unledgered.join("\n\n")}`
    ).toEqual([]);
  });

  it("MISCODE LEDGER 2: an entry that no longer reproduces must be deleted", () => {
    const observed = new Set(report.miscoded.map((run) => run.key));
    const stale = Object.keys(MISCODED_LEDGER)
      .filter((key) => !observed.has(key))
      .sort();
    expect(stale).toEqual([]);
  });

  it("MISCODE LEDGER 3: the count is at or below its recorded ceiling", () => {
    expect(report.miscoded.length).toBeLessThanOrEqual(MISCODED_CEILING);
  });
});

/**
 * The vocabulary itself. The scan can only see it through 500 commands, and an
 * aggregate cannot say WHICH mapping broke.
 */
describe("the failure vocabulary", () => {
  function codeOf(run: () => void): string {
    const lines: string[] = [];
    const realLog = console.log;
    console.log = (...a: unknown[]): void => void lines.push(a.map(String).join(" "));
    const previous = process.exitCode;
    setJsonMode(true);
    try {
      run();
    } finally {
      console.log = realLog;
      setJsonMode(false);
      process.exitCode = previous;
    }
    return (JSON.parse(lines.join("\n")) as { error: { code: string } }).error.code;
  }

  it("refuse() can ONLY ever mean an argument refusal", () => {
    // It takes no code, so there is no call that produces anything else. This
    // asserts the fact; the TYPE is what makes the mistake unrepresentable.
    expect(codeOf(() => void refuse("bad flag"))).toBe("CLI_INVALID_ARGUMENTS");
    expect(refuse.length).toBe(2); // (message, hint) — and no third parameter
  });

  it("every cause maps to a DISTINCT code, and never to the argument one", () => {
    const causes: FailureCause[] = [
      "not-found",
      "not-authenticated",
      "connection-failed",
      "timed-out",
      "remote-error",
      "local-failed"
    ];
    const codes = causes.map((cause) => codeOf(() => void reportFailure(cause, "x")));

    expect(new Set(codes).size).toBe(causes.length);
    expect(codes).not.toContain("CLI_INVALID_ARGUMENTS");
    // Every one is a CLI_* code — the provenance rule: it never reached the API.
    expect(codes.every((code) => code.startsWith("CLI_"))).toBe(true);
  });
});

/**
 * The refusal funnel itself, unit-tested — because the scan can only observe it
 * through 500 commands, and a gate whose only evidence is an aggregate cannot
 * say WHICH half broke.
 */
describe("the argument-refusal funnel", () => {
  function capture(run: () => void): { stdout: string; exitCode: number | undefined } {
    const lines: string[] = [];
    const realLog = console.log;
    const realErr = console.error;
    console.log = (...a: unknown[]): void => void lines.push(a.map(String).join(" "));
    console.error = (): void => {};
    const previous = process.exitCode;
    process.exitCode = undefined;
    setJsonMode(true);
    try {
      run();
    } finally {
      console.log = realLog;
      console.error = realErr;
      setJsonMode(false);
    }
    const code = process.exitCode;
    process.exitCode = previous;
    return { stdout: lines.join("\n"), exitCode: code };
  }

  function refusingProgram(onSuccessfulExit: "exit" | "throw"): Command {
    const program = new Command();
    program.name("nexus").option("--json", "Output as JSON");
    program
      .command("thing")
      .requiredOption("--needed <value>", "a required option")
      .action(() => {});
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    for (const child of program.commands) {
      child.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    }
    installArgumentRefusalReporting(program, { onSuccessfulExit });
    return program;
  }

  it("a missing required option becomes ONE error document on stdout", () => {
    const program = refusingProgram("throw");
    const run = capture(() => {
      try {
        program.parse(["node", "nexus", "--json", "thing"]);
      } catch (error) {
        process.exitCode = handleError(error);
      }
    });

    expect(describeStdout(run.stdout)).toEqual({ documents: 1, prose: false });
    const doc = JSON.parse(run.stdout) as {
      error: { message: string; hint: string | null; code: string };
    };
    expect(doc.error.code).toBe("CLI_INVALID_ARGUMENTS");
    expect(doc.error.message).toContain("--needed");
    // The message must NOT keep commander's own "error: " prefix — the document
    // has a `code` field for that job.
    expect(doc.error.message.startsWith("error:")).toBe(false);
    // The hint names the exact help to run, which is the whole reason the
    // installer walks the tree carrying a path.
    expect(doc.error.hint).toContain("nexus thing --help");
    expect(run.exitCode).toBe(1);
  });

  it("the error it throws is TYPED, so handleError branches rather than string-matches", () => {
    const program = refusingProgram("throw");
    let caught: unknown;
    try {
      program.parse(["node", "nexus", "thing"]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CliArgumentError);
    expect((caught as CliArgumentError).commandPath).toBe("nexus thing");
    expect((caught as CliArgumentError).commanderCode).toContain("commander.");
  });

  it("a SUCCESSFUL commander exit is untouched — --help must not become an error", () => {
    // exitCode 0 is `--help` and `--version`. In production the callback returns
    // and commander's own `process.exit(0)` runs; the "throw" mode used by this
    // spec is the only way to observe that the two are treated differently.
    const program = refusingProgram("throw");
    let caught: unknown;
    try {
      program.parse(["node", "nexus", "--help"]);
    } catch (error) {
      caught = error;
    }
    expect((caught as CliArgumentError).exitCode).toBe(0);
    // `handleError` still refuses to report a failure as exit 0.
    expect(handleError(caught)).toBe(1);
  });

  it("refuse() emits the same one-document envelope a command's own refusal needs", () => {
    const run = capture(() => {
      process.exitCode = refuse("--body is required.", "Pass --body or --body-file.");
    });

    expect(describeStdout(run.stdout)).toEqual({ documents: 1, prose: false });
    expect(JSON.parse(run.stdout)).toEqual({
      error: {
        message: "--body is required.",
        hint: "Pass --body or --body-file.",
        code: "CLI_INVALID_ARGUMENTS"
      }
    });
    expect(run.exitCode).toBe(1);
  });

  it("refuse() prints prose, not a document, when --json is off", () => {
    expect(isJsonMode()).toBe(false);
    const lines: string[] = [];
    const realErr = console.error;
    console.error = (...a: unknown[]): void => void lines.push(a.map(String).join(" "));
    try {
      expect(refuse("--body is required.")).toBe(1);
    } finally {
      console.error = realErr;
    }
    expect(lines.join("\n")).toContain("--body is required.");
  });
});
