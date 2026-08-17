import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  getAgentFiles,
  getClaudeMd,
  getHookFiles,
  getSettingsJson,
  getSharedFiles,
  getSkills,
  type SkillEntry
} from "../skills-content.generated";
import { confirmDestructive } from "./confirm";

// ── Types ────────────────────────────────────────────────────────────────────

export interface InstallableSkill {
  slug: string;
  files: { path: string; content: Buffer }[];
}

export interface WriteResult {
  created: string[];
  updated: string[];
  skipped: string[];
  /**
   * On disk, DIFFERENT from the bundle, and not recognisable as something this
   * CLI wrote. Left exactly as it was; `--force` is the only way past it.
   */
  preserved: string[];
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
    const entry: SkillEntry = getSkills()[slug];
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
    files: getSharedFiles().map((f) => ({
      path: f.path,
      content: Buffer.from(f.content, "utf-8")
    }))
  };
}

export const claudeMdContent = (): Buffer => Buffer.from(getClaudeMd(), "utf-8");

/**
 * The scoped permission posture (NEX-2461): `.claude/settings.json` declares
 * the allow/ask permission rules and wires the PreToolUse firewall + lifecycle
 * hooks. Like CLAUDE.md it lands at a path a user may have customised, so it
 * gets the same preserve-unless-`--force` treatment.
 */
export const settingsJsonContent = (): Buffer => Buffer.from(getSettingsJson(), "utf-8");

/**
 * The `hooks/` tree (Python firewall + lifecycle scripts, their `lib/`, and
 * docs) that `settings.json` invokes. Namespaced under `.claude/hooks`, so —
 * like the skill files — it is Nexus-owned and refreshed in place on every
 * install rather than preserved.
 */
