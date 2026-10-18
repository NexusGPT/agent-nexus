import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Command } from "commander";

import { blankCommentsAndLiterals } from "../../../scripts/_lib/strip-comments.mjs";
import { captureHelp } from "./command-universe";
import { buildRootProgram } from "./root-program";

/**
 * THE POPULATIONS AND THE PROJECTION EVERY EXIT-CODE GATE READS.
 *
 * Four spec files beside this one judge the taxonomy — `exit-code-taxonomy.test.ts`,
 * `exit-code-declaration.test.ts`, `exit-code-reachability.test.ts` and
 * `exit-code-per-command-help.test.ts` — and they read the package through the
 * helpers below. One copy, so two gates cannot disagree about which files are
 * production code, what counts as code rather than prose, or what a help screen
 * renders.
 *
 * It is test support and still lives in `src/`, because `tsconfig.json` roots at
 * `src/` and compiles every spec there: a spec importing from `test/` is TS6059.
 * No tsup entry bundles it, so `published-inputs.json` lists it `inert` and an
 * edit here obliges no release.
 */

/** The package's `src/` directory — the root every path below is relative to. */
export const SRC_DIR = dirname(fileURLToPath(import.meta.url));

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
 * blanked. A call written there is invisible to every scan that reads through
 * this, and `codeOnly reads code, not prose` in `src/exit-code-taxonomy.test.ts`
 * plants one.
 *
 * Offsets and line breaks are kept, so a line counted on the output is the line
 * in the file.
 */
export function codeOnly(source: string): string {
  return blankCommentsAndLiterals(source);
}

/** The `.ts` sources of this package, excluding specs and generated bundles. */
export function productionSources(): readonly string[] {
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
export function renderedHelp(): readonly (readonly [string, string])[] {
  const out: (readonly [string, string])[] = [];
  const walk = (command: Command, path: readonly string[]): void => {
    out.push([path.length === 0 ? "nexus" : path.join(" "), captureHelp(command)]);
    for (const child of command.commands) walk(child, [...path, child.name()]);
  };
  walk(buildRootProgram("0.0.0-test"), []);
  return out;
}
