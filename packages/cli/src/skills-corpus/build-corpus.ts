import type { SkillEntry, SkillFile } from "../skills-content.generated";
import type { SkillsCorpus } from "./corpus";
import {
  classifySkillsRoot,
  type SelectionIo,
  selectSkillDirs,
  SHARED_DIR,
  type SkillsRootEntry
} from "./select-skill-dirs";
import {
  AGENTS_ROOT,
  CLAUDE_MD,
  HOOKS_ROOT,
  SETTINGS_JSON,
  ships,
  SKILLS_ROOT
} from "./shipped-paths";

/**
 * The skills repository as a list of file paths, with a way to read one.
 *
 * `read` is called only for the files that ship, so a binary file somewhere the
 * corpus never reaches is never read. That matters to `bundle-skills.ts`, whose
 * reader refuses anything that is not UTF-8.
 */
export interface CorpusFiles {
  /** Every file path, relative to the repository root, with forward slashes. */
  readonly paths: readonly string[];
  /** The file's text, exactly as stored. */
  read(path: string): string;
}

/**
 * Directory-walk order: segment by segment, each compared by code unit. A plain
 * string sort puts `b-x.md` before `b/y.md` (`-` sorts before `/`), where a walk
 * that lists `b` before `b-x.md` visits `b/y.md` first. The bundle was always
 * written in walk order, and a corpus from the platform must come out identical.
 */
function walkOrder(a: string, b: string): number {
  const left = a.split("/");
  const right = b.split("/");
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return left.length - right.length;
}

/** Every shipped file below `root/`, paths relative to it, contents trimmed as the bundle stores them. */
function collect(files: CorpusFiles, sorted: readonly string[], root: string): SkillFile[] {
  const prefix = `${root}/`;
  return sorted
    .filter((path) => path.startsWith(prefix) && ships(path.slice(prefix.length)))
    .map((path) => ({ path: path.slice(prefix.length), content: files.read(path).trim() }));
}

/** First meaningful line of a SKILL.md, outside its frontmatter and headings, capped at 120 chars. */
function describe(skillMd: string | undefined): string {
  if (skillMd === undefined) return "";
  let inFrontmatter = false;
  for (const line of skillMd.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "---") {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter || trimmed.startsWith("#") || trimmed === "") continue;
    return trimmed.length > 120 ? trimmed.slice(0, 117) + "..." : trimmed;
  }
  return "";
}

/** The top level of `skills/`, in the shape `fs.readdirSync(…, { withFileTypes: true })` gives. */
function skillsRootEntries(paths: readonly string[]): SkillsRootEntry[] {
  const kinds = new Map<string, boolean>();
  for (const path of paths) {
    if (!path.startsWith(`${SKILLS_ROOT}/`)) continue;
    const [name, ...rest] = path.slice(SKILLS_ROOT.length + 1).split("/");
    kinds.set(name, (kinds.get(name) ?? false) || rest.length > 0);
  }
  return [...kinds].map(([name, isDir]) => ({ name, isDirectory: () => isDir }));
}

/**
 * Select and read one skills commit into the corpus an install writes.
 *
 * The ONE selection for both sources: `bundle-skills.ts` builds the bundled
 * corpus through it, and the CLI builds a downloaded corpus through it, so a
 * rule changed here changes both. `report` prints the skills-directory report
 * the bundler owes its operator; the CLI passes none, because an install is not
 * the moment to tell a user about upstream directory names.
 */
export function buildCorpusFromFiles(
  commitSha: string,
  files: CorpusFiles,
  report?: SelectionIo
): SkillsCorpus {
  const sorted = [...files.paths].sort(walkOrder);
  const present = new Set(sorted);
  const readIfPresent = (path: string): string | undefined =>
    present.has(path) ? files.read(path) : undefined;

  const entries = skillsRootEntries(sorted);
  const skillList = report ? selectSkillDirs(entries, report) : classifySkillsRoot(entries).bundled;

  const skills: Record<string, SkillEntry> = {};
  for (const slug of skillList) {
    skills[slug] = {
      slug,
      description: describe(readIfPresent(`${SKILLS_ROOT}/${slug}/SKILL.md`)),
      files: collect(files, sorted, `${SKILLS_ROOT}/${slug}`)
    };
  }

  return {
    commitSha,
    skills,
    skillList,
    claudeMd: (readIfPresent(CLAUDE_MD) ?? "").trim(),
    sharedFiles: collect(files, sorted, `${SKILLS_ROOT}/${SHARED_DIR}`),
    settingsJson: (readIfPresent(SETTINGS_JSON) ?? "").trim(),
    hookFiles: collect(files, sorted, HOOKS_ROOT),
    agentFiles: collect(files, sorted, AGENTS_ROOT)
  };
}
