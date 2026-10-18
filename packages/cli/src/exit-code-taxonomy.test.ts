import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { callsProcessExitWith } from "./exit-code-process-exit-call.testkit";
import { codeOnly, productionSources, renderedHelp, SRC_DIR } from "./exit-code-sources.testkit";
import { EXIT_CATEGORIES, EXIT_CODES } from "./exit-codes";
import { ROOT_EPILOGUE } from "./root-help-epilogue";

/**
 * NO EXIT CODE IS WRITTEN AS A NUMBER, AND EVERY SURFACE THAT STATES ONE IS TRUE.
 *
 * This file holds the two gates `COMPATIBILITY.md` names — the integer-literal
 * scan and the root `--help` table — together with the `130` surfaces and the
 * projection's own spec. The rest of the taxonomy's gates are its siblings:
 *
 *   - `exit-code-declaration.test.ts`       the taxonomy is declared once and is
 *                                           internally sound;
 *   - `exit-code-reachability.test.ts`      every category has a producer, and no
 *                                           exit-producing function returns a bare
 *                                           integer verdict;
 *   - `exit-code-per-command-help.test.ts`  no per-command help names an exit
 *                                           number the taxonomy may refine.
 *
 * The helpers all four read are in `exit-code-sources.testkit.ts`.
 */

/** A `process.exit` call whose argument is an integer literal, not a taxonomy member. */
const EXIT_INTEGER_CALL = /process\.exit\(\s*\d+\s*\)/g;

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
      callsProcessExitWith(readFileSync(file, "utf8"), "interrupted")
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