export function hookInstallables(): InstallableSkill {
  return {
    slug: "hooks",
    files: getHookFiles().map((f) => ({
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
    files: getAgentFiles().map((f) => ({
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
    const skillsDir = path.resolve(cwd, opts.dir);
    const { projectRoot, claudeDir } = layoutForExplicitDir(skillsDir);
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
function layoutForExplicitDir(skillsDir: string): { projectRoot: string; claudeDir: string } {
  const parent = path.dirname(skillsDir);
  const conventional = path.basename(skillsDir) === "skills" && path.basename(parent) === ".claude";

  if (conventional) return { projectRoot: path.dirname(parent), claudeDir: parent };
  return { projectRoot: skillsDir, claudeDir: skillsDir };
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

// ── The install ledger ────────────────────────────────────────────────────────

/**
 * WHAT THIS CLI WROTE, SO IT CAN TELL ITS OWN FILE FROM THE USER'S.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 *
 * `skills update` / `claude-code install` refreshed skills, hooks and agents
 * "in place": any on-disk file whose bytes differed from the bundle was
 * overwritten, with no prompt, no `--force`, and no way back. The only signal
 * was a counter — "Installed 41 skills (612 files)" — which is identical whether
 * those files were stale copies of our own output or hand-edited guardrails the
 * operator wrote. `.claude/hooks/**` is executable Python that can DENY the
 * user's tool calls; `.claude/agents/**` is their subagent definitions. Editing
 * those is the normal reason to have them.
 *
 * ── Why a checksum ledger, and not the alternatives ──────────────────────────
 *
 * The question is "did the USER change this", and the only honest way to answer
 * it is to know what WE last wrote. Three candidates:
 *
 *   - **mtime** — can produce a false "unmodified", which is the one error that
 *     destroys work. `cp -p`, `git checkout`, `rsync --times`, a restore from a
 *     backup and an unpacked archive all reinstate an old mtime over new bytes.
 *   - **compare against the bundle** — this is what the code did. It cannot
 *     distinguish "the user edited it" from "the bundle moved on", because both
 *     are simply "differs".
 *   - **a checksum of what we wrote** — a hash mismatch means the bytes changed
 *     after our write, whatever touched them. No false "unmodified" exists: the
 *     only way to hash equal is to hold the exact bytes we left.
 *
 * ── The one case it genuinely cannot answer, and which way it fails ──────────
 *
 * A tree installed BEFORE this ledger shipped has no entry for any file. Then
 * "user-edited" and "written by an older CLI" are indistinguishable, and the
 * choice is which error to make. It preserves — an unnecessary `--force` costs
 * one re-run, and a wrong overwrite costs work that has no copy. The message
 * names the files and the flag, so the cost is bounded and visible.
 *
 * `skipped` files are recorded too, which is how a legacy tree heals: every file
 * that already matches the bundle enters the ledger on the first run, and only
 * the genuinely-divergent ones ever need the flag.
 */
export const INSTALL_MANIFEST_BASENAME = ".nexus-install-manifest.json";

interface InstallManifestFile {
  version: 1;
  files: Record<string, string>;
}

export interface InstallLedger {
  /** Absolute `.claude` directory the manifest lives in and keys are relative to. */
  readonly claudeDir: string;
  /** What the previous install recorded. */
  readonly previous: Readonly<Record<string, string>>;
  /** What this install has written so far — becomes the next manifest. */
  readonly next: Record<string, string>;
}

export function installManifestPath(claudeDir: string): string {
  return path.join(claudeDir, INSTALL_MANIFEST_BASENAME);
}

/** Read the manifest for `claudeDir`. A missing or unreadable one is an empty ledger. */
export function openInstallLedger(claudeDir: string): InstallLedger {
  const resolved = path.resolve(claudeDir);
  let previous: Record<string, string> = {};
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(installManifestPath(resolved), "utf-8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as InstallManifestFile).version === 1
    ) {
      const files = (parsed as InstallManifestFile).files;
      // Only string→string entries survive; a hand-mangled manifest degrades to
      // "we do not recognise this file", never to "this file is ours".
      if (typeof files === "object" && files !== null) {
        previous = Object.fromEntries(
          Object.entries(files).filter(([, v]) => typeof v === "string")
        );
      }
    }
  } catch {
    /* absent, unreadable or malformed — an empty ledger preserves rather than overwrites */
  }
  return { claudeDir: resolved, previous, next: {} };
}

/** Persist what this install wrote. Best-effort: a manifest we cannot write must not fail an install. */
export function commitInstallLedger(ledger: InstallLedger): void {
  const body: InstallManifestFile = {
    version: 1,
    files: Object.fromEntries(Object.entries(ledger.next).sort(([a], [b]) => a.localeCompare(b)))
  };
  try {
    fs.mkdirSync(ledger.claudeDir, { recursive: true });
    fs.writeFileSync(installManifestPath(ledger.claudeDir), `${JSON.stringify(body, null, 2)}\n`);
  } catch {
    /* the next install simply falls back to "unrecognised" and preserves */
  }
}

function ledgerKey(ledger: InstallLedger, fullPath: string): string {
  const rel = path.relative(ledger.claudeDir, fullPath);
  // A write base outside the .claude dir has no stable relative key; the
  // absolute path is still deterministic and still only ever matches itself.
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return fullPath;
  return rel.split(path.sep).join("/");
}

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

// ── Writers ───────────────────────────────────────────────────────────────────

export interface WriteOpts {
  /**
   * Required, not optional: an install that forgets to thread the ledger is the
   * defect this whole mechanism exists to remove, and an optional parameter
   * makes forgetting the default.
   */
  ledger: InstallLedger;
  /** Overwrite a file this CLI does not recognise. */
  force?: boolean;
}

export function writeSkillFiles(
  basePath: string,
  files: { path: string; content: Buffer }[],
  opts: WriteOpts
): WriteResult {
  const result: WriteResult = { created: [], updated: [], skipped: [], preserved: [] };
  const { ledger } = opts;

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

    const key = ledgerKey(ledger, fullPath);

    if (existingStat) {
      if (!existingStat.isFile()) {
        throw new Error(
          `Refusing to overwrite "${fullPath}" — not a regular file (symlink or directory).`
        );
      }
      const existing = fs.readFileSync(fullPath);
      if (existing.equals(file.content)) {
        // Already the bundle's bytes. Record it, so a tree installed before the
        // ledger existed stops being unrecognised one file at a time.
        ledger.next[key] = sha256(file.content);
        result.skipped.push(file.path);
      } else {
        // `next` first: a file written earlier in THIS install is ours even
        // though the on-disk manifest predates it.
        const recorded = ledger.next[key] ?? ledger.previous[key];
        const isOurs = recorded !== undefined && recorded === sha256(existing);
        if (!isOurs && !opts.force) {
          result.preserved.push(file.path);
          continue;
        }
        fs.writeFileSync(fullPath, file.content);
        ledger.next[key] = sha256(file.content);
        result.updated.push(file.path);
      }
    } else {
      fs.writeFileSync(fullPath, file.content);
      ledger.next[key] = sha256(file.content);
      result.created.push(file.path);
    }

    // Deliberately outside the create/update/skip branches. Anyone who ran an
    // install before this shipped has these scripts on disk with byte-identical
    // content at mode 0644, so `skipped` is the exact path their repair travels
    // — a chmod reachable only from `created`/`updated` would never fix them.
    // A PRESERVED file is skipped by the `continue` above: it is the user's file
    // now, and its mode is theirs to choose.
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

/**
 * The installer's confirmation, on the one shared path.
 *
 * It already refused without a terminal, which was the safe branch — but it
 * tested `process.stdout.isTTY`, so `nexus skills update > log.txt` from an
 * interactive shell refused with a human sitting right there. A confirmation
 * READS; `confirmDestructive` tests stdin, which is the only stream that says
 * whether anyone can answer.
 *
 * @see confirmDestructive — the convention, and why refusing is the default.
 */
export async function confirmOrAbort(
  message: string,
  opts: { yes?: boolean; force?: boolean }
): Promise<boolean> {
  return confirmDestructive(message, opts);
}
