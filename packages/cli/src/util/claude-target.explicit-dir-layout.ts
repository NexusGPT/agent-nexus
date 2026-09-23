import path from "node:path";

/**
 * `--dir` IS THE ONLY INPUT. Everything an explicit install writes is derived
 * from the directory the user named, and nothing from the directory they happen
 * to be standing in.
 *
 * That was not true, and the divergence was invisible: only `skillsDir` came
 * from `--dir`. `projectRoot` fell back to the CURRENT WORKING DIRECTORY for any
 * dir that did not end in `.claude/skills`, and `claudeDir` was built on top of
 * it. So `nexus claude-code install --dir /tmp/scratch` wrote the skills to
 * /tmp/scratch and then wrote `$CWD/CLAUDE.md`, `$CWD/.claude/settings.json`,
 * `$CWD/.claude/hooks/**` and `$CWD/.claude/agents/**` into whatever real
 * project the operator was in. The plan printed those paths, and every one of
 * them read as part of a run the operator had aimed somewhere else.
 *
 * Two layouts, one rule:
 *
 *   - `<root>/.claude/skills` — the conventional shape, and the DEFAULT of
 *     `claude-code install`. `<root>` is a real project root, so `CLAUDE.md`
 *     goes there and the posture goes in `<root>/.claude`. Outside `--dir`, but
 *     derived from it: the user named the skills subdirectory OF that tree.
 *   - anything else — the named directory is the whole target. Skills, CLAUDE.md,
 *     settings.json, hooks/ and agents/ all land inside it and nothing escapes.
 *
 * `skills where --dir <path>` prints the answer without writing, and it is now
 * a complete answer: no path it prints can be changed by where you run it from.
 */
export function layoutForExplicitDir(skillsDir: string): {
  projectRoot: string;
  claudeDir: string;
} {
  const parent = path.dirname(skillsDir);
  const conventional = path.basename(skillsDir) === "skills" && path.basename(parent) === ".claude";

  if (conventional) return { projectRoot: path.dirname(parent), claudeDir: parent };
  return { projectRoot: skillsDir, claudeDir: skillsDir };
}
