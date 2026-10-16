import type { Command } from "commander";

import { UPGRADE_ALIASES } from "./commands/upgrade";
import { handleError } from "./errors";
import { isJsonMode } from "./output";
import { autoUpdate, checkForUpdate, isAutoUpdateDisabled } from "./util/version-check";

/**
 * PARSE ARGV AND RUN THE COMMAND, THEN SETTLE THE UPDATE QUESTION.
 *
 * Called from `index.ts` behind its entry-point guard, which is the only thing
 * standing between importing that module and launching the CLI. Nothing here
 * imports `index.ts` or `root-program.ts` back, so `version` arrives as an
 * argument rather than as the `VERSION` constant it is read from — a static
 * import of that constant would be a cycle, and `import/no-cycle` is `warn` in
 * `packages/config/eslint/base-flat.js` against a package running
 * `eslint . --max-warnings 9` sitting at 8.
 *
 * 🚨 THE `.catch` BELOW IS NOT A SPARE COPY OF THE PER-LEAF ONE, AND DELETING
 *    EITHER SIDE CHANGES BEHAVIOUR.
 *
 * Almost every command leaf ends its action with the identical arm
 * `catch (err) { process.exitCode = handleError(err); }`, and the `.catch`
 * below is that expression again. No figure is written here — leaves move, and
 * a count in prose reads as checked long after it stopped being. Re-derive it
 * from `packages/cli`, with a CONTROL that must come back LARGER:
 *
 *     /usr/bin/grep -rl 'process.exitCode = handleError(err);' src --include='*.command.ts' | wc -l
 *     /usr/bin/grep -rl 'process.exitCode = handleError(err);' src --include='*.ts' | wc -l
 *
 * That over-counts a little: a handful of leaves special-case one error and
 * then fall THROUGH to the same arm, so they match too.
 *
 * That reads as pure duplication and is not. A leaf that handles its own error
 * RETURNS NORMALLY, so `.then()` runs and the auto-update path below runs with
 * it. A leaf that lets the rejection out reaches this `.catch` instead, and
 * `.then()` is skipped entirely.
 *
 * Measured, one leaf, one mutation, same primed version cache — removing
 * `tracks list`'s own catch left the exit code (7), stdout and the `--json`
 * document byte-identical and DROPPED the `Update available:` notice from
 * stderr. With auto-update on, which is the default, it also drops the
 * install `autoUpdate()` would have performed.
 *
 * So "collapse every leaf catch into this one" is not a de-duplication.
 * It is a decision about whether a command that FAILED should still run the
 * updater, and it is unmade — the current answer is yes, by accident of where
 * the catch sits. A wrapper that catches INSIDE the action preserves today's
 * behaviour; one that removes the boundary from the leaf does not.
 */
export function runCli(program: Command, version: string): Promise<void> {
  return program
    .parseAsync(process.argv)
    .then(async () => {
      if (isJsonMode()) return;

      // Skip auto-update when running `nexus upgrade` (or any alias) — it handles its own update
      const ranCommand = process.argv[2];
      if (ranCommand === "upgrade" || UPGRADE_ALIASES.includes(ranCommand)) return;
      // The credential refresh helper runs unattended under rclone's AWS SDK,
      // which kills it at 60 s: an install or a detached registry fetch does
      // not belong inside that window, and the banner would land in rclone's
      // log.
      if (ranCommand === "workspace" && process.argv[3] === "credential-process") return;

      const opts = program.opts();

      if (opts.autoUpdate && !isAutoUpdateDisabled()) {
        // Default: auto-update when a new version is detected
        const msg = await autoUpdate(version);
        if (msg) {
          const { color } = await import("./output");
          process.stderr.write(color.green(msg));
        }
      } else {
        // --no-auto-update / NEXUS_NO_AUTO_UPDATE / CI: print a notice, install
        // nothing. `checkForUpdate` enforces the environment opt-out itself —
        // under it the notice comes from the cache and no request is made. The
        // condition above is a BRANCH SELECTOR, not the gate; see the docblock
        // on `checkForUpdate` for why the gate had to move into that module.
        const updateMsg = await checkForUpdate(version);
        if (updateMsg) {
          const { color } = await import("./output");
          process.stderr.write(color.yellow(updateMsg));
        }
      }
    })
    .catch((err) => {
      process.exitCode = handleError(err);
    });
}
