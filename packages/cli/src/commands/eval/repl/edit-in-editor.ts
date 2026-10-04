import fs from "node:fs";

/**
 * Open $EDITOR on the candidate text. Returns null when no interactive editor
 * can run (no TTY, or the editor exits non-zero) — the REPL falls back rather
 * than hanging a scripted stdin session.
 */
export async function editInEditor(initial: string): Promise<string | null> {
  if (!process.stdin.isTTY) return null;
  const editor = process.env.EDITOR ?? process.env.VISUAL;
  if (editor === undefined || editor === "") return null;

  const os = await import("node:os");
  const path = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const file = path.join(os.tmpdir(), `nexus-golden-edit-${process.pid}-${Date.now()}.md`);
  fs.writeFileSync(file, initial);
  try {
    const run = spawnSync(editor, [file], { stdio: "inherit" });
    if (run.status !== 0) return null;
    return fs.readFileSync(file, "utf-8");
  } finally {
    fs.unlinkSync(file);
  }
}
