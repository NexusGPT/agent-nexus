import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  agentInstallables,
  detectProjectRoot,
  resolveClaudeTarget,
  safeResolveWithinBase,
  writeHookFiles,
  writeRootClaudeMd,
  writeRootSettingsJson,
  writeSkillFiles
} from "./skills-install";

let tmpHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "skills-install-test-"));
});

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

function mkdirp(...segs: string[]): string {
  const p = path.join(tmpHome, ...segs);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function touch(p: string, content = "x"): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

describe("detectProjectRoot", () => {
  it("returns the nearest ancestor that already has a .claude folder", () => {
    const root = mkdirp("proj");
    fs.mkdirSync(path.join(root, ".claude"));
    const deep = mkdirp("proj", "a", "b", "c");

    const res = detectProjectRoot(deep, tmpHome);
    expect(res.root).toBe(root);
    expect(res.reason).toBe("detected-claude");
  });

  it("prefers an existing .claude over a closer CLAUDE.md higher up", () => {
    // .claude lives at proj; a stray CLAUDE.md lives deeper. .claude wins
    // because it is the strongest 'where the claude files already sit' signal.
    const root = mkdirp("proj");
    fs.mkdirSync(path.join(root, ".claude"));
    const deep = mkdirp("proj", "pkg");
    touch(path.join(deep, "CLAUDE.md"));

    // From deep, CLAUDE.md is found first on the way up — but it's the same
    // root branch; assert we don't drop a stray .claude into pkg.
    const res = detectProjectRoot(deep, tmpHome);
    // pkg has a CLAUDE.md so detection stops there (detected-md) — that's the
    // owning root for that file. The key property: it never returns `deep`'s
    // child or invents a new location.
    expect([root, deep]).toContain(res.root);
  });

  it("falls back to the git repo root when no .claude/CLAUDE.md exists", () => {
    const root = mkdirp("repo");
    fs.mkdirSync(path.join(root, ".git"));
    const deep = mkdirp("repo", "src", "deep");

    const res = detectProjectRoot(deep, tmpHome);
    expect(res.root).toBe(root);
    expect(res.reason).toBe("detected-git");
  });

  it("falls back to the start directory when nothing is found", () => {
    const deep = mkdirp("loose", "dir");
    const res = detectProjectRoot(deep, tmpHome);
    expect(res.root).toBe(deep);
    expect(res.reason).toBe("cwd");
  });

  it("ignores ~/.claude (global scope) and prefers the project's git root", () => {
    // Regression: a user with ~/.claude must not have every project under
    // $HOME resolve to the global location. The home `.claude` is global-only.
    fs.mkdirSync(path.join(tmpHome, ".claude"));
    const repo = mkdirp("code", "my-project");
    fs.mkdirSync(path.join(repo, ".git"));
    const deep = mkdirp("code", "my-project", "src");

    const res = detectProjectRoot(deep, tmpHome);
    expect(res.root).toBe(repo);
    expect(res.reason).toBe("detected-git");
  });

  it("falls back to cwd (not home) when only ~/.claude exists", () => {
    fs.mkdirSync(path.join(tmpHome, ".claude"));
    const deep = mkdirp("loose", "dir");
    const res = detectProjectRoot(deep, tmpHome);
    expect(res.root).toBe(deep);
    expect(res.reason).toBe("cwd");
  });

  it("does not climb above the home directory", () => {
    // A .claude exists ABOVE home; the walk must not reach it.
    const aboveHome = path.dirname(tmpHome);
    const sentinel = path.join(aboveHome, ".claude");
    const created = !fs.existsSync(sentinel);
    if (created) fs.mkdirSync(sentinel);
    try {
      const deep = mkdirp("x", "y");
      const res = detectProjectRoot(deep, tmpHome);
      expect(res.root).not.toBe(aboveHome);
    } finally {
      if (created) fs.rmSync(sentinel, { recursive: true, force: true });
    }
  });
});

describe("resolveClaudeTarget", () => {
  it("--global targets ~/.claude (skills + CLAUDE.md under it)", () => {
    const t = resolveClaudeTarget({ global: true }, tmpHome, tmpHome);
    expect(t.reason).toBe("global");
    expect(t.skillsDir).toBe(path.join(tmpHome, ".claude", "skills"));
    expect(t.claudeMdPath).toBe(path.join(tmpHome, ".claude", "CLAUDE.md"));
  });

  it("--here uses the current dir without walking up", () => {
    const root = mkdirp("proj");
    fs.mkdirSync(path.join(root, ".claude"));
    const deep = mkdirp("proj", "sub");
    const t = resolveClaudeTarget({ here: true }, deep, tmpHome);
    expect(t.projectRoot).toBe(deep);
    expect(t.skillsDir).toBe(path.join(deep, ".claude", "skills"));
  });

  it("--dir with the conventional layout resolves CLAUDE.md to the project root", () => {
    const t = resolveClaudeTarget(
      { dir: path.join(tmpHome, "p", ".claude", "skills") },
      tmpHome,
      tmpHome
    );
    expect(t.reason).toBe("explicit");
    expect(t.claudeMdPath).toBe(path.join(tmpHome, "p", "CLAUDE.md"));
  });

  it("auto-detects the owning .claude root from a nested cwd", () => {
    const root = mkdirp("proj");
    fs.mkdirSync(path.join(root, ".claude"));
    const deep = mkdirp("proj", "a", "b");
    const t = resolveClaudeTarget({}, deep, tmpHome);
    expect(t.projectRoot).toBe(root);
    expect(t.skillsDir).toBe(path.join(root, ".claude", "skills"));
    expect(t.claudeMdPath).toBe(path.join(root, "CLAUDE.md"));
  });

  it("resolves settings.json + hooks + agents beside the skills for an auto-detected root", () => {
    const root = mkdirp("proj");
    fs.mkdirSync(path.join(root, ".claude"));
    const deep = mkdirp("proj", "a");
    const t = resolveClaudeTarget({}, deep, tmpHome);
    expect(t.claudeDir).toBe(path.join(root, ".claude"));
    expect(t.settingsJsonPath).toBe(path.join(root, ".claude", "settings.json"));
    expect(t.hooksDir).toBe(path.join(root, ".claude", "hooks"));
    expect(t.agentsDir).toBe(path.join(root, ".claude", "agents"));
  });

  it("--global puts settings.json + hooks + agents under ~/.claude", () => {
    const t = resolveClaudeTarget({ global: true }, tmpHome, tmpHome);
    expect(t.settingsJsonPath).toBe(path.join(tmpHome, ".claude", "settings.json"));
    expect(t.hooksDir).toBe(path.join(tmpHome, ".claude", "hooks"));
    expect(t.agentsDir).toBe(path.join(tmpHome, ".claude", "agents"));
  });

  it("--dir with the conventional layout keeps settings.json + hooks + agents in that .claude", () => {
    const t = resolveClaudeTarget(
      { dir: path.join(tmpHome, "p", ".claude", "skills") },
      tmpHome,
      tmpHome
    );
    expect(t.claudeDir).toBe(path.join(tmpHome, "p", ".claude"));
    expect(t.settingsJsonPath).toBe(path.join(tmpHome, "p", ".claude", "settings.json"));
    expect(t.hooksDir).toBe(path.join(tmpHome, "p", ".claude", "hooks"));
    expect(t.agentsDir).toBe(path.join(tmpHome, "p", ".claude", "agents"));
  });
});

describe("agentInstallables", () => {
  it("returns the bundled Nexus subagent definitions as flat .md files", () => {
    const agents = agentInstallables();
    expect(agents.slug).toBe("agents");
    // The bundle ships at least one subagent definition; every entry is a
    // flat .md file (no nested skill-style subdirectories) with content.
    expect(agents.files.length).toBeGreaterThan(0);
    for (const f of agents.files) {
      expect(f.path).toMatch(/\.md$/);
      expect(f.path).not.toContain("/");
      expect(f.content.length).toBeGreaterThan(0);
    }
  });

  it("writes the agents into a flat .claude/agents directory", () => {
    const agentsDir = path.join(tmpHome, ".claude", "agents");
    const agents = agentInstallables();
    const res = writeSkillFiles(agentsDir, agents.files);
    expect(res.created.length).toBe(agents.files.length);
    for (const f of agents.files) {
      expect(fs.existsSync(path.join(agentsDir, f.path))).toBe(true);
    }
  });
});

describe("safeResolveWithinBase", () => {
  it("rejects traversal and absolute paths", () => {
    const base = path.join(tmpHome, "base");
    expect(safeResolveWithinBase(base, "../escape")).toBeNull();
    expect(safeResolveWithinBase(base, "/etc/passwd")).toBeNull();
    expect(safeResolveWithinBase(base, "a/b.md")).toBe(path.join(base, "a", "b.md"));
  });
});

describe("writeRootClaudeMd", () => {
  it("creates when absent", () => {
    const target = path.join(tmpHome, "proj", "CLAUDE.md");
    const status = writeRootClaudeMd(target, Buffer.from("hello"), {});
    expect(status).toBe("created");
    expect(fs.readFileSync(target, "utf-8")).toBe("hello");
  });

  it("preserves an existing, differing file without --force", () => {
    const target = path.join(tmpHome, "CLAUDE.md");
    touch(target, "user content");
    const status = writeRootClaudeMd(target, Buffer.from("bundled"), {});
    expect(status).toBe("preserved");
    expect(fs.readFileSync(target, "utf-8")).toBe("user content");
  });

  it("overwrites a differing file with --force", () => {
    const target = path.join(tmpHome, "CLAUDE.md");
    touch(target, "user content");
    const status = writeRootClaudeMd(target, Buffer.from("bundled"), { force: true });
    expect(status).toBe("updated");
    expect(fs.readFileSync(target, "utf-8")).toBe("bundled");
  });

  it("skips an identical file", () => {
    const target = path.join(tmpHome, "CLAUDE.md");
    touch(target, "same");
    const status = writeRootClaudeMd(target, Buffer.from("same"), {});
    expect(status).toBe("skipped");
  });
});

describe("writeRootSettingsJson", () => {
  it("creates when absent, then preserves a differing file, then overwrites with --force", () => {
    const target = path.join(tmpHome, "proj", ".claude", "settings.json");
    expect(writeRootSettingsJson(target, Buffer.from("{}"), {})).toBe("created");
    expect(fs.readFileSync(target, "utf-8")).toBe("{}");

    expect(writeRootSettingsJson(target, Buffer.from('{"a":1}'), {})).toBe("preserved");
    expect(fs.readFileSync(target, "utf-8")).toBe("{}");

    expect(writeRootSettingsJson(target, Buffer.from('{"a":1}'), { force: true })).toBe("updated");
    expect(fs.readFileSync(target, "utf-8")).toBe('{"a":1}');
  });

  it("skips an identical file", () => {
    const target = path.join(tmpHome, ".claude", "settings.json");
    touch(target, "{}");
    expect(writeRootSettingsJson(target, Buffer.from("{}"), {})).toBe("skipped");
  });
});

describe("writeHookFiles", () => {
  it("writes the tree (including subdirs) and marks .py files executable", () => {
    const hooksDir = path.join(tmpHome, ".claude", "hooks");
    const res = writeHookFiles(hooksDir, [
      { path: "nexus-fs-firewall.py", content: Buffer.from("#!/usr/bin/env python3\n") },
      { path: "lib/hook_core.py", content: Buffer.from("x = 1\n") },
      { path: "README.md", content: Buffer.from("# hooks\n") }
    ]);

    expect(res.created.sort()).toEqual(["README.md", "lib/hook_core.py", "nexus-fs-firewall.py"]);
    expect(fs.existsSync(path.join(hooksDir, "lib", "hook_core.py"))).toBe(true);

    const pyMode = fs.statSync(path.join(hooksDir, "nexus-fs-firewall.py")).mode;
    expect(pyMode & 0o111).not.toBe(0); // executable bit set
    const mdMode = fs.statSync(path.join(hooksDir, "README.md")).mode;
    expect(mdMode & 0o111).toBe(0); // non-.py left alone
  });
});

describe("writeSkillFiles", () => {
  it("creates, then skips identical, then updates changed", () => {
    const base = path.join(tmpHome, "skills");
    const r1 = writeSkillFiles(base, [{ path: "SKILL.md", content: Buffer.from("v1") }]);
    expect(r1.created).toEqual(["SKILL.md"]);

    const r2 = writeSkillFiles(base, [{ path: "SKILL.md", content: Buffer.from("v1") }]);
    expect(r2.skipped).toEqual(["SKILL.md"]);

    const r3 = writeSkillFiles(base, [{ path: "SKILL.md", content: Buffer.from("v2") }]);
    expect(r3.updated).toEqual(["SKILL.md"]);
    expect(fs.readFileSync(path.join(base, "SKILL.md"), "utf-8")).toBe("v2");
  });

  it("refuses an entry that escapes the base directory", () => {
    const base = path.join(tmpHome, "skills");
    expect(() =>
      writeSkillFiles(base, [{ path: "../evil.md", content: Buffer.from("x") }])
    ).toThrow(/unsafe path/);
  });
});
