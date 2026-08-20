import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { STATUS_VERDICT_LEDGER, STATUS_VERDICT_LEDGER_CEILING } from "./status-verdict.ledger";
import {
  scanCheckVerbEmissions,
  scanVerdictsWithoutExit,
  verdictKey,
  type VerdictWithoutExit
} from "./status-verdict.scan";

/**
 * THE GATE UNDER "A CHECK-SHAPED VERB CAN SAY NO", IN THREE PARTS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * A SCAN THAT REPORTS NOTHING AND A SCAN THAT LOOKS AT NOTHING ARE THE SAME FILE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `status-verdict.scan.ts` finds every command leaf whose NAME promises a
 * verdict, which EMITS one, and which has no exit path governed by it. The
 * population it reports is the whole value of the thing, and an empty report is
 * indistinguishable from a broken walk, a wrong root, or a type checker that
 * resolved no types. So the controls come FIRST, before any assertion about the
 * real tree is allowed to mean anything.
 *
 * ── 1. THE DETECTOR, ON FIXTURES ────────────────────────────────────────────
 *
 * 🚨 THE FIXTURES ARE DRIVEN THROUGH THE REAL SCAN, AND THE NEGATIVE ONES CARRY
 * THE WEIGHT. A scan that reports everything is as useless as one that reports
 * nothing, and both pass a control that only ever feeds them a defect. Each
 * negative below differs from the positive in exactly ONE way, so a green is
 * attributable: the verb, the field, the shape of the exit, or the derivation
 * depth.
 *
 * ⚠️ AND FIXTURES ARE NOT ENOUGH ON THEIR OWN. A fixture suite tests the rule
 * the author imagined; the corpus tests the rule. Part 2 runs against the real
 * `src/`, and part 3 is a control that only the real corpus can satisfy.
 *
 * ── 2. NOTHING NEW ──────────────────────────────────────────────────────────
 *
 * Every site the real tree yields must be a key in `status-verdict.ledger.ts`. A
 * new one is red on the day it is written, named by file, receiver, command and
 * field. The ledger may only shrink: its size is checked against a CEILING, so
 * deleting entries is always legal and adding one is a line in a diff.
 *
 * 🔴 THERE IS NO STALENESS ASSERTION HERE, AND THAT IS NOT AN OMISSION. The
 * ledger's own docblock records why: "every key must still be a finding" is a
 * lower bound on draining data, so it reds the moment somebody fixes a command
 * and vanishes the moment somebody fixes the last one.
 *
 * ── 3. THE CONTROL THAT SURVIVES THE DRAIN ──────────────────────────────────
 *
 * The findings go to zero when this class is cured — that is the goal — so
 * "the scan found something" cannot be the anti-vacuity control. Two things that
 * do NOT go to zero are asserted instead:
 *
 *   · the scan still finds check verbs EMITTING verdicts. A cured leaf still
 *     prints its answer; it simply also exits over it;
 *   · at least one leaf in the real tree is COVERED. That proves the coverage
 *     arm can return true against real code — the arm whose failure mode is to
 *     report the cure — and it gets STRONGER with every command drained.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — THE DETECTOR, ON FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

const FIXTURE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "status-verdict-"));

afterAll(() => {
  fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true });
});

/** A commander-shaped stub, an output surface, an error surface and an SDK. */
const FIXTURE_SUPPORT: Readonly<Record<string, string>> = {
  "commander.ts": `type Action = (...args: never[]) => unknown;
export interface Leaf {
  description(text: string): Leaf;
  action(run: Action): Leaf;
}
export interface Node {
  command(name: string): Leaf;
}
export const program: Node = {
  command: () => ({ description: () => program.command(""), action: () => program.command("") })
};
`,
  "output.ts": `export function printRecord<T extends object>(_data: T, _fields?: unknown): void {}
export function printTable<T extends object>(_rows: readonly T[], _cols?: unknown): void {}
export function printSuccess(_message: string, _payload?: object): void {}
`,
  "errors.ts": `export function reportFailure(_cause: string, _message: string): number {
  return 1;
}
export function handleError(_err: unknown): number {
  return 1;
}
`,
  "api.ts": `export interface TestResult {
  status: string;
  output: string;
}
export interface Agent {
  id: string;
  status: string;
}
export interface Probe {
  outcome: "verified" | "rejected";
}
export function runTest(): TestResult {
  return { status: "success", output: "" };
}
export function getAgent(): Agent {
  return { id: "", status: "DRAFT" };
}
export function probe(): Probe {
  return { outcome: "verified" };
}
export function refusalFor(_p: Probe): string | null {
  return null;
}
`
};

