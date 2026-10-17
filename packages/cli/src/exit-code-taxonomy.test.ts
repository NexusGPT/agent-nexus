import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusTimeoutError
} from "@agent-nexus/sdk";
import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import type { Command } from "commander";
import { describe, expect, it } from "vitest";

import { blankCommentsAndLiterals } from "../../../scripts/_lib/strip-comments.mjs";
import { captureHelp } from "./command-universe";
import { EXIT_INSTALLED_BUT_NOT_RESOLVED, EXIT_VERIFICATION_NOT_YOURS } from "./commands/upgrade";
import { handleError, printNotFound, refuse, reportFailure } from "./errors";
import {
  EXIT_CATEGORIES,
  EXIT_CODES,
  type ExitCategory,
  exitCategoryFor,
  exitCodeTaxonomyViolations
} from "./exit-codes";
import { ROOT_EPILOGUE } from "./root-help-epilogue";
import { buildRootProgram } from "./root-program";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * EVERY EXIT CODE THE CLI CAN PRODUCE IS A MEMBER OF THE DECLARED TAXONOMY.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS IS A NAMED OBLIGATION SET, NEVER A COUNT FLOOR, AND THE DIFFERENCE IS
 *    THE WHOLE GATE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A gate spelled "at least N categories are covered" has a hole exactly the
 * shape of the defect it is meant to catch: rename or delete a category and the
 * item simply LEAVES the population, taking its own case with it. The count
 * drops by one, the floor is lowered by whoever sees the red, and the surviving
 * cases all still pass. Measured on a sibling gate in this package: 11 cases
 * became 10, every one green.
 *
 * So {@link REQUIRED_CATEGORIES} is an explicit list of NAMES, asserted equal to
 * the taxonomy's own key set in BOTH directions. Deleting a category fails here
 * by name. Adding one fails here by name too, which is correct — a new exit
 * category is a change to the CLI's public contract and must be a deliberate
 * edit to this file, not a silent widening.
 *
 * ⚠️ EVERY `it.each` IN THIS FILE GOES THROUGH `eachOrRefuse`. vitest SILENTLY
 * DROPS an `it.each([])` — it registers nothing and exits 0, where jest throws.
 * A table that goes empty is the same false green as the count floor, one layer
 * down; a real file in this package went from 65 passing tests to 11 that way.
 * `eachOrRefuse` throws on an empty table, naming the population that was meant
 * to fill it, so a derived table cannot silently stop testing anything. Cases
 * that are not tables are plain `it()`, never a bare `.each`.
 */
const REQUIRED_CATEGORIES: readonly ExitCategory[] = [
  "success",
  "failed",
  "not-authenticated",
  "permission-denied",
  "not-found",
  "invalid-input",
  "remote-error",
  "connection-failed",
  "timed-out",
  "local-failed",
  "outcome-not-reached",
  "unmeasured",
  "interrupted"
];

/**
 * A source reduced to the code this process actually RUNS.
 *
 * Two things are blanked, and the second one was learned expensively.
 *
 * ⚠️ COMMENTS. Without this the scans read prose as code, and they fail in the
 * expensive direction first: `errors.ts` DISCUSSES commander calling
 * `process.exit(1)` in a docblock, in a file whose whole job is that there are
 * no such calls. Three of the first four hits were sentences. A gate that reds
 * on its own documentation gets its regex loosened by whoever is unblocking a
 * build, and the loosening is what lets a real call through.
 *
 * 🚨 LITERAL TEXT, BECAUSE A `process.exit` INSIDE A STRING OR A TEMPLATE IS NOT
 *    THIS PROCESS'S EXIT — AND "FIXING" ONE SHIPS A ReferenceError.
 *
 * `util/version-check.refresh-script.ts` RETURNS a backtick string that is the
 * complete source of a detached child process, and that child ends with
 * `process.exit(0)`. The scan flagged it, the flag was acted on, and
 * `EXIT_CODES.success` went into a script that imports nothing and runs in
 * another process — a crash in the auto-update path, introduced by the gate
 * meant to prevent defects. Its own spec caught it, which is the only reason it
 * is not in this diff.
 *
 * A number in a string or in a template's text is generated source or prose. It
 * cannot reference this module's imports, so it can never be bound to the
 * taxonomy, so demanding that it be bound is demanding something impossible.
 *
 * A `${…}` interpolation is different: it is an expression this process
 * evaluates, so a call written inside one is read as the code it is. Only the
 * template's TEXT is blanked.
 *
 * Both halves are {@link blankCommentsAndLiterals} from
 * `scripts/_lib/strip-comments.mjs`, the repository's one walk, which tracks
 * comment, string, template and pattern state one character at a time. A
 * pattern pass cannot do this. Deleting from `//` to end of line eats the rest
 * of any string holding one. A backtick pair matched by pattern pairs a backtick
 * QUOTED inside a string with the next one it finds. Inside one string that is
 * harmless, but a string holding an odd number — the markdown fence
 * `docs-page.render.ts` builds as `"```" + language` — leaves one over, which is
 * paired with the next string's, and the real code between the two strings is
 * blanked. A call written there is invisible to every scan below, and
 * `codeOnly reads code, not prose` plants one.
 *
 * Offsets and line breaks are kept, so a line counted on the output is the line
 * in the file.
 */
