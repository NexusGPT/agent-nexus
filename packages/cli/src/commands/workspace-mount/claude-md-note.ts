import fs from "node:fs";
import path from "node:path";

// ── CLAUDE.md note (so a local Claude Code knows the drive is live + shared) ──

const CLAUDE_MD_BEGIN = "<!-- nexus-workspace:begin -->";
const CLAUDE_MD_END = "<!-- nexus-workspace:end -->";

export function workspaceClaudeMdSection(
  slug: string,
  mountPath: string,
  readOnly: boolean
): string {
  const mode = readOnly ? "read-only" : "read-write";
  return [
    CLAUDE_MD_BEGIN,
    `## Nexus Workspace`,
    ``,
    `The Nexus workspace \`${slug}\` is mounted at \`${mountPath}\` (${mode}).`,
    ``,
    `- It is **live shared team storage** — other people and agents (including Ultimate Cue)`,
    `  may read and write the same files concurrently. Re-read a file before relying on`,
    `  cached contents; writes are last-write-wins per file.`,
    `- Treat it like a normal directory: \`bash\`, \`python\`, Read/Write/Glob all work on it.`,
    readOnly
      ? `- This mount is read-only; do not attempt to modify files under it.`
      : `- Changes you save propagate to the shared workspace within a few seconds.`,
    CLAUDE_MD_END
  ].join("\n");
}

/** Insert or replace the managed Nexus-workspace block in ./CLAUDE.md. */
export function writeClaudeMdNote(slug: string, mountPath: string, readOnly: boolean): string {
  const target = path.join(process.cwd(), "CLAUDE.md");
  const section = workspaceClaudeMdSection(slug, mountPath, readOnly);
  let content = "";
  try {
    content = fs.readFileSync(target, "utf-8");
  } catch {
    /* file doesn't exist yet */
  }

  const begin = content.indexOf(CLAUDE_MD_BEGIN);
  const end = content.indexOf(CLAUDE_MD_END);
  if (begin !== -1 && end !== -1 && end > begin) {
    const before = content.slice(0, begin).replace(/\n*$/, "");
    const after = content.slice(end + CLAUDE_MD_END.length).replace(/^\n*/, "");
    content = [before, section, after].filter(Boolean).join("\n\n") + "\n";
  } else {
    content = (content ? content.replace(/\n*$/, "") + "\n\n" : "") + section + "\n";
  }
  fs.writeFileSync(target, content);
  return target;
}