/** Write a fixture package around `body` and scan it in isolation. */
function scanFixture(name: string, body: string): VerdictWithoutExit[] {
  const root = path.join(FIXTURE_ROOT, name);
  fs.mkdirSync(path.join(root, "commands"), { recursive: true });
  for (const [file, content] of Object.entries(FIXTURE_SUPPORT)) {
    fs.writeFileSync(path.join(root, file), content);
  }
  fs.writeFileSync(path.join(root, "commands", "subject.ts"), body);
  return scanVerdictsWithoutExit(root);
}

/** The broken shape, byte-for-byte what `external-tool test` does. */
const BROKEN = `import { program } from "../commander";
import { handleError } from "../errors";
import { printRecord } from "../output";
import { runTest } from "../api";

program
  .command("test")
  .description("Test an external tool operation")
  .action(() => {
    try {
      const result = runTest();
      printRecord(result);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });
`;

describe("the detector finds the defect it was built for", () => {
  it("reports a check verb that prints a verdict and stops", () => {
    const found = scanFixture("broken", BROKEN);

    expect(found).toHaveLength(1);
    expect(found[0].command).toBe("test");
    expect(found[0].field).toBe("status");
    expect(verdictKey(found[0])).toBe("commands/subject.ts program.test status");
  });

  it("stays silent once the verdict governs an exit — the `test-auth` cure", () => {
    // The ONE difference from BROKEN: the printed field decides an exit.
    // Reporting this would make fixing an entry turn the build red, which is how
    // a gate gets deleted rather than obeyed.
    const found = scanFixture(
      "cured-direct",
      `import { program } from "../commander";
import { handleError, reportFailure } from "../errors";
import { printRecord } from "../output";
import { runTest } from "../api";

program
  .command("test")
  .description("Test an external tool operation")
  .action(() => {
    try {
      const result = runTest();
      if (result.status === "success") {
        printRecord(result);
      } else {
        process.exitCode = reportFailure("remote-error", "Test failed");
      }
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });
`
    );

    expect(found).toEqual([]);
  });

  it("stays silent when the exit reads the verdict through TWO derivations", () => {
    // 🔴 THE CASE THE FIRST VERSION OF THIS SCAN GOT WRONG, AND IT GOT IT WRONG
    // ON THE ONLY CURED VERB IN THE PACKAGE. `auth status` exits on `refusal`,
    // which comes from `refusalFor(p)`, which comes from `p` — and the emitted
    // `verified` comes from `p` too. Nothing in that `if` names `verified`, so a
    // scan matching on the FIELD NAME reports the cure as the disease.
    const found = scanFixture(
      "cured-derived",
      `import { program } from "../commander";
import { handleError, reportFailure } from "../errors";
import { printRecord } from "../output";
import { probe, refusalFor } from "../api";

program
  .command("status")
  .description("Verify the resolved profile")
  .action(() => {
    try {
      const p = probe();
      const refusal = refusalFor(p);
      if (refusal) {
        process.exitCode = reportFailure("not-authenticated", refusal);
        return;
      }
      printRecord({ verified: p.outcome === "verified" });
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });
`
    );

    expect(found).toEqual([]);
  });

  it("stays silent for a verb that shows a record rather than judging it", () => {
    // The ONE difference from BROKEN: the leaf is `get`, not `test`. `agent get`
    // prints a `status` of DRAFT | PUBLISHED. Reporting it would put every
    // record-printing command in this package into the ledger, and a ledger
    // nobody can read protects nothing.
    const found = scanFixture(
      "attribute-not-verdict",
      `import { program } from "../commander";
import { handleError } from "../errors";
import { printRecord } from "../output";
import { getAgent } from "../api";

program
  .command("get")
  .description("Get an agent")
  .action(() => {
    try {
      printRecord(getAgent());
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });
`
    );

    expect(found).toEqual([]);
  });

  it("stays silent for a check verb that emits no verdict field", () => {
    // The ONE difference from BROKEN: the payload carries no verdict-shaped
    // field. A check verb that reports a URL is not this class.
    const found = scanFixture(
      "no-verdict-field",
      `import { program } from "../commander";
import { handleError } from "../errors";
import { printRecord } from "../output";

program
  .command("test-payload")
  .description("Get the webhook URLs")
  .action(() => {
    try {
      printRecord({ testWebhookUrl: "https://example.invalid" });
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });
`
    );

    expect(found).toEqual([]);
  });

  it("still reports when the ONLY exit is the catch — every action has one", () => {
    // 🚨 THE ARM THAT DECIDES WHETHER THIS SCAN MEASURES ANYTHING AT ALL.
    // `catch (err) { process.exitCode = handleError(err) }` is an exit path by
    // any syntactic test. It is governed by no condition, so it says nothing
    // about the verdict — and counting it would make EVERY leaf covered and this
    // whole file green over the entire defect class, forever.
    const found = scanFixture(
      "catch-only-with-a-conditional-elsewhere",
      `import { program } from "../commander";
import { handleError, reportFailure } from "../errors";
import { printRecord } from "../output";
import { runTest } from "../api";

program
  .command("test")
  .description("Test an external tool operation")
  .action((flag: string) => {
    try {
      // A conditional exit that judges an ARGUMENT, not the answer. Real
      // commands do exactly this — "external-tool execute" refuses a missing
      // --action — so "the body contains a conditional exit" is not the rule.
      if (!flag) {
        process.exitCode = reportFailure("bad-request", "--flag is required");
        return;
      }
      const result = runTest();
      printRecord(result);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });
`
    );

    expect(found).toHaveLength(1);
    expect(found[0].field).toBe("status");
  });

  it("does NOT count a bare reportFailure(...) — printing is not exiting", () => {
    // 🚨 THE DEFECT ONE LAYER IN, AND THE SCAN BLESSED IT UNTIL REVIEW CAUGHT IT.
    // `reportFailure` PRINTS the error document and RETURNS a code; it never
    // touches `process.exitCode`. So this leaf reads the failing verdict, emits a
    // perfect machine-readable error, and exits 0 — which is this class exactly.
    // The ONE difference from the cured fixture above is the missing assignment.
    const found = scanFixture(
      "prints-but-does-not-exit",
      `import { program } from "../commander";
import { handleError, reportFailure } from "../errors";
import { printRecord } from "../output";
import { runTest } from "../api";

program
  .command("test")
  .description("Test an external tool operation")
  .action(() => {
    try {
      const result = runTest();
      printRecord(result);
      if (result.status !== "success") {
        reportFailure("remote-error", "Test failed");
      }
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });
`
    );

    expect(found).toHaveLength(1);
    expect(found[0].field).toBe("status");
  });

  it("counts a conditional throw as an exit path", () => {
    // The action is inside a try/catch that maps a throw to a non-zero code, so
    // a throw governed by the verdict really does end the process non-zero.
    const found = scanFixture(
      "cured-by-throw",
      `import { program } from "../commander";
import { handleError } from "../errors";
import { printRecord } from "../output";
import { runTest } from "../api";

program
  .command("validate")
  .description("Validate")
  .action(() => {
    try {
      const result = runTest();
      printRecord(result);
      if (result.status !== "success") {
        throw new Error("validation failed");
      }
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });
`
    );

    expect(found).toEqual([]);
  });

  it("reads a verdict out of `console.log(JSON.stringify(...))`", () => {
    // `workspace status` and `execution diagnose` both write their --json
    // document this way, below every printer in the package. A scan keyed on
    // `print*` alone sees neither.
    const found = scanFixture(
      "json-stringify-sink",
      `import { program } from "../commander";
import { handleError } from "../errors";

program
  .command("status")
  .description("Show mounted workspaces")
  .action(() => {
    try {
      const rows = [{ slug: "a", live: "yes" }];
      console.log(JSON.stringify(rows, null, 2));
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });
`
    );

    expect(found).toHaveLength(1);
    expect(found[0].field).toBe("live");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — THE REAL TREE
// ─────────────────────────────────────────────────────────────────────────────

const FINDINGS = scanVerdictsWithoutExit();
const EMISSIONS = scanCheckVerbEmissions();
const LEDGERED = new Set(STATUS_VERDICT_LEDGER.map((entry) => entry.key));

describe("no check-shaped verb starts exiting 0 over its own verdict", () => {
  it("reports nothing that is not in the ledger", () => {
    const unledgered = FINDINGS.filter((finding) => !LEDGERED.has(verdictKey(finding))).map(
      (finding) => `  ${finding.file}:${finding.line}  ${verdictKey(finding)}`
    );

    expect(
      unledgered,
      `\n\n${unledgered.length} check-shaped command(s) print a verdict and exit 0 over it.\n\n` +
        `A verb whose name promises an answer must carry that answer in its EXIT CODE,\n` +
        `or every script that gates on it is gating on nothing. Map the failing arm to\n` +
        `reportFailure(...) — commands/external-tool.ts "test-auth" is the worked\n` +
        `example — and pick the taxonomy code deliberately: a subject that answered\n` +
        `"broken" is a remote-error, not a refusal of the command line.\n\n` +
        `${unledgered.join("\n")}\n`
    ).toEqual([]);
  });

  it("the ledger never grows", () => {
    // An UPPER bound. Draining moves this further under the ceiling and can
    // never red it; adding an entry is a line a reviewer reads.
    expect(
      STATUS_VERDICT_LEDGER.length,
      "STATUS_VERDICT_LEDGER_CEILING is the one edit that lets this class grow. " +
        "Lower it when a namespace drains; raising it needs a reason in the diff."
    ).toBeLessThanOrEqual(STATUS_VERDICT_LEDGER_CEILING);
  });

  it("holds no duplicate key", () => {
    // A duplicate satisfies the subset check while describing one site twice,
    // which makes the ceiling meaningless as a measure of the class.
    const seen = new Set<string>();
    const duplicates = STATUS_VERDICT_LEDGER.map((entry) => entry.key).filter((key) => {
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });

    expect(duplicates).toEqual([]);
  });

  /**
   * THE ROW SWEEP, AS AN OFFENDER ARRAY — NEITHER `eachOrRefuse` NOR
   * `emptyTableIsExpected`, AND NOT A GUARD EITHER.
   *
   * 🚨 `eachOrRefuse` THROWS on an empty table, which is the right default for a
   * DERIVED population where a zero means a selector broke. This table is a debt
   * list that is MEANT to reach zero, so under it the day somebody drains the
   * last entry this file fails at COLLECTION and the subset arm and both
   * anti-vacuity controls stop running with it.
   *
   * ⚠️ AND `emptyTableIsExpected` — which stood here — DOES NOT FIX THAT. It
   * returns the table unchanged and has no reach into the runner: it silences
   * the refusal `each-or-refuse.ts` adds and moves the failure one line down.
   * Measured on vitest 3.2.4 and 4.1.6: an empty `.each` registers no test, and
   * a `describe` left with NONE fails "No test found in suite". This sweep is
   * its `describe`'s only content, which is that case exactly.
   *
   * Collecting offenders into one array and expecting `[]` is green on an empty
   * ledger in every runner, and it prints every bad row at once.
   */
  it("every survivor says what a caller cannot learn from the exit code", () => {
    // A ledger is worth what its reasons say. This cannot judge whether a
    // sentence is TRUE — only a reader can — but it refuses a placeholder.
    const offenders = STATUS_VERDICT_LEDGER.flatMap((entry) => [
      ...(entry.note.length > 80 ? [] : [`${entry.key} — note is ${entry.note.length} characters`]),
      ...(entry.key.split(" ").length === 3 ? [] : [`${entry.key} — not a three-field key`])
    ]);

    expect(offenders).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — THE CONTROLS THAT SURVIVE THE DRAIN
// ─────────────────────────────────────────────────────────────────────────────

describe("controls", () => {
  it("the scan reaches real check verbs that emit a verdict", () => {
    // NOT `FINDINGS.length > 0`. The findings are meant to reach zero, and a
    // control that dies on success takes the gate with it. A CURED leaf is still
    // in this population — it emits its verdict and also exits over it — so a
    // zero here means the walk broke, never that the tree got clean.
    expect(
      EMISSIONS.length,
      "no command leaf in src/ emits a verdict field any more. Either every check " +
        "verb was renamed, or the walk stopped resolving types and every assertion " +
        "above is now passing over an empty set."
    ).toBeGreaterThan(0);
  });

  it("at least one real leaf is COVERED — the coverage arm can say yes", () => {
    // The arm whose failure mode is to report the cure as the disease. It cannot
    // be exercised by the findings, which are by definition the uncovered ones.
    // `external-tool test-auth`, `auth status` and `channel whatsapp-template
    // test-send` are all cured today, and every drained command joins them — so
    // this control only gets stronger.
    const uncovered = new Set(FINDINGS.map(verdictKey));
    const covered = EMISSIONS.filter((key) => !uncovered.has(key));

    expect(
      covered,
      "every check verb that emits a verdict is now reported as uncovered. That is " +
        "either a real regression across the whole package, or the coverage arm " +
        "stopped resolving derivations and is about to report the next cure as a defect."
    ).not.toEqual([]);
  });

  it("every finding is inside the population it was derived from", () => {
    // The two scans share a walk but not a code path. A finding absent from the
    // emissions would mean they have drifted into two opinions about what a
    // verdict is, and the ledger would then be keyed against a set nothing else
    // agrees with.
    const emitted = new Set(EMISSIONS);
    const orphans = FINDINGS.map(verdictKey).filter((key) => !emitted.has(key));

    expect(orphans).toEqual([]);
  });
});
