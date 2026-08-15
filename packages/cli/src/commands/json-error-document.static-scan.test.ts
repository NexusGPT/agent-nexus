import path from "node:path";

import { describe, expect, it } from "vitest";

import { parse, proseOnlyHelpers, scanSources, scanTree } from "./json-error-document.static-scan";

/**
 * THE STATIC GATE — a non-zero exit must never leave stdout empty under `--json`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS BESIDE `json-one-document.test.ts`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * That gate drives every command and parses stdout, and it is the stronger
 * instrument. Its two ledgers sat at ZERO while NINE call sites still exited
 * non-zero with prose on stderr and nothing on stdout.
 *
 * None of the nine was a hole in that gate's logic. Every one lived in a branch
 * the driver cannot enter: behind a `=== "success"` equality its proxy stub
 * cannot satisfy, behind a hand-rolled required-option guard its argv
 * synthesizer does not fill, or behind the `--yes` it always passes so that a
 * destructive command reaches its printer at all. **A branch an instrument
 * cannot enter is not a branch it found compliant, and a ledger at zero must
 * not be read as one.**
 *
 * So the reach is bought a different way: the defect is a syntactic pairing —
 * prose to stderr, then a non-zero exit, no document between — and an AST walk
 * reads it in a branch nobody can drive exactly as it reads one everybody
 * drives. See `json-error-document.static-scan.ts` for the rule and for its
 * suppressions, each a real design in this tree.
 *
 * ── WHY THIS SITS BESIDE `json-failure-doors.test.ts` RATHER THAN REPLACING IT
 *
 * That file is the HAND-WRITTEN census of the same defect: six named doors,
 * each driven with a real argv, each asserted to put one error document on
 * stdout. It proves something this walk cannot — that the document actually
 * arrives — so both stay.
 *
 * It found six of the nine. The three it does not name are the three this walk
 * found on its own, all in `external-tool`, all with the prose in a HELPER one
 * call away from the exit. Run against the tree with those six doors already
 * closed, this gate reported exactly `external-tool.ts:555`, `:636` and `:680`
 * and nothing else. That is the case for a derived population over a written
 * one, measured rather than argued.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DETECTOR IS PROVEN BEFORE ANYTHING IS MEASURED WITH IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The first `describe` below runs the rule over SYNTHETIC sources, each carrying
 * one real shape verbatim. It must FIRE on the five that are the defect — the
 * block-local pair, that same pair inside the try/catch every action wraps, the
 * `printWarning` form, the helper form, and prose carried across a boolean
 * return — and stay SILENT on the four that are this package's chosen design.
 *
 * Two of those cases exist because the rule got them WRONG first, and both
 * failed in the direction that reads as clean: a branch's THEN arm folding its
 * document into the ELSE arm, and a `catch` clause counted as what FOLLOWS its
 * `try`. The second was found only by mutating the real tree, and it had
 * silenced the entire gate.
 *
 * A gate whose only evidence is its own green result proves nothing — which is
 * the exact criticism that produced this file.
 */

const SRC = path.resolve(__dirname, "..");

// ─────────────────────────────────────────────────────────────────────────────
// THE DETECTOR — proven able to fail, on the real shapes, before it is trusted
// ─────────────────────────────────────────────────────────────────────────────

function scanFixture(text: string): ReturnType<typeof scanSources> {
  return scanSources([{ name: "fixture.ts", source: parse("fixture.ts", text) }]);
}

