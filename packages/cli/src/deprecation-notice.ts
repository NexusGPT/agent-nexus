import type { Command } from "commander";

import { resolveCommandPath } from "./command-path";
import { deprecationNotice, type DeprecationRecord, DEPRECATIONS } from "./deprecations";
import { printWarning } from "./output";

/**
 * THE HALF OF A DEPRECATION A USER ACTUALLY MEETS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * `COMPATIBILITY.md` PROMISES THE ANNOUNCEMENT LANDS IN `--help`, AND IT HAS TO
 * LAND SOMEWHERE A SCRIPT WILL SEE IT TOO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The document says a removal is "announced one release before it happens, in
 * `--help` and in the changelog". `--help` reaches a person who goes looking.
 * Nothing in that sentence reaches the person who wrote the script two years
 * ago and has not read a changelog since — so this also warns AT THE MOMENT OF
 * INVOCATION, which is the only surface a running script passes through.
 *
 * ── STDERR, AND THE REASON IS NOT TIDINESS ──────────────────────────────────
 *
 * 🚨 THE WARNING GOES TO STDERR ON EVERY PATH, INCLUDING WHEN NOBODY PASSED
 * `--json`. STABLE, verbatim: "Under `--json` the CLI prints ONE JSON document
 * on stdout and nothing else." A deprecation notice on stdout would put a
 * second document — or worse, a bare sentence — in front of `jq`, and the
 * failure mode is that every script calling a deprecated command breaks on the
 * announcement that was supposed to give it a release to prepare. The
 * announcement would then BE the breaking change.
 *
 * It is not conditioned on `isJsonMode()` either. A conditional write is one
 * `if` away from being wrong in the direction that costs the contract, and
 * there is nothing to gain: stderr is where `COMPATIBILITY.md` already puts the
 * profile banner, progress and the update notice.
 *
 * ── WHY A `preAction` HOOK AND NOT A LINE IN EACH COMMAND FILE ──────────────
 *
 * A hook is installed by walking the FINISHED tree, so a deprecation needs no
 * cooperation from the command being deprecated and no edit to its file. The
 * same reason `applyKnownIssuesHelpLine` walks: a hand-maintained population is
 * the defect wearing a fix's clothes.
 *
 * Commander fires `preAction` on the command being run and on its ancestors, so
 * a hook registered on the leaf fires for that leaf and nothing else.
 *
 * ── A RECORD WHOSE PATH NO LONGER RESOLVES IS SKIPPED, NEVER THROWN ON ──────
 *
 * That is the ordinary state of a record whose leaf has already gone: it stays
 * as a tombstone until the next baseline capture retires it. Throwing there
 * would make the binary refuse to start over a bookkeeping row.
 * `deprecation-cycle.ts` is what reports it; this file only has to survive it.
 */

/** Where the warning goes. Injected only so a gate can drive it; the CLI passes nothing. */
export type DeprecationEmitter = (record: DeprecationRecord) => void;

/** The shipped emitter — one line on stderr, through the package's own warning door. */
export const emitToStderr: DeprecationEmitter = (record) => {
  printWarning(deprecationNotice(record));
};

/**
 * Install the `--help` line and the invocation warning for every declared record.
 *
 * Call LAST in `buildRootProgram`, after every registrar, or a command
 * registered afterwards is not in the tree this walks.
 *
 * @returns the paths no command answers to — tombstones, for a caller that cares.
 */
export function applyDeprecationNotices(
  program: Command,
  records: readonly DeprecationRecord[] = DEPRECATIONS,
  emit: DeprecationEmitter = emitToStderr
): readonly string[] {
  const unresolved: string[] = [];

  for (const record of records) {
    const command = resolveCommandPath(program, record.path);
    if (command === undefined) {
      unresolved.push(record.path);
      continue;
    }

    // "before" rather than "after": the announcement is the first thing a reader
    // of this screen needs, and every other help block on this command is about
    // how to use a command that is going away.
    command.addHelpText("before", `${deprecationNotice(record)}\n`);
    command.hook("preAction", () => {
      emit(record);
    });
  }

  return unresolved;
}
