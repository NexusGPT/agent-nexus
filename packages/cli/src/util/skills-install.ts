import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { color } from "../output";
import {
  AGENT_FILES,
  CLAUDE_MD,
  HOOK_FILES,
  SETTINGS_JSON,
  SHARED_FILES,
  type SkillEntry,
  SKILLS
} from "../skills-content.generated";

// ── Types ────────────────────────────────────────────────────────────────────

export interface InstallableSkill {
  slug: string;
  files: { path: string; content: Buffer }[];
}

export interface WriteResult {
  created: string[];
  updated: string[];
  skipped: string[];
}

export type ClaudeMdStatus = "created" | "updated" | "skipped" | "preserved";

/**
 * How the install target was chosen, so callers can explain it to the user:
 * - "explicit"        — the user passed --dir
 * - "global"          — the user passed --global (~/.claude)
 * - "detected-claude" — walked up and found an existing `.claude` directory
 * - "detected-md"     — walked up and found an existing CLAUDE.md
 * - "detected-git"    — walked up and found the git repo root
 * - "cwd"             — no marker found; fell back to the current directory
 */
export type TargetReason =
  | "explicit"
  | "global"
  | "detected-claude"
  | "detected-md"
  | "detected-git"
  | "cwd";

export interface ClaudeTarget {
  /** Directory where `<root>/.claude/skills` will be written. */
  skillsDir: string;
  /** The `.claude` directory itself (parent of skills/, hooks/, settings.json). */
  claudeDir: string;
  /** Project root where CLAUDE.md lives (auto-loaded by Claude Code). */
  projectRoot: string;
  /** Absolute path to the CLAUDE.md we would write. */
  claudeMdPath: string;
  /** Absolute path to `.claude/settings.json` (the scoped permission posture). */
  settingsJsonPath: string;
  /** Directory where the firewall + lifecycle hooks are written (`.claude/hooks`). */
  hooksDir: string;
  /** Directory where the Nexus subagent definitions are written (`.claude/agents`). */
  agentsDir: string;
  /** How we picked this target. */
  reason: TargetReason;
}

// ── Bundle → installable ──────────────────────────────────────────────────────

/**
 * Convert the build-time bundle into the byte-shaped form `writeSkillFiles`
 * expects. The bundle stores file contents as UTF-8 strings (they're inlined
 * into TypeScript constants) and `writeSkillFiles` writes raw buffers, so the
 * round-trip is lossless exactly while every bundled file is valid UTF-8.
 * `bundle-skills.ts` enforces that at build time rather than leaving it to
 * chance: a non-UTF-8 asset fails the bundle instead of installing corrupted.
 */
export function bundleToInstallables(slugs: readonly string[]): InstallableSkill[] {
  return slugs.map((slug) => {
    const entry: SkillEntry = SKILLS[slug];
    return {
      slug: entry.slug,
      files: entry.files.map((f) => ({
        path: f.path,
        content: Buffer.from(f.content, "utf-8")
      }))
    };
  });
}

/**
 * The `shared/` directory holds the api-client + helpers every skill's example
 * scripts import via `../../shared/...`. It ships alongside the skills under
 * `.claude/skills/shared` whenever any skill is installed, otherwise those
 * imports dangle.
 */
export function sharedInstallable(): InstallableSkill {
  return {
    slug: "shared",
    files: SHARED_FILES.map((f) => ({
      path: f.path,
      content: Buffer.from(f.content, "utf-8")
    }))
  };
}

export const claudeMdContent = (): Buffer => Buffer.from(CLAUDE_MD, "utf-8");

/**
 * The scoped permission posture (NEX-2461): `.claude/settings.json` declares
 * the allow/ask permission rules and wires the PreToolUse firewall + lifecycle
 * hooks. Like CLAUDE.md it lands at a path a user may have customised, so it
 * gets the same preserve-unless-`--force` treatment.
 */
export const settingsJsonContent = (): Buffer => Buffer.from(SETTINGS_JSON, "utf-8");

/**
 * The `hooks/` tree (Python firewall + lifecycle scripts, their `lib/`, and
 * docs) that `settings.json` invokes. Namespaced under `.claude/hooks`, so —
 * like the skill files — it is Nexus-owned and refreshed in place on every
 * install rather than preserved.
 */
export function hookInstallables(): InstallableSkill {
  return {
    slug: "hooks",
    files: HOOK_FILES.map((f) => ({
      path: f.path,
      content: Buffer.from(f.content, "utf-8")
    }))
  };
}

/**
 * The `agents/` tree — the Nexus-owned subagent definitions (flat `.md` files
 * Claude Code auto-discovers under `.claude/agents`). Like the skill files they
 * are Nexus-owned and refreshed in place on every install rather than
 * preserved. Unlike settings.json + hooks, they resolve fine at any scope, so
 * they install for both project and `--global` targets.
 */
