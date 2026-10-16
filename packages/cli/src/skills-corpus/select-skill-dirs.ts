/**
 * Decide which top-level entries under the upstream `skills/` tree get bundled,
 * and SAY OUT LOUD what the decision left behind.
 *
 * ## The hole this closes
 *
 * `bundle-skills.ts` selected skill directories with
 * `d.name.startsWith("nexus-")` and printed `Found N skill directories`. That
 * line is TRUE about the N it kept and says nothing whatever about what it
 * dropped, so a directory added upstream that does not match the prefix is
 * collected by nothing, installed for nobody, and mentioned in no log, forever.
 *
 * That is exactly what happened. Upstream gained `skills/plain/` between
 * `d28e9180e301d351608b3e2bc87d667a23db39fd` and
 * `bc52b93c42b6d9cda80746e5ef43856984d96c57`. Nothing here noticed, and nothing
 * here COULD: it was found only because a reader predicted a bundled-surface
 * count from the upstream tree, measured one fewer, and chased the difference.
 *
 * The defect is not the skip. A skip can be correct. The defect is that a
 * correct skip and a silent regression were the same output.
 *
 * ## Why this WARNS and does not fail the build
 *
 * `scripts/postinstall.sh` step 4 runs `pnpm run gen:skills` on every install,
 * through `run_step … || exit 1`, and `tryResolveToken()` in `bundle-skills.ts`
 * falls back to `gh auth token` — so on a developer machine with gh-cli authed,
 * `pnpm install` really does execute this code path against the real upstream
 * tree. A hard failure on an undeclared directory would therefore break
 * `pnpm install`, in every worktree at once, caused by a commit in a DIFFERENT
 * repository that nobody here made and nobody here can revert. A gate that
 * breaks a correct tree for somebody else's commit is uninstalled within a day,
 * and then the silence is back with the gate's name still on it.
 *
 * The loud line costs nothing and is read by the one person who can act on it:
 * whoever just ran `gen:skills` in order to bump the pin.
 *
 * ## Why the report is emitted from INSIDE the selector
 *
 * `selectSkillDirs` reports and returns in one call, so there is no way to
 * obtain the bundled list without the report being emitted. Reporting from the
 * caller would leave one deletable line between the classification and the
 * warning — which is the shape the original defect already had.
 *
 * The split into three leaves does NOT reopen that: the classifier and the
 * reporter are both private concerns of `selectSkillDirs`, which is the only
 * function that returns a bundled list.
 */

import { classifySkillsRoot } from "./select-skill-dirs.classify";
import type { SelectionIo, SkillsRootEntry } from "./select-skill-dirs.declarations";
import { formatSkillDirReport } from "./select-skill-dirs.report";

export { classifySkillsRoot } from "./select-skill-dirs.classify";
export {
  BUNDLED_SKILL_PREFIX,
  NON_SKILL_DIRS,
  type SelectionIo,
  SHARED_DIR,
  type SkillDirSelection,
  type SkillsRootEntry
} from "./select-skill-dirs.declarations";
export { formatSkillDirReport } from "./select-skill-dirs.report";

/**
 * Classify, report, and return the directories to bundle.
 *
 * Reporting is not separable from selection on purpose — see this file's
 * header. A caller cannot obtain the list without emitting the report.
 */
export function selectSkillDirs(entries: readonly SkillsRootEntry[], io: SelectionIo): string[] {
  const selection = classifySkillsRoot(entries);
  const report = formatSkillDirReport(selection);
  for (const line of report.log) io.log(line);
  for (const line of report.warn) io.warn(line);
  return selection.bundled;
}