function codeOnly(source: string): string {
  return blankCommentsAndLiterals(source);
}

/** A `process.exit` call whose argument is an integer literal, not a taxonomy member. */
const EXIT_INTEGER_CALL = /process\.exit\(\s*\d+\s*\)/g;

/** The `.ts` sources of this package, excluding specs and generated bundles. */
function productionSources(): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      if (entry.name.endsWith(".test.ts")) continue;
      // A scanner or a ledger quotes exit literals as DATA about the tree. They
      // are named individually rather than by a `.scan.ts` glob so a new file
      // type cannot join the exemption by being named well.
      if (
        entry.name === "json-one-document.scan.ts" ||
        entry.name === "json-error-document.static-scan.ts"
      ) {
        continue;
      }
      found.push(full);
    }
  };
  walk(SRC_DIR);
  return found;
}

/**
 * Every source that DESCRIBES the taxonomy, as `[name, text]`.
 *
 * The prose about `130` used to sit in one file and now spans the family: the
 * band rule is in `exit-codes.ts`, the `interrupted` category's own paragraph is
 * in `exit-code-categories.ts`. A surface check reading ONE of them would pass
 * over a dead phrase reinstated in any other.
 *
 * It REFUSES rather than returning a short list. A scan with no way to say "I
 * read less than I should have" reports its own gap as a clean result, which is
 * the failure mode this whole file is written against.
 */
function exitCodeSources(): readonly (readonly [string, string])[] {
  const found = productionSources()
    .filter((file) => /(^|[/\\])exit-codes?(-[a-z-]+)?\.ts$/.test(file))
    .map((file) => [relative(SRC_DIR, file), readFileSync(file, "utf8")] as const);
  if (found.length < 6) {
    throw new Error(
      `exitCodeSources() reached ${String(found.length)} files, under the 6 that declare the ` +
        "taxonomy — the walk is not finding the family and its silence is not compliance."
    );
  }
  return found;
}

/**
 * The error-reporting layer: `errors.ts`, its `errors-*.ts` siblings, and the
 * admin tree's own map.
 *
 * RESOLVED FROM THE WALK, never named. `errors.ts` used to hold every body in
 * this layer and is now a re-export index over nine siblings, so a list of file
 * names would have gone stale on the split itself — and a stale list here reads
 * as a clean scan rather than as a missing one.
 *
 * `(^|/)errors(-…)?\.ts` and not a bare `errors`: `git-errors.ts` and
 * `error-next-steps.ts` are different concerns, so the admin tree's map needs a
 * clause of its own — the separator before `errors` there is a dash.
 *
 * 🔴 THAT CLAUSE IS A PATTERN OVER THE FAMILY, NOT A PATH. It used to be
 * `file.endsWith(join("util", "admin-errors.ts"))`, and `admin-errors.ts` then
 * split into `admin-errors.cli-error.ts` (the class) and
 * `admin-errors.handle.ts` (the renderer, which is where the `return` this gate
 * is about actually lives), leaving the named path a twenty-line re-export
 * index. A key naming ONE file survives that split in the worst way: the walk
 * still finds the path, the floor below is still met, and the arm prints a tick
 * over a body it no longer reads. `admin-errors(\.…)?\.ts` follows the split
 * instead, so a further leaf is covered the day it is born.
 *
 * It REFUSES rather than returning a short list, for the same reason
 * {@link exitCodeSources} does: a set that collapsed would make the scan below
 * read as a clean bill of health over nothing at all.
 */
function errorsLayerSources(): readonly string[] {
  const found = productionSources().filter(
    (file) =>
      /(^|[/\\])errors(-[a-z-]+)?\.ts$/.test(file) ||
      /(^|[/\\])admin-errors(\.[a-z-]+)?\.ts$/.test(file)
  );
  if (found.length < 12) {
    throw new Error(
      `errorsLayerSources() reached ${String(found.length)} files, under the 12 the error ` +
        "layer holds — the walk is not finding it and its silence is not compliance."
    );
  }
  return found;
}