export function agentInstallables(): InstallableSkill {
  return {
    slug: "agents",
    files: AGENT_FILES.map((f) => ({
      path: f.path,
      content: Buffer.from(f.content, "utf-8")
    }))
  };
}

// ── Target detection ──────────────────────────────────────────────────────────

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

export interface DetectOpts {
  /** Explicit skills directory (`--dir`). Highest precedence. */
  dir?: string;
  /** Install into the global `~/.claude` instead of a project (`--global`). */
  global?: boolean;
  /** Skip the upward walk and use the current directory (`--here`). */
  here?: boolean;
}

/**
 * Resolve where the skills + CLAUDE.md should be written, honoring explicit
 * flags first and otherwise auto-detecting the owning project root.
 */
export function resolveClaudeTarget(
  opts: DetectOpts,
  cwd: string = process.cwd(),
  homeDir: string = os.homedir()
): ClaudeTarget {
  // 1. --dir wins outright (explicit user intent).
  if (opts.dir) {
    const skillsDir = path.resolve(opts.dir);
    const projectRoot = projectRootForSkillsDir(skillsDir, cwd);
    const claudeDir = claudeDirForSkillsDir(skillsDir, projectRoot);
    return {
      skillsDir,
      claudeDir,
      projectRoot,
      claudeMdPath: path.join(projectRoot, "CLAUDE.md"),
      settingsJsonPath: path.join(claudeDir, "settings.json"),
      hooksDir: path.join(claudeDir, "hooks"),
      agentsDir: path.join(claudeDir, "agents"),
      reason: "explicit"
    };
  }

  // 2. --global → the user-scoped ~/.claude.
  if (opts.global) {
    const root = path.join(homeDir, ".claude");
    return {
      skillsDir: path.join(root, "skills"),
      claudeDir: root,
      projectRoot: root,
      claudeMdPath: path.join(root, "CLAUDE.md"),
      settingsJsonPath: path.join(root, "settings.json"),
      hooksDir: path.join(root, "hooks"),
      agentsDir: path.join(root, "agents"),
      reason: "global"
    };
  }

  // 3. --here → current dir, no walk.
  if (opts.here) {
    const root = path.resolve(cwd);
    return claudeTargetForRoot(root, "cwd");
  }

  // 4. Auto-detect the owning project root.
  const { root, reason } = detectProjectRoot(cwd, homeDir);
  return claudeTargetForRoot(root, reason);
}

/**
 * Build a target for a project root using the conventional
 * `<root>/.claude/{skills,hooks,settings.json}` + `<root>/CLAUDE.md` layout.
 */
function claudeTargetForRoot(root: string, reason: TargetReason): ClaudeTarget {
  const claudeDir = path.join(root, ".claude");
  return {
    skillsDir: path.join(claudeDir, "skills"),
    claudeDir,
    projectRoot: root,
    claudeMdPath: path.join(root, "CLAUDE.md"),
    settingsJsonPath: path.join(claudeDir, "settings.json"),
    hooksDir: path.join(claudeDir, "hooks"),
    agentsDir: path.join(claudeDir, "agents"),
    reason
  };
}

/**
 * Resolve the `.claude` dir for an explicit `--dir`. When the dir follows the
 * conventional `<root>/.claude/skills` layout we reuse that `.claude` parent so
 * settings.json + hooks sit beside the skills; otherwise we fall back to a
 * `.claude` under the resolved project root.
 */
function claudeDirForSkillsDir(skillsDir: string, projectRoot: string): string {
  const parent = path.dirname(skillsDir);
  if (path.basename(skillsDir) === "skills" && path.basename(parent) === ".claude") {
    return parent;
  }
  return path.join(projectRoot, ".claude");
}

/**
 * Resolve the project root for an explicit `--dir`. Claude Code auto-loads
 * project memory from `<root>/CLAUDE.md`, so for the conventional
 * `<root>/.claude/skills` layout we walk up to `<root>`. For a custom dir that
 * doesn't follow that layout, fall back to the current working directory —
 * still the project root the user invoked us from.
 */
function projectRootForSkillsDir(skillsDir: string, cwd: string): string {
  const parent = path.dirname(skillsDir);
  if (path.basename(skillsDir) === "skills" && path.basename(parent) === ".claude") {
    return path.dirname(parent);
  }
  return path.resolve(cwd);
}

// ── fs helpers ────────────────────────────────────────────────────────────────

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
 * Resolve `relativePath` against `basePath` and only return the resulting
 * absolute path when it is strictly contained within `basePath`. Returns
 * `null` on absolute paths, `..` traversal, or any entry that would escape
 * the target directory (Zip Slip hardening).
 */
