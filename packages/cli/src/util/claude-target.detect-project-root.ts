import fs from "node:fs";
import path from "node:path";

import type { TargetReason } from "./claude-target";

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Walk up from `start` (bounded by the user's home directory and the
 * filesystem root) and pick the project root the user most likely means by
 * "here". Precedence, strongest signal first:
 *
 *   1. An existing `.claude/` directory — literally "where the claude files
 *      already sit". This is the dominant signal: it means a previous install
 *      already chose this root, so we update it in place rather than dropping a
 *      stray second `.claude` into a subdirectory.
 *   2. An existing `CLAUDE.md` — a project that has Claude memory but no
 *      skills yet.
 *   3. The git repo root (`.git`) — the natural project boundary.
 *   4. Fall back to the start directory.
 *
 * Walking up to the *owning* root is what stops us from "overriding the claude
 * file of another folder": running from a nested subdir resolves to the
 * project's real `.claude`, not a new one beside the file you happen to be in.
 */
export function detectProjectRoot(
  start: string,
  homeDir: string
): { root: string; reason: TargetReason } {
  const resolvedStart = path.resolve(start);
  const home = path.resolve(homeDir);

  let claudeDirRoot: string | null = null;
  let claudeMdRoot: string | null = null;
  let gitRoot: string | null = null;

  let dir = resolvedStart;
  // Bound the walk: when we're inside $HOME, stop AT home and never climb
  // above it into shared system paths where another user's or the OS's files
  // live. When the start is already outside $HOME (e.g. a repo on another
  // volume, or /tmp in tests), there's no home boundary to respect — walk up
  // to the filesystem root instead.
  while (true) {
    // The home directory itself is the GLOBAL scope (~/.claude), reachable only
    // via --global. It must never count as an auto-detected *project* root, or
    // a user who has ~/.claude (very common) would see every project under
    // $HOME resolve to the global location instead of the project's own git
    // root. So skip recording detection signals when we're standing on home.
    if (dir !== home) {
      if (claudeDirRoot === null && isDirectory(path.join(dir, ".claude"))) {
        claudeDirRoot = dir;
      }
      if (claudeMdRoot === null && isFile(path.join(dir, "CLAUDE.md"))) {
        claudeMdRoot = dir;
      }
      if (gitRoot === null && fs.existsSync(path.join(dir, ".git"))) {
        gitRoot = dir;
      }
    }

    // Stop AT home so we never climb above it.
    if (dir === home) break;

    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }

  if (claudeDirRoot) return { root: claudeDirRoot, reason: "detected-claude" };
  if (claudeMdRoot) return { root: claudeMdRoot, reason: "detected-md" };
  if (gitRoot) return { root: gitRoot, reason: "detected-git" };
  return { root: resolvedStart, reason: "cwd" };
}