describe("the detector fires on the defect and stays silent on the design", () => {
  it("catches prose then a non-zero exit in one block", () => {
    // `external-tool test-auth`, verbatim in structure.
    const report = scanFixture(`
      async function action(result: { status: string; error?: string }) {
        if (result.status === "success") {
          printRecord(result);
        } else {
          console.error("Auth test failed:", result.error ?? "Unknown error");
          process.exitCode = 1;
        }
      }
    `);

    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].detail).toContain("console.error");
  });

  it("still catches it inside the try/catch EVERY action in this package wraps", () => {
    // 🚨 THE SHAPE THAT ONCE DISABLED THIS WHOLE GATE. Every command action is
    // `try { … } catch (err) { process.exitCode = handleError(err); }`, and a
    // rule that reads the catch clause as "what follows the try" finds a
    // document after every exit in the package and reports nothing, ever.
    // Proven by mutation before this case existed: restoring the real
    // `console.error` in `external-tool test-auth` left all 16 tests GREEN.
    const report = scanFixture(`
      async function action(result: { status: string; error?: string }) {
        try {
          if (result.status === "success") {
            printRecord(result);
          } else {
            console.error("Auth test failed:", result.error ?? "Unknown error");
            process.exitCode = 1;
          }
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    `);

    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].detail).toContain("console.error");
  });

  it("catches printWarning then a non-zero exit — a warning is not a refusal", () => {
    // `cloud-import google-drive list-files --access-token`, verbatim in structure.
    const report = scanFixture(`
      async function action(opts: { accessToken?: string }) {
        if (opts.accessToken) {
          printWarning("--access-token is no longer accepted.", "Pass --connection-id.");
          process.exitCode = 1;
          return;
        }
      }
    `);

    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].detail).toContain("printWarning");
  });

  it("catches the HELPER form, where the prose is one call away from the exit", () => {
    // `external-tool delete`, verbatim in structure. A rule reading only the
    // exit's own scope sees a function call it knows nothing about.
    const report = scanFixture(`
      function printToolHasAttachmentsError(d: { total: number }) {
        console.error("Cannot delete: " + d.total + " reference(s).");
        console.error("Re-run with --force.");
      }
      async function action(err: unknown) {
        const attachments = extract(err);
        if (attachments) {
          printToolHasAttachmentsError(attachments);
          process.exitCode = 1;
          return;
        }
      }
    `);

    expect(report.proseHelpers).toContain("printToolHasAttachmentsError");
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].detail).toContain("printToolHasAttachmentsError");
  });

  it("catches prose carried across a BOOLEAN return into the caller's exit", () => {
    // `vibe app delete` and its two siblings: the prose is in the confirmation,
    // the exit is at the call site, and a boolean is all that connects them.
    const report = scanFixture(`
      async function confirmDestructive(q: string, rerun: string, yes?: boolean) {
        if (yes === true) return true;
        if (isJsonMode() || !process.stdout.isTTY) {
          console.error("Refusing to proceed without confirmation. Re-run: " + rerun);
          return false;
        }
        return true;
      }
      async function action(appId: string, cmdOpts: { yes?: boolean }) {
        const ok = await confirmDestructive("Delete?", "re-run", cmdOpts.yes);
        if (!ok) {
          process.exitCode = 1;
          return;
        }
      }
    `);

    // One report, at the CALLER: the helper never exits, so its own scope is
    // silent. Classifying the helper is what makes the caller readable at all.
    expect(report.proseHelpers).toContain("confirmDestructive");
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].detail).toContain("confirmDestructive");
  });

  it("is SILENT when the exit code is the emitter's own return value", () => {
    const report = scanFixture(`
      async function action(opts: { connectionId?: string }) {
        if (!opts.connectionId) {
          process.exitCode = refuse("--connection-id is required.", "Find it in the app.");
          return;
        }
      }
    `);

    expect(report.violations).toEqual([]);
    expect(report.exitsThroughEmitter).toBe(1);
  });

  it("is SILENT when a document already claimed stdout — first-wins, on purpose", () => {
    // `auth switch`: the switch DID happen and its document is on stdout; the
    // warning that a higher-precedence selector shadows it goes to stderr, and
    // the non-zero exit halts an `&&` chain. Calling this a violation would be
    // describing a CLI nobody wants.
    const report = scanFixture(`
      async function action(name: string) {
        printSuccess("Switched to " + name + ".");
        const effective = resolveProfile();
        if (effective) {
          warnSwitchIneffective(name, effective);
          process.exitCode = 1;
        }
      }
      function warnSwitchIneffective(to: string, e: { name: string }) {
        printWarning("NEXUS_API_KEY is set — the switch will NOT take effect.");
      }
    `);

    expect(report.violations).toEqual([]);
  });

  it("does not read console.log as stderr prose — the human channel is not the defect", () => {
    const report = scanFixture(`
      async function action() {
        console.log(color.red("Template rejected by Meta."));
        process.exitCode = 1;
      }
    `);

    expect(report.violations).toEqual([]);
  });

  it("does not read a ZERO exit as an exit", () => {
    const report = scanFixture(`
      function action() {
        console.error("done following");
        process.exit(0);
      }
    `);

    expect(report.violations).toEqual([]);
    expect(report.exitSites).toBe(0);
  });

  it("classifies a helper that emits a document as NOT prose-only", () => {
    const source = parse(
      "f.ts",
      `
      function reportToolHasAttachments(d: { total: number }) {
        return reportFailure("remote-error", "Cannot delete: " + d.total + " reference(s).");
      }
      function warnOnly() {
        console.error("just a warning");
      }
    `
    );

    expect([...proseOnlyHelpers([{ source }])]).toEqual(["warnOnly"]);
  });

  it("carries `emits a document` TRANSITIVELY — a wrapper is not prose-only", () => {
    // `runDeploymentWatch`, verbatim in structure: it writes progress to stderr
    // and takes its document from a function in ANOTHER file. Read one level
    // deep it is prose-only, and its two COMPLIANT call sites then read as
    // violations — which is exactly what happened.
    const report = scanFixture(`
      function reportWatchOutcome(outcome: { kind: string }) {
        if (isJsonMode()) {
          console.log(JSON.stringify({ outcome: outcome.kind }, null, 2));
          return outcome.kind === "served" ? 0 : 1;
        }
        return 1;
      }
      async function runDeploymentWatch(appId: string) {
        const outcome = await watchDeployment({}, {}, (status: string) => {
          if (!isJsonMode()) console.error("  … " + status);
        });
        return reportWatchOutcome(outcome);
      }
      async function action(appId: string, watching: boolean) {
        if (watching) {
          process.exitCode = await runDeploymentWatch(appId);
        }
      }
    `);

    expect(report.proseHelpers).not.toContain("runDeploymentWatch");
    expect(report.violations).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE LEDGER — shrink-only, and its ceiling is a deliberate second edit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call sites that still refuse with prose and an empty stdout.
 *
 * ⚠️ DELETING A LINE IS NEVER HOW A RED BUILD IS FIXED. A red says a command
 * moved: fix the command, or — if it was renamed — rename the key. Adding one
 * costs raising {@link STATIC_CEILING} in the same diff, where a reviewer reads
 * it.
 */
const STATIC_LEDGER: Readonly<Record<string, string>> = {};

/** The violation count as measured. Raising it is a visible edit. */
const STATIC_CEILING = 0;

describe("no command exits non-zero with an empty stdout under --json", () => {
  const report = scanTree(SRC);

  it("CONTROL: the walk read the real tree", () => {
    // A parser that silently stopped matching reports zero violations over zero
    // exits, which is byte-for-byte indistinguishable from a clean tree. Floors,
    // so a new command never has to edit this file — only losing coverage does.
    expect(report.filesScanned).toBeGreaterThan(50);
    expect(report.exitSites).toBeGreaterThan(60);
  });

  it("CONTROL: the tree really does route most exits through the funnel", () => {
    // If this collapsed, the emitter set stopped matching and every compliant
    // `process.exitCode = handleError(err)` would start reading as a violation.
    expect(report.exitsThroughEmitter).toBeGreaterThan(50);
  });

  it("CONTROL: the helper pass found prose-only helpers to carry", () => {
    // Zero here means the classification broke, and the helper form — three of
    // the eight sites this gate was built from — goes unread in silence.
    expect(report.proseHelpers.length).toBeGreaterThan(0);
  });

  it("LEDGER 1: no site refuses with an empty stdout without being written down", () => {
    const unledgered = report.violations
      .filter((v) => STATIC_LEDGER[v.where] === undefined)
      .map((v) => `  ${v.where}\n      ${v.detail}`);

    expect(
      unledgered,
      `\n\n${unledgered.length} call site(s) exit non-zero after writing prose to stderr, ` +
        `leaving stdout EMPTY under --json.\nUse "refuse(message, hint)" for an invocation ` +
        `you reject, or "reportFailure(cause, message, hint)" for a failure after it was ` +
        `accepted — never console.error/printWarning + process.exitCode.\n\n` +
        unledgered.join("\n\n")
    ).toEqual([]);
  });

  it("LEDGER 2: an entry whose site now answers properly must be deleted", () => {
    const violating = new Set(report.violations.map((v) => v.where));
    const stale = Object.keys(STATIC_LEDGER)
      .filter((key) => !violating.has(key))
      .sort();

    expect(
      stale,
      `\n\n${stale.length} ledger entr(y/ies) record a defect that no longer reproduces.\n` +
        `Delete the line — a stale exemption is read as "known broken" by everyone who ` +
        `meets it.\n\n${stale.join("\n")}`
    ).toEqual([]);
  });

  it("LEDGER 3: the count is at or below its recorded ceiling", () => {
    expect(report.violations.length).toBeLessThanOrEqual(STATIC_CEILING);
  });
});
