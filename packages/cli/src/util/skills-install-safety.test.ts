import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  commitInstallLedger,
  INSTALL_MANIFEST_BASENAME,
  installManifestPath,
  openInstallLedger,
  resolveClaudeTarget,
  writeSkillFiles
} from "./skills-install";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skills-safety-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const file = (p: string, content: string) => ({ path: p, content: Buffer.from(content) });
const read = (...segs: string[]) => fs.readFileSync(path.join(...segs), "utf-8");

// ─────────────────────────────────────────────────────────────────────────────
// --dir containment (the ~50 files that landed outside the named directory)
// ─────────────────────────────────────────────────────────────────────────────

describe("--dir is the only input", () => {
  const dirs = (target: ReturnType<typeof resolveClaudeTarget>) => [
    target.skillsDir,
    target.claudeDir,
    target.projectRoot,
    target.claudeMdPath,
    target.settingsJsonPath,
    target.hooksDir,
    target.agentsDir
  ];

  it("resolves identically from two unrelated working directories", () => {
    // The property, not an example: if ANY path were still computed from the
    // cwd, these two would differ. This is what the pre-fix code failed —
    // projectRoot, and therefore CLAUDE.md, settings.json, hooks/ and agents/,
    // were all built from process.cwd().
    const from = (cwd: string) =>
      dirs(resolveClaudeTarget({ dir: "/srv/target/skills" }, cwd, "/home/someone"));

    expect(from("/home/someone/project-a")).toEqual(from("/var/tmp/somewhere-else"));
  });

  it("contains every write inside the named directory for a non-conventional dir", () => {
    const target = resolveClaudeTarget({ dir: "/srv/target" }, "/home/someone/real-project", "/h");

    for (const p of dirs(target)) {
      expect(p.startsWith("/srv/target"), `${p} escapes --dir`).toBe(true);
    }
    expect(target.claudeMdPath).toBe(path.join("/srv/target", "CLAUDE.md"));
  });

  it("never derives a path from the current project for a non-conventional dir", () => {
    const cwd = "/home/someone/real-project";
    const target = resolveClaudeTarget({ dir: "/srv/target" }, cwd, "/h");

    // The exact damage reported: CLAUDE.md, settings.json, hooks/ and agents/
    // written into whatever project the operator happened to be standing in.
    for (const p of dirs(target)) expect(p.startsWith(cwd)).toBe(false);
  });

  it("keeps the conventional <root>/.claude/skills layout, derived from --dir", () => {
    const target = resolveClaudeTarget(
      { dir: "/srv/proj/.claude/skills" },
      "/completely/elsewhere",
      "/h"
    );

    expect(target.claudeDir).toBe("/srv/proj/.claude");
    expect(target.projectRoot).toBe("/srv/proj");
    expect(target.claudeMdPath).toBe("/srv/proj/CLAUDE.md");
    expect(target.settingsJsonPath).toBe("/srv/proj/.claude/settings.json");
    expect(target.hooksDir).toBe("/srv/proj/.claude/hooks");
    expect(target.agentsDir).toBe("/srv/proj/.claude/agents");
  });

  it("resolves a relative --dir against the cwd it was given, not process.cwd()", () => {
    const target = resolveClaudeTarget({ dir: "out/skills" }, "/srv/proj", "/h");
    expect(target.skillsDir).toBe("/srv/proj/out/skills");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The install ledger (silent overwrite of hand-edited files)
// ─────────────────────────────────────────────────────────────────────────────

describe("the install ledger", () => {
  const claudeDir = () => path.join(tmp, ".claude");
  const base = () => path.join(tmp, ".claude", "hooks");

  it("refreshes a file this CLI wrote and has not been touched since", () => {
    const first = openInstallLedger(claudeDir());
    expect(writeSkillFiles(base(), [file("guard.py", "v1")], { ledger: first }).created).toEqual([
      "guard.py"
    ]);
    commitInstallLedger(first);

    const second = openInstallLedger(claudeDir());
    const res = writeSkillFiles(base(), [file("guard.py", "v2")], { ledger: second });

    expect(res.updated).toEqual(["guard.py"]);
    expect(res.preserved).toEqual([]);
    expect(read(base(), "guard.py")).toBe("v2");
  });

  it("PRESERVES a file the user edited after the install that wrote it", () => {
    const first = openInstallLedger(claudeDir());
    writeSkillFiles(base(), [file("guard.py", "v1")], { ledger: first });
    commitInstallLedger(first);

    fs.writeFileSync(path.join(base(), "guard.py"), "the user's own guardrail");

    const second = openInstallLedger(claudeDir());
    const res = writeSkillFiles(base(), [file("guard.py", "v2")], { ledger: second });

    expect(res.preserved).toEqual(["guard.py"]);
    expect(res.updated).toEqual([]);
    expect(read(base(), "guard.py")).toBe("the user's own guardrail");
  });

  it("replaces an edited file only when --force is passed", () => {
    const first = openInstallLedger(claudeDir());
    writeSkillFiles(base(), [file("guard.py", "v1")], { ledger: first });
    commitInstallLedger(first);
    fs.writeFileSync(path.join(base(), "guard.py"), "edited");

    const second = openInstallLedger(claudeDir());
    const res = writeSkillFiles(base(), [file("guard.py", "v2")], {
      ledger: second,
      force: true
    });

    expect(res.updated).toEqual(["guard.py"]);
    expect(read(base(), "guard.py")).toBe("v2");
  });

  it("preserves a differing file in a tree installed before the ledger existed", () => {
    // No manifest anywhere: "the user edited it" and "an older CLI wrote it"
    // are indistinguishable, and only one of the two errors destroys work.
    fs.mkdirSync(base(), { recursive: true });
    fs.writeFileSync(path.join(base(), "guard.py"), "from an older CLI, possibly edited");

    const res = writeSkillFiles(base(), [file("guard.py", "v2")], {
      ledger: openInstallLedger(claudeDir())
    });

    expect(res.preserved).toEqual(["guard.py"]);
    expect(read(base(), "guard.py")).toBe("from an older CLI, possibly edited");
  });

  it("adopts an unrecognised tree through --force, and protects it from then on", () => {
    fs.mkdirSync(base(), { recursive: true });
    fs.writeFileSync(path.join(base(), "guard.py"), "legacy");

    const adopt = openInstallLedger(claudeDir());
    writeSkillFiles(base(), [file("guard.py", "v2")], { ledger: adopt, force: true });
    commitInstallLedger(adopt);

    // Now an ordinary install refreshes it — no --force needed any more.
    const next = openInstallLedger(claudeDir());
    expect(writeSkillFiles(base(), [file("guard.py", "v3")], { ledger: next }).updated).toEqual([
      "guard.py"
    ]);
  });

  it("heals a legacy tree through the files that already match the bundle", () => {
    fs.mkdirSync(base(), { recursive: true });
    fs.writeFileSync(path.join(base(), "guard.py"), "v1");

    const first = openInstallLedger(claudeDir());
    expect(writeSkillFiles(base(), [file("guard.py", "v1")], { ledger: first }).skipped).toEqual([
      "guard.py"
    ]);
    commitInstallLedger(first);

    const second = openInstallLedger(claudeDir());
    expect(writeSkillFiles(base(), [file("guard.py", "v2")], { ledger: second }).updated).toEqual([
      "guard.py"
    ]);
  });

  it("recognises a file written earlier in the SAME run", () => {
    const ledger = openInstallLedger(claudeDir());
    writeSkillFiles(base(), [file("guard.py", "v1")], { ledger });
    const res = writeSkillFiles(base(), [file("guard.py", "v2")], { ledger });
    expect(res.updated).toEqual(["guard.py"]);
  });

  it("treats a corrupt manifest as no manifest, never as a match", () => {
    const first = openInstallLedger(claudeDir());
    writeSkillFiles(base(), [file("guard.py", "v1")], { ledger: first });
    commitInstallLedger(first);
    fs.writeFileSync(installManifestPath(claudeDir()), "{ not json");

    const res = writeSkillFiles(base(), [file("guard.py", "v2")], {
      ledger: openInstallLedger(claudeDir())
    });
    expect(res.preserved).toEqual(["guard.py"]);
  });

  it("writes the manifest into the .claude directory", () => {
    const ledger = openInstallLedger(claudeDir());
    writeSkillFiles(base(), [file("guard.py", "v1")], { ledger });
    commitInstallLedger(ledger);

    const onDisk: unknown = JSON.parse(read(claudeDir(), INSTALL_MANIFEST_BASENAME));
    expect(onDisk).toMatchObject({ version: 1 });
    expect(Object.keys((onDisk as { files: Record<string, string> }).files)).toEqual([
      "hooks/guard.py"
    ]);
  });

  it("does not mark a preserved file executable", () => {
    // The +x grant runs on every entry, including skipped ones, to repair an
    // old install. A preserved file is the user's, so their mode stands.
    fs.mkdirSync(base(), { recursive: true });
    fs.writeFileSync(path.join(base(), "run.sh"), "the user's script");
    fs.chmodSync(path.join(base(), "run.sh"), 0o644);

    writeSkillFiles(base(), [file("run.sh", "#!/bin/sh\necho bundled\n")], {
      ledger: openInstallLedger(claudeDir())
    });

    expect(fs.statSync(path.join(base(), "run.sh")).mode & 0o111).toBe(0);
  });
});
