import { confirmOrAbort } from "../../../util/skills-install.confirm-or-abort";
import type { SkillsInstallOpts } from "./skills-install.types";

/**
 * Refuse, before the corpus is fetched, an install that could never be confirmed:
 * no terminal to ask, no `--yes`, no `--force`, and not a `--dry-run`. The same
 * refusal would come after the plan anyway, but by then the corpus has been
 * downloaded, and "I could not ask" has to resolve to "I did not act" with no
 * network in between (destructive-confirmation.driven.test.ts).
 *
 * @returns true when the install was refused and the exit code is set.
 */
export async function refusedBeforeCorpus(opts: SkillsInstallOpts): Promise<boolean> {
  if (opts.dryRun || opts.yes || opts.force || process.stdin.isTTY) return false;
  return !(await confirmOrAbort("Proceed? [Y/n] ", opts));
}
