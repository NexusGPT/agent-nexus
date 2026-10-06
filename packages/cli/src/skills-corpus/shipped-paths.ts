/**
 * Which repository paths the skills corpus is built from — the one answer to
 * "can a change here change what an install writes?", shared by the corpus
 * builder and the CLI release pin gate.
 */

/** The two repository-root files an install writes. */
export const CLAUDE_MD = "CLAUDE.md";
export const SETTINGS_JSON = "settings.json";

/** The repository-root directories the corpus collects below. */
export const SKILLS_ROOT = "skills";
export const HOOKS_ROOT = "hooks";
export const AGENTS_ROOT = "agents";

/**
 * Every repository-root name the corpus reads from, and nothing else.
 *
 * `buildCorpusFromFiles` (`build-corpus.ts`) reads ONLY through these constants, and
 * {@link mayShip} is derived from the same two lists. So the question "can a
 * change to this path change what an install writes?" has one answer, kept in
 * one place: the release pin gate (`scripts/skills-drift/publish-pin.ts`) asks it
 * of every upstream file a pin is missing, and a new root added here reaches that
 * gate by construction instead of by somebody remembering to copy it.
 */
export const BUNDLED_ROOT_FILES: readonly string[] = [CLAUDE_MD, SETTINGS_JSON];
export const BUNDLED_ROOT_DIRS: readonly string[] = [SKILLS_ROOT, HOOKS_ROOT, AGENTS_ROOT];

/**
 * Editor and OS cruft the bundle has never shipped: any dot-named segment,
 * `__pycache__`, and compiled `.pyc`. Judged on the path BELOW a collected root,
 * which is where `bundle-skills.ts` always applied it.
 */
export function ships(relativePath: string): boolean {
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment.startsWith(".") || segment === "__pycache__")) {
    return false;
  }
  return !relativePath.endsWith(".pyc");
}

/**
 * True when a change to this repository path CAN change what an install writes.
 *
 * Deliberately WIDER than the corpus: every directory under `skills/` counts,
 * including the ones `selectSkillDirs` leaves out, because which directories are
 * selected is a property of the whole tree and not of one path. The width is the
 * safe direction for its one caller — a path wrongly counted as shipping makes the
 * release gate ask for a refresh nobody needed; a path wrongly counted as inert
 * would let a stale bundle publish.
 */
export function mayShip(path: string): boolean {
  if (BUNDLED_ROOT_FILES.includes(path)) return true;
  const slash = path.indexOf("/");
  if (slash === -1) return false;
  return BUNDLED_ROOT_DIRS.includes(path.slice(0, slash)) && ships(path.slice(slash + 1));
}