describe("codeOnly reads code, not prose", () => {
  // The integer-exit scan below, run on one planted source. Every arm reads the
  // projection THROUGH that scan's own pattern, so an arm cannot pass on a
  // projection the scan would read differently.
  const integerExits = (source: string): string[] =>
    [...codeOnly(source).matchAll(EXIT_INTEGER_CALL)].map(([call]) => call);

  // Prose in this tree usually quotes a call in backticks, so no scan below
  // proves the comment half runs. This does: a comment naming a call without
  // backticks is gone, a string after a pattern literal holding a quote is still
  // read as a string, and the code after it survives on the same line.
  it("removes a comment naming an exit call and keeps the code around it", () => {
    const source = [
      "// commander calls process.exit(1) here",
      "/* and process.exit(2) there */",
      'const quote = /"/;',
      'const url = "https://example.com"; process.exit(EXIT_CODES.failed);'
    ].join("\n");

    expect(integerExits(source)).toEqual([]);
    expect(codeOnly(source)).toMatch(/const url = " +"; process\.exit\(EXIT_CODES\.failed\);/);
  });

  // The hazard a backtick-pair pattern carries. A string holding an ODD number
  // of backticks — the markdown fence `docs-page.render.ts` builds as
  // `"```" + language` — leaves one unpaired, which such a pattern pairs with the
  // next string's, and the code between the two strings is blanked. Several files here already have code in
  // that gap; a call written there would be invisible.
  it("reads a call written between two strings that each hold a markdown fence", () => {
    const source = 'const open = "```"; process.exit(1); const close = "```";';

    expect(integerExits(source)).toEqual(["process.exit(1)"]);
  });

  it("reads a call inside a template's ${…}, and not one in its text", () => {
    const source = ["const script = `process.exit(0)`;", "const t = `${process.exit(1)}`;"].join(
      "\n"
    );

    expect(integerExits(source)).toEqual(["process.exit(1)"]);
  });

  it("does not read a call spelled inside a quoted string", () => {
    const source = "const s = \"process.exit(1)\"; const t = 'process.exit(2)';";

    expect(integerExits(source)).toEqual([]);
  });
});

describe("the exit-code taxonomy is declared once and is internally sound", () => {
  it("declares a non-empty set of categories", () => {
    // The guard against every assertion below being vacuously true.
    expect(EXIT_CATEGORIES.length).toBeGreaterThan(0);
    expect(REQUIRED_CATEGORIES.length).toBeGreaterThan(0);
  });

  it("covers every REQUIRED category by name — a deletion fails here", () => {
    const missing = REQUIRED_CATEGORIES.filter((name) => !(name in EXIT_CODES));
    expect(missing).toEqual([]);
  });

  it("declares no category the obligation set does not name — an addition fails here", () => {
    const unlisted = EXIT_CATEGORIES.filter((name) => !REQUIRED_CATEGORIES.includes(name));
    expect(unlisted).toEqual([]);
  });

  it("has no structural violation — duplicates, out-of-range, or a stolen shell code", () => {
    expect(exitCodeTaxonomyViolations()).toEqual([]);
  });

  it("keeps 0 and 1 where every shell expects them", () => {
    expect(EXIT_CODES.success).toBe(0);
    expect(EXIT_CODES.failed).toBe(1);
  });

  it("reserves 130 for SIGINT and never reassigns it", () => {
    // 128 + 2. Declared so that nothing else in the CLI can claim the number,
    // not because the CLI chose it.
    expect(EXIT_CODES.interrupted).toBe(128 + 2);
    expect(exitCategoryFor(130)).toBe("interrupted");
  });

  it("claims nothing else in the shell's own band", () => {
    const trespassers = EXIT_CATEGORIES.filter(
      (name) => EXIT_CODES[name] >= 126 && name !== "interrupted"
    );
    expect(trespassers).toEqual([]);
  });
});

/**
 * NO SOURCE OUTSIDE `exit-code-table.ts` WRITES AN EXIT CODE AS A NUMBER.
 *
 * The four maps this change replaced were four integer literals in four files.
 * A gate that only checks the taxonomy is self-consistent would have passed on
 * every one of them, because each was internally consistent — they disagreed
 * with EACH OTHER. This is the scan that makes a fifth one impossible to add
 * quietly.
 */
/**
 * EVERY `process.exitCode = 1` THE TAXONOMY HAS NOT REACHED YET, BY FILE.
 *
 * One entry per occurrence, sorted, so the list states the COUNT as well as the
 * set — `commands/auth.ts` three times is three sites, and dropping one of them
 * to a category fails the comparison until this list follows.
 *
 * ⚠️ THIS IS AN EXEMPTION LIST AND IT MUST ONLY EVER SHRINK. Adding a name to
 * it to unblock a build reopens the hole. The remedy for a new red here is to
 * give the site a category from `EXIT_CODES`, not to write its file down.
 */
const EXPECTED_BARE_ONE_SITES: readonly string[] = [
  "commands/apps/deploy/deploy.command.ts",
  "commands/apps/deploy/redeploy-sha.handler.ts",
  "commands/auth/switch.command.ts",
  "commands/auth/switch.here.ts",
  "commands/auth/switch.session.ts",
  "commands/skills/update.command.ts"
];