export function safeResolveWithinBase(basePath: string, relativePath: string): string | null {
  if (!relativePath || relativePath.includes("\0")) return null;
  if (path.isAbsolute(relativePath)) return null;

  const normalizedBase = path.resolve(basePath);
  const resolved = path.resolve(normalizedBase, relativePath);
  const baseWithSep = normalizedBase + path.sep;
  if (resolved !== normalizedBase && !resolved.startsWith(baseWithSep)) return null;
  return resolved;
}

// ── Executable bit ────────────────────────────────────────────────────────────

/**
 * A file whose first two bytes are `#!` is a script somebody is meant to run.
 *
 * That is the property that matters, and it is the only one of the three
 * candidates that is right in both directions here. Measured against the pinned
 * skills-nexus tree, over the 486 bundled files:
 *
 * - **By extension** — there is no allowlist that works. Of 59 bundled `.ts`
 *   files, 52 carry `#!/usr/bin/env npx tsx` and are documented as direct
 *   invocations, while 7 are library modules an example imports; `.js` is one
 *   file and it is a template with no shebang. An extension list would either
 *   miss 52 runners or mark 8 non-scripts executable. It is also the same
 *   weaker-second-source that `bundle-skills.ts` just deleted from the
 *   collection side — reintroducing one here restores that defect at the other
 *   end of the same pipe.
 * - **By the source file's mode** — the upstream repo marks only 19 of its 512
 *   blobs `100755`, so **63 of the 82 bundled shebang scripts are `100644`
 *   upstream**, including every `examples/*.ts` runner and 7 of the 14 hooks.
 *   Carrying the mode would ship those non-executable, and would REGRESS the
 *   hooks that install executable today.
 *
 * No bundled file is executable upstream without also carrying a shebang, so
 * the shebang rule loses nothing the mode would have caught.
 */
const SHEBANG = Buffer.from("#!");

function hasShebang(content: Buffer): boolean {
  return content.subarray(0, SHEBANG.length).equals(SHEBANG);
}

/**
 * Grant execute exactly where read is already granted — `chmod +x` semantics,
 * not a blanket `0o755`. A file the user keeps at `0600` becomes `0700` rather
 * than being widened to world-readable.
 *
 * Best-effort: a chmod failure on an exotic filesystem must not abort an
 * otherwise-successful install.
 */
function grantExecute(fullPath: string): void {
  try {
    const mode = fs.statSync(fullPath).mode & 0o7777;
    const next = mode | ((mode & 0o444) >> 2);
    if (next !== mode) fs.chmodSync(fullPath, next);
  } catch {
    /* best-effort: leave the file non-executable rather than fail install */
  }
}

// ── Writers ───────────────────────────────────────────────────────────────────

export function writeSkillFiles(
  basePath: string,
  files: { path: string; content: Buffer }[]
): WriteResult {
  const result: WriteResult = { created: [], updated: [], skipped: [] };

  for (const file of files) {
    const fullPath = safeResolveWithinBase(basePath, file.path);
    if (!fullPath) {
      throw new Error(
        `Refusing to write unsafe path "${file.path}" — the skills bundle contains an entry that escapes the target directory.`
      );
    }
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });

    // Use lstat (not existsSync) so we detect symlinks BEFORE we follow them.
    // existsSync follows symlinks and returns false for dangling links, which
    // would let writeFileSync then create a file at the symlink's target —
    // possibly outside basePath.
    let existingStat: fs.Stats | null = null;
    try {
      existingStat = fs.lstatSync(fullPath);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException | null)?.code;
      if (code !== "ENOENT") throw err;
    }

    if (existingStat) {
      if (!existingStat.isFile()) {
        throw new Error(
          `Refusing to overwrite "${fullPath}" — not a regular file (symlink or directory).`
        );
      }
      const existing = fs.readFileSync(fullPath);
      if (existing.equals(file.content)) {
        result.skipped.push(file.path);
      } else {
        fs.writeFileSync(fullPath, file.content);
        result.updated.push(file.path);
      }
    } else {
      fs.writeFileSync(fullPath, file.content);
      result.created.push(file.path);
    }

    // Deliberately outside the create/update/skip branches. Anyone who ran an
    // install before this shipped has these scripts on disk with byte-identical
    // content at mode 0644, so `skipped` is the exact path their repair travels
    // — a chmod reachable only from `created`/`updated` would never fix them.
    if (hasShebang(file.content)) grantExecute(fullPath);
  }

  return result;
}

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

// ── Prompts ───────────────────────────────────────────────────────────────────

export async function confirmOrAbort(
  message: string,
  opts: { yes?: boolean; force?: boolean }
): Promise<boolean> {
  if (opts.yes || opts.force) return true;

  if (!process.stdout.isTTY) {
    console.error(
      color.red("Error:") + " Cannot prompt in non-interactive mode. Use --yes or --force."
    );
    process.exitCode = 1;
    return false;
  }

  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(message);
  rl.close();
  return answer.toLowerCase() === "y" || answer === "";
}
