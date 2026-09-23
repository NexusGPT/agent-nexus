import os from "node:os";
import path from "node:path";

import { detectProjectRoot } from "./claude-target.detect-project-root";
import { layoutForExplicitDir } from "./claude-target.explicit-dir-layout";

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