describe("no exit code is written as a number outside the taxonomy module", () => {
  it("walks a real population of production sources — an empty walk is not compliance", () => {
    // The three cases below all assert an EMPTY offenders list, and a walk that
    // returned nothing produces exactly that. The `EXPECTED_BARE_ONE_SITES`
    // equality catches a TOTAL collapse, and a partial one in any file that list
    // names, but a walk that quietly stopped descending into some OTHER subtree
    // passes every assertion here while having read none of it.
    //
    // A hundred is the structural claim — this scans the CLI's whole source
    // tree, not a corner of it — and it stays true without editing.
    expect(productionSources().length).toBeGreaterThan(100);
  });

  it("finds no integer literal in a process.exit(...) call", () => {
    const offenders: string[] = [];
    for (const file of productionSources()) {
      if (file.endsWith(`${"/"}exit-code-table.ts`)) continue;
      const source = codeOnly(readFileSync(file, "utf8"));
      for (const [line] of source.matchAll(EXIT_INTEGER_CALL)) {
        offenders.push(`${relative(SRC_DIR, file)}: ${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("finds no integer literal assigned to process.exitCode", () => {
    const offenders: string[] = [];
    for (const file of productionSources()) {
      if (file.endsWith(`${"/"}exit-code-table.ts`)) continue;
      const source = codeOnly(readFileSync(file, "utf8"));
      for (const [line] of source.matchAll(/process\.exitCode\s*=\s*\d+\s*;/g)) {
        offenders.push(`${relative(SRC_DIR, file)}: ${line}`);
      }
    }
    // A BARE `process.exitCode = 1` IS STILL EXEMPT, AND THE EXEMPTION IS A
    // NAMED LIST RATHER THAN A COUNT IN A COMMENT.
    //
    // These sites sit inside command actions that print their own message and
    // never reach `handleError`, so each needs a category decided by reading
    // what it failed at — a separate change. The exemption used to be a prose
    // figure ("15 SITES SPELL …") beside a filter that let ANY `= 1` through.
    // The figure was wrong the day it was written, and a wrong count beside a
    // blanket filter is the shape this whole file exists to remove: a number
    // nothing derives, guarding a hole nothing bounds. So no cardinal is written
    // here either — the list below IS the count, and it moves as sites drain.
    //
    // `commands/channel.ts` has drained: `test-send --wait` exited a bare `1` on
    // a failed or undelivered delivery and now exits `outcome-not-reached`, via
    // `commands/channel/template-test-send.exit-category.ts`.
    //
    // Now the hole is enumerated. A NEW `= 1` fails here by file name, and a
    // site that gets its category fails the staleness case below, so the list
    // can only shrink. It is by FILE, not by line: a line number moves under an
    // unrelated edit and would make this a maintenance tax rather than a gate.
    expect(offenders.filter((o) => !o.endsWith("= 1;"))).toEqual([]);

    const bare = offenders
      .filter((o) => o.endsWith("= 1;"))
      .map((o) => o.split(":")[0] ?? "")
      .sort();
    expect(bare).toEqual(EXPECTED_BARE_ONE_SITES);
  });

  it("leaves no bare `return <int>` inside the errors layer or admin-errors.ts", () => {
    // The files that WERE the two maps. A number reappearing in any of them is
    // the taxonomy being forked again.
    const offenders: string[] = [];
    for (const file of errorsLayerSources()) {
      const source = codeOnly(readFileSync(file, "utf8"));
      for (const [line] of source.matchAll(/^\s*return \d+;\s*$/gm)) {
        offenders.push(`${relative(SRC_DIR, file)}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * THE HELP SCREEN AND THE CODE AGREE.
 *
 * The root epilogue said "EVERY failure exits 1" while three other maps in the
 * same binary produced 2, 3, 5, 6 and 130. A published promise nothing checks is
 * how that survived. This checks it.
 *
 * 🔴 THE SUBJECT IS THE COMPOSED `ROOT_EPILOGUE` CONSTANT, not a source file's
 * bytes. That is the string `index.ts` installs on the root, so a section
 * dropped from the composition in `root-help-epilogue.ts` is caught here — where
 * a text scan over whichever file still holds the FAILURE block would read clean
 * over a help screen that no longer prints it.
 */
describe("the root --help exit-code table is true of the code", () => {
  it("read a real epilogue", () => {
    // Anti-vacuity. An empty or section-less string makes both cases below pass
    // by checking nothing, and `indexOf` returning -1 silently slices the WHOLE
    // string rather than the FAILURE block.
    expect(ROOT_EPILOGUE.length).toBeGreaterThan(1000);
    expect(ROOT_EPILOGUE.indexOf("  FAILURE\n")).toBeGreaterThan(-1);
  });

  it("names every non-success category's number", () => {
    const failureSection = ROOT_EPILOGUE.slice(ROOT_EPILOGUE.indexOf("  FAILURE\n"));
    const missing = EXIT_CATEGORIES.filter((name) => name !== "success").filter(
      (name) => !new RegExp(`(^|\\s)${String(EXIT_CODES[name])}\\s`, "m").test(failureSection)
    );
    expect(missing).toEqual([]);
  });

  it("no longer claims every failure exits 1", () => {
    expect(ROOT_EPILOGUE).not.toContain("EVERY failure exits 1");
  });
});

/**
 * A source file CONTAINS a process-level exit for `category`.
 *
 * `success` and `interrupted` are the two categories no function RETURNS — one
 * is the absence of a failure, the other is a signal. Both are produced by a
 * `process.exit(...)` a spec cannot call without ending the run, so the
 * production path is asserted by reading the file that holds it. Returns the
 * declared code when the call is there, and `-1` when it is not, so the case
 * fails with the same shape as every returning producer.
 */
function processLevelExit(file: string, category: ExitCategory): number {
  const source = readFileSync(join(SRC_DIR, file), "utf8");
  return source.includes(`process.exit(EXIT_CODES${categoryAccessor(category)})`)
    ? EXIT_CODES[category]
    : -1;
}

/** `.success` or `["not-found"]` — whichever way the source can spell the key. */
function categoryAccessor(category: ExitCategory): string {
  return /^[a-z][a-zA-Z0-9]*$/.test(category) ? `.${category}` : `["${category}"]`;
}

/**
 * EVERY DECLARED CATEGORY HAS A PRODUCER, AND IT PRODUCES THE DECLARED NUMBER.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS IS THE OTHER DIRECTION, AND WITHOUT IT THE TAXONOMY CAN GROW DEAD
 *    ENTRIES.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The scans above answer "is every code the CLI emits declared?". They cannot
 * answer "is every declared code reachable?" — a category nothing produces is a
 * published promise with no code behind it, which is the same class of defect as
 * the `--help` sentence this change deleted, pointed the other way.
 *
 * `Record<ExitCategory, …>` makes it EXHAUSTIVE AT COMPILE TIME: adding a
 * category without a producer is a type error here, before any test runs. The
 * runtime table below is derived from `EXIT_CATEGORIES`, so it cannot list a
 * category the taxonomy dropped — and `eachOrRefuse` refuses if that derivation
 * ever yields nothing.
 */
const PRODUCERS: Readonly<Record<ExitCategory, () => number>> = {
  success: () => processLevelExit("contract-binding.bind-command.ts", "success"),
  interrupted: () =>
    processLevelExit(join("commands", "apps", "logs", "run-app-logs-follow.ts"), "interrupted"),
  failed: () => handleError(new Error("unexpected")),
  "not-authenticated": () => handleError(new NexusAuthenticationError("nope", "UNAUTHORIZED")),
  "permission-denied": () => handleError(new NexusApiError("FORBIDDEN", "nope", 403)),
  "not-found": () => printNotFound("gone"),
  "invalid-input": () => refuse("--body is required."),
  "remote-error": () => handleError(new NexusApiError("INTERNAL", "boom", 500)),
  "connection-failed": () => handleError(new NexusConnectionError("offline")),
  "timed-out": () => handleError(new NexusTimeoutError(30_000)),
  "local-failed": () => reportFailure("local-failed", "install failed"),
  // Not a call: `runUpgrade` needs a whole injected environment, and
  // `upgrade-environment.test.ts` already drives it end to end. What this
  // asserts is the BINDING — that the command's two named outcomes still point
  // at these two categories and not at a number of their own.
  "outcome-not-reached": () => EXIT_INSTALLED_BUT_NOT_RESOLVED,
  unmeasured: () => EXIT_VERIFICATION_NOT_YOURS
};

describe("every declared exit category is reachable, and produces its own number", () => {
  it.each(
    eachOrRefuse(
      EXIT_CATEGORIES.map((category) => [category, PRODUCERS[category]] as const),
      "every category declared in EXIT_CODES"
    )
  )("%s is produced, and produces its declared code", (category, produce) => {
    const produced = produce();
    expect({ category, produced }).toEqual({ category, produced: EXIT_CODES[category] });
  });
});

/**
 * THE HOLE THIS CLOSES, AND IT WAS A REAL ONE IN THIS FILE'S FIRST VERSION.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE SCANS ABOVE LOOK FOR `process.exit(<int>)` AND `process.exitCode =
 *    <int>`. A FIFTH MAP HID BEHIND A FUNCTION CALL AND PASSED ALL OF THEM.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `apps-watch.ts` spelled its verdict `return kind === "served" ? 0 : 1` inside
 * `reportWatchOutcome`, plus six bare `return 1`s. The call site reads
 * `process.exitCode = runDeploymentWatch(...)` — no integer anywhere near
 * `process.exitCode`, so every scan above was green over a map the taxonomy did
 * not own. It was found by reading, which is exactly the thing a gate is for.
 *
 * So the population is DERIVED, not listed: any identifier called directly in
 * `process.exitCode = <name>(…)` or `process.exit(<name>(…))` is an
 * exit-producing function, and its body may not contain a bare integer verdict.
 *
 * ⚠️ ONE LEVEL IS NOT ENOUGH, AND THIS WAS MEASURED RATHER THAN ARGUED. The
 * direct call is `process.exitCode = runDeploymentWatch(…)`; the literals were
 * one hop further, in `reportWatchOutcome`, which `runDeploymentWatch` RETURNS.
 * A one-level population passed the exact mutation that reinstates the shipped
 * defect. So the population is CLOSED over `return <name>(…)`: a function whose
 * verdict is another function's verdict inherits the obligation, transitively,
 * to a fixed point.
 *
 * The closure follows RETURN POSITIONS ONLY, which is the whole of what
 * propagates an exit code, and is why this is a few lines rather than a call
 * graph. A function called for its side effects cannot carry a verdict out.
 *
 * ⚠️ A BLANKET "NO BARE INTEGER RETURN" RULE WAS TRIED AND REJECTED. Measured
 * across this package it flags a comparator's `return 0`, a page-size
 * `return 50` and a bit shift's `? 0 : 8` — none of them exit codes. A gate
 * whose reds are mostly wrong is a gate somebody loosens, so it is scoped to
 * functions that provably reach the process's status.
 */
const EXIT_PRODUCER_CALL = /process\.exitCode\s*=\s*(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(/g;
const EXIT_PRODUCER_EXIT = /process\.exit\(\s*(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(/g;

/**
 * Every function whose return value provably becomes this process's status,
 * closed over return-position calls to a fixed point.
 */
function exitProducingFunctions(): readonly string[] {
  const names = new Set<string>();
  for (const file of productionSources()) {
    const source = codeOnly(readFileSync(file, "utf8"));
    for (const [, name] of source.matchAll(EXIT_PRODUCER_CALL)) names.add(name);
    for (const [, name] of source.matchAll(EXIT_PRODUCER_EXIT)) names.add(name);
  }

  // Fixed point. Bounded by the number of functions in the package, so it
  // terminates even on a cycle — a name already in the set is never re-queued.
  for (let grew = true; grew; ) {
    grew = false;
    for (const name of [...names]) {
      const body = bodyOf(name);
      if (body === null) continue;
      for (const [, called] of body.matchAll(/return\s+(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(/g)) {
        if (!names.has(called) && bodyOf(called) !== null) {
          names.add(called);
          grew = true;
        }
      }
    }
  }

  return [...names].sort();
}

/**
 * EVERY body of `function <name>(…) { … }` in the package, brace-matched.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 ALL OF THEM, NOT THE FIRST. RETURNING THE FIRST IS A SILENT COVER.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This returned the first match and stopped. No name in this package resolves
 * to two definitions TODAY, so it was correct and would have gone on being
 * correct right up until it wasn't — and then a second `reportFailure`-shaped
 * helper in another file would have been checked by reading the first one, with
 * nothing to see.
 *
 * The sibling lane on `--json` hit precisely this: its ledger keyed on the FILE,
 * so a second `process.exit` in an already-named file was silently covered, and
 * it had to add a second clause counting sites per file. Same hole, keyed on a
 * name instead of a path. Returning every body closes it, and
 * `resolves to exactly one definition` below makes an ambiguous name a RED
 * rather than a coin flip — a gate that cannot tell which definition is called
 * must say so, not pick.
 */
function bodiesOf(name: string): readonly { file: string; body: string }[] {
  const found: { file: string; body: string }[] = [];
  for (const file of productionSources()) {
    const source = codeOnly(readFileSync(file, "utf8"));
    const pattern = new RegExp(`function ${name}\\s*\\(`, "g");
    for (const match of source.matchAll(pattern)) {
      const open = source.indexOf("{", match.index + match[0].length - 1);
      if (open === -1) continue;
      let depth = 0;
      for (let i = open; i < source.length; i += 1) {
        if (source[i] === "{") depth += 1;
        else if (source[i] === "}") {
          depth -= 1;
          if (depth === 0) {
            found.push({ file: relative(SRC_DIR, file), body: source.slice(open, i + 1) });
            break;
          }
        }
      }
    }
  }
  return found;
}

/** The single body of `name`, or null when it resolves to none. */
function bodyOf(name: string): string | null {
  return bodiesOf(name)[0]?.body ?? null;
}

describe("no exit-producing function returns a bare integer verdict", () => {
  it("derives a non-empty population of exit-producing functions", () => {
    // Without this the two cases below are vacuously green if the regex rots.
    expect(exitProducingFunctions().length).toBeGreaterThan(0);
  });

  it.each(
    eachOrRefuse(
      exitProducingFunctions().map((name) => [name] as const),
      "every function whose return value reaches process.exitCode or process.exit"
    )
  )("%s is resolvable to a definition in this package", (name) => {
    expect({ name, found: bodyOf(name) !== null }).toEqual({ name, found: true });
  });

  it.each(
    eachOrRefuse(
      exitProducingFunctions().map((name) => [name] as const),
      "every function whose return value reaches process.exitCode or process.exit"
    )
  )("%s resolves to exactly one definition — an ambiguous name is a red", (name) => {
    // A gate that cannot tell WHICH definition is called must say so rather
    // than pick one. See the header on `bodiesOf`.
    const where = bodiesOf(name).map((found) => found.file);
    expect({ name, definitions: where.length }).toEqual({ name, definitions: 1 });
  });

  it.each(
    eachOrRefuse(
      exitProducingFunctions().map((name) => [name] as const),
      "every function whose return value reaches process.exitCode or process.exit"
    )
  )("%s returns no bare integer, in EVERY definition of it", (name) => {
    const bare = bodiesOf(name).flatMap(({ file, body }) =>
      [
        ...body.matchAll(/return\s+\d+\s*;/g),
        ...body.matchAll(/return[^;\n]*\?\s*\d+\s*:\s*\d+/g)
      ].map(([hit]) => `${file}: ${hit.trim()}`)
    );
    expect({ name, bare }).toEqual({ name, bare: [] });
  });
});

/**
 * NO COMMAND'S HELP NAMES A SPECIFIC EXIT CODE EXCEPT THE THREE THAT OWN ONE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 "EXITS 1" WAS TRUE OF EVERY FAILURE AND IS NOW TRUE OF ALMOST NONE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The root epilogue's "EVERY failure exits 1" was the loudest copy of that claim
 * and not the only one: a dozen commands told a reader, in their own `--help`,
 * that a particular failure exits `1`. Each was true when written. After the
 * taxonomy a validation refusal exits `5`, a not-found exits `4` and a server
 * failure exits `6`, so every one of those sentences became a promise the binary
 * breaks — the same defect this change set exists to remove, spread across the
 * tree instead of concentrated in one epilogue.
 *
 * THE RULE: only three surfaces may print an exit NUMBER, and each is joined to
 * the code by a case — the root, which owns the table; `admin`, whose table
 * `admin-help-exit-table.test.ts` asserts against `exitCodeForHttpStatus`; and
 * `upgrade`, whose four outcomes are the CLI's only per-command exit contract.
 * The root and `upgrade` cases are above, in this file.
 *
 * Everywhere else a failure is described as NON-ZERO, which stays true however
 * the category is later refined. That is not vagueness — it is the only claim a
 * per-command help screen is in a position to make correctly.
 *
 * Read off the RENDERED help, never the source, because rendered text is what a
 * user acts on and a `.description()` string reaches the screen from anywhere.
 */
const HELP_MAY_NAME_AN_EXIT_CODE: ReadonlySet<string> = new Set(["nexus", "admin", "upgrade"]);

/**
 * `[commandPath, renderedHelp]` for every node in the real commander tree.
 *
 * 🚨 THROUGH `captureHelp`, NEVER `helpInformation()` AND NEVER A LOCAL COPY.
 *
 * The first draft of this walked the tree calling `helpInformation()`, which
 * renders usage, options and subcommands and DOES NOT RUN the `addHelpText`
 * hooks — and every exit-code sentence in this CLI lives in an
 * `addHelpText("after", …)` epilogue. So it walked 500-plus commands, reported
 * two findings, and had never read one line of the text it exists to check.
 *
 * The second draft fixed that by inlining its own `configureOutput` +
 * `outputHelp()` capture. That was correct and was still wrong to write:
 * `captureHelp` in `command-universe.ts` is, in its own words, "the one funnel
 * every derived capture goes through — the docs model, the pages, and the gate
 * that compares them — so none of the three can drift from the others". A
 * fourth capture outside the funnel is a fourth thing to drift, which is the
 * defect this entire change set is about, committed inside its own gate.
 */
function renderedHelp(): readonly (readonly [string, string])[] {
  const out: (readonly [string, string])[] = [];
  const walk = (command: Command, path: readonly string[]): void => {
    out.push([path.length === 0 ? "nexus" : path.join(" "), captureHelp(command)]);
    for (const child of command.commands) walk(child, [...path, child.name()]);
  };
  walk(buildRootProgram("0.0.0-test"), []);
  return out;
}

describe("no per-command help promises an exit code the taxonomy may refine", () => {
  it("renders a real tree — an empty walk must not read as compliance", () => {
    expect(renderedHelp().length).toBeGreaterThan(100);
  });

  it("actually captures the epilogues, where every exit sentence lives", () => {
    // The anti-vacuity control, and it is not decoration: `helpInformation()`
    // renders a complete-looking help screen with every `addHelpText` block
    // MISSING, so a walk over it is green having read none of the prose under
    // test. This asserts the renderer sees a sentence that only exists in the
    // root epilogue.
    const root = renderedHelp().find(([path]) => path === "nexus");
    expect(root?.[1]).toContain("EVERY failure exits NON-ZERO");
  });

  it("names an exit number only on the three surfaces joined to the code", () => {
    // WHAT COUNTS AS NAMING AN EXIT CODE, AND WHY IT IS A WINDOW.
    //
    // Two matchers were tried against the real corpus and rejected, in opposite
    // directions:
    //
    //   `exits N` / `exit code N` ONLY \u2014 went GREEN over "the exit code names
    //   the category \u2014 6 when \u2026, 5 when \u2026" in `mcp call --help`, a line this
    //   very rule forbids, written by the commit that installed the rule. A
    //   matcher keyed to the phrasings its author thought of passes the
    //   counterexample.
    //
    //   ANY non-zero integer on a line mentioning exit \u2014 4 findings, 4 FALSE: a
    //   `100` percent, two `2 minutes` durations and an HTTP `200`. A gate whose
    //   reds are mostly wrong is a gate somebody loosens at the wrong moment,
    //   which is a thing this file argues about its own subject.
    //
    // So: a non-zero integer in the WINDOW AFTER the word "exit". Every false
    // positive above sat BEFORE it, describing something else; a number offered
    // after it is being offered as the code. `0` is exempt throughout \u2014 success
    // is the one category that cannot be refined, so "exits 0" stays true.
    const offenders: string[] = [];
    for (const [path, help] of renderedHelp()) {
      if (HELP_MAY_NAME_AN_EXIT_CODE.has(path.split(" ")[0] ?? "")) continue;
      for (const line of help.split("\n")) {
        const anchor = /\bexit(?:s|ed|ing)?\b/i.exec(line);
        if (anchor === null) continue;
        const after = line.slice(anchor.index, anchor.index + 60);
        // Not an HTTP status, and not a number carrying a unit.
        const named = [
          ...after.matchAll(
            /(?:^|[^\w.-])(?<!HTTP )([1-9]\d*)(?![\w.-])(?!\s*(?:%|m?s\b|min|sec|hour|day|[KMG]B))/g
          )
        ].map((match) => match[1]);
        // `130` IS EXEMPT ON THE SAME GROUND AS `0`, AND FOR THE SAME ONE LINE
        // OF REASONING: the rule exists because a per-command help promising a
        // number goes false when the taxonomy refines that failure into a more
        // specific category. `0` cannot be refined, and neither can `130` —
        // `exitCodeTaxonomyViolations()` pins it to `128 + 2` and refuses any
        // other declared code in the shell's band, so the one command that
        // produces it may say so. Filtered rather than skipped: a line naming
        // `130` AND a refinable number is still a finding.
        const refinable = named.filter((value) => value !== "130");
        if (refinable.length === 0) continue;
        offenders.push(`nexus ${path}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * THE `130` CONTRACT IS STATED, AND STATED THE SAME WAY, ON EVERY SURFACE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 FOUR SHIPPED SENTENCES DESCRIBED THIS NUMBER AND ALL FOUR WERE WRONG IN THE
 *    SAME DIRECTION.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The root table said "SIGINT". `COMPATIBILITY.md` said "reserved rather than
 * chosen". The taxonomy's own docblock said "never chosen as a verdict". And the
 * one command that produces it said "Ctrl-C ends one cleanly and exits 0" and
 * stopped there. Read together they promise a script author two false things:
 * that a Ctrl-C yields `130`, and that nothing but a Ctrl-C can.
 *
 * The truth is narrow and none of them carried it: ONE command produces `130`,
 * on the SECOND signal, of EITHER kind, because one counter serves `SIGINT` and
 * `SIGTERM`. `apps-logs-interrupt.test.ts` drives that behaviour; this
 * checks that the three places a caller READS it agree with it.
 *
 * ⚠️ Asserted as SUBSTRINGS of prose, which is the weakest form of check in this
 * file and is used deliberately: the alternative is generating four sentences
 * from one constant, and prose that reads as generated is prose nobody reads.
 * What each case pins is the CLAIM — the second signal, and either kind — not
 * the wording around it.
 */
const COMPATIBILITY_DOC = join(SRC_DIR, "..", "COMPATIBILITY.md");

describe("every surface that describes 130 describes the same 130", () => {
  it("has exactly ONE producer in the whole package — the claim the prose rests on", () => {
    const producers = productionSources().filter((file) =>
      codeOnly(readFileSync(file, "utf8")).includes("process.exit(EXIT_CODES.interrupted)")
    );
    expect(producers.map((file) => relative(SRC_DIR, file))).toEqual([
      join("commands", "apps", "logs", "run-app-logs-follow.ts")
    ]);
  });

  it("the root --help says which command emits it and that the first Ctrl-C does not", () => {
    const root = renderedHelp().find(([path]) => path === "nexus")?.[1] ?? "";
    expect(root).toContain("apps logs --follow");
    expect(root).toContain("SECOND signal");
  });

  it("the producing command's own --help names the second signal and both kinds", () => {
    const help = renderedHelp().find(([path]) => path === "apps logs")?.[1] ?? "";
    // The anti-vacuity control: the epilogue is where every one of these lives,
    // and `helpInformation()` renders a complete-looking screen without it.
    expect(help).toContain("--follow and --until are mutually exclusive");
    expect(help).toContain("SECOND SIGNAL");
    expect(help).toContain("130");
    expect(help).toContain("SIGTERM");
  });

  it("COMPATIBILITY.md names the producer, the second signal and both kinds", () => {
    const doc = readFileSync(COMPATIBILITY_DOC, "utf8");
    expect(doc).toContain("nexus apps logs --follow");
    expect(doc).toContain("SECOND");
    expect(doc).toContain("SIGTERM");
  });

  it("no surface still calls 130 something the CLI never chooses", () => {
    const dead = [
      "reserved rather than chosen",
      "never chosen as a verdict",
      "interrupted (SIGINT — the shell's number, not ours)"
    ];
    const surfaces: readonly (readonly [string, string])[] = [
      ["COMPATIBILITY.md", readFileSync(COMPATIBILITY_DOC, "utf8")],
      ...exitCodeSources(),
      ["nexus --help", renderedHelp().find(([path]) => path === "nexus")?.[1] ?? ""]
    ];
    const found = surfaces.flatMap(([name, text]) =>
      dead.filter((phrase) => text.includes(phrase)).map((phrase) => `${name}: ${phrase}`)
    );
    expect(found).toEqual([]);
  });
});
