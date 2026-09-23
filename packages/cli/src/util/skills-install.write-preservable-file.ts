import fs from "node:fs";
import path from "node:path";

export type ClaudeMdStatus = "created" | "updated" | "skipped" | "preserved";

/**
 * Write a single file that a user may have customised, never silently
 * clobbering an existing, differing copy. Used for both the project-root
 * CLAUDE.md and `.claude/settings.json` — both live at paths a user may own,
 * so an existing, differing file is `preserved` unless `force` is passed.
 */
export function writePreservableFile(
  target: string,
  content: Buffer,
  opts: { force?: boolean }
): ClaudeMdStatus {
  let existingStat: fs.Stats | null = null;
  try {
    existingStat = fs.lstatSync(target);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code !== "ENOENT") throw err;
  }

  if (existingStat) {
    if (!existingStat.isFile()) {
      throw new Error(
        `Refusing to overwrite "${target}" — not a regular file (symlink or directory).`
      );
    }
    const existing = fs.readFileSync(target);
    if (existing.equals(content)) return "skipped";
    if (!opts.force) return "preserved";
    fs.writeFileSync(target, content);
    return "updated";
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return "created";
}

/**
 * Write the bundled CLAUDE.md (the cross-cutting Cue system prompt every
 * SKILL.md cross-references) to the project root, preserving an existing,
 * differing user file unless `force`.
 */
export function writeRootClaudeMd(
  target: string,
  content: Buffer,
  opts: { force?: boolean }
): ClaudeMdStatus {
  return writePreservableFile(target, content, opts);
}

/**
 * Write `.claude/settings.json` (the scoped permission posture), preserving an
 * existing, differing user file unless `force` — parity with CLAUDE.md so a
 * user's local permission customisations are never silently overwritten.
 */
export function writeRootSettingsJson(
  target: string,
  content: Buffer,
  opts: { force?: boolean }
): ClaudeMdStatus {
  return writePreservableFile(target, content, opts);
}
