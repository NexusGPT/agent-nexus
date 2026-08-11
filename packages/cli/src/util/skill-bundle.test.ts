import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";

import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";

import {
  extractPresetFromTarball,
  packSkillZip,
  presetTarballUrl,
  readSkillDirectory,
  resolvePresets,
  SKILL_PRESET_GROUPS,
  SKILL_PRESETS,
  SKILL_ZIP_LIMITS
} from "./skill-bundle";
import { readTarGz } from "./tar";

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * A tar writer, used only to build fixtures. Independent of `tar.ts`'s reader by
 * construction: agreeing about a field both sides invented would prove nothing,
 * so this writes the ustar layout straight from the spec.
 */
function makeTarGz(entries: { path: string; content: string | Buffer }[]): Buffer {
  const blocks: Buffer[] = [];

  for (const entry of entries) {
    const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content);
    const header = Buffer.alloc(512);
    header.write(entry.path, 0, 100, "utf8");
    header.write("0000644\0", 100, 8, "ascii"); // mode
    header.write("0000000\0", 108, 8, "ascii"); // uid
    header.write("0000000\0", 116, 8, "ascii"); // gid
    header.write(content.length.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
    header.write("00000000000\0", 136, 12, "ascii"); // mtime
    header.write("        ", 148, 8, "ascii"); // checksum placeholder (spaces)
    header.write("0", 156, 1, "ascii"); // type: regular file
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");

    let checksum = 0;
    for (const byte of header) checksum += byte;
    header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");

    blocks.push(header, content, Buffer.alloc((512 - (content.length % 512)) % 512));
  }

  blocks.push(Buffer.alloc(1024)); // two zero blocks terminate the archive
  return gzipSync(Buffer.concat(blocks));
}

const tempDirs: string[] = [];

function makeSkillDir(tree: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-skill-"));
  tempDirs.push(dir);
  for (const [relative, content] of Object.entries(tree)) {
    const target = path.join(dir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("readTarGz", () => {
  it("reads regular files and skips directory entries", () => {
    const entries = readTarGz(
      makeTarGz([
        { path: "repo-main/skills/pdf/SKILL.md", content: "# pdf" },
        { path: "repo-main/skills/pdf/scripts/fill.py", content: "print(1)" }
      ])
    );

    expect(entries.map((entry) => entry.path)).toEqual([
      "repo-main/skills/pdf/SKILL.md",
      "repo-main/skills/pdf/scripts/fill.py"
    ]);
    expect(entries[0].content.toString()).toBe("# pdf");
  });

  it("reads a file whose size is not a multiple of the 512-byte block", () => {
    const payload = "x".repeat(1000);
    const [entry] = readTarGz(makeTarGz([{ path: "r/SKILL.md", content: payload }]));
    expect(entry.content.toString()).toBe(payload);
  });
});

describe("resolvePresets", () => {
  it("expands a group alias", () => {
    expect(resolvePresets(["office"]).map((preset) => preset.name)).toEqual([
      "docx",
      "pdf",
      "pptx",
      "xlsx"
    ]);
  });

  it("dedupes across a group and its members, keeping request order", () => {
    expect(resolvePresets(["pptx", "office", "skill-creator"]).map((p) => p.name)).toEqual([
      "pptx",
      "docx",
      "pdf",
      "xlsx",
      "skill-creator"
    ]);
  });

  it("is case-insensitive and trims", () => {
    expect(resolvePresets([" PDF "]).map((preset) => preset.name)).toEqual(["pdf"]);
  });

  it("names the valid options when given an unknown preset", () => {
    expect(() => resolvePresets(["powerpoint"])).toThrow(/Unknown preset "powerpoint"/);
    expect(() => resolvePresets(["powerpoint"])).toThrow(/pptx/);
  });

  it("keeps every group member pointing at a real preset", () => {
    for (const members of Object.values(SKILL_PRESET_GROUPS)) {
      for (const member of members) {
        expect(SKILL_PRESETS[member]).toBeDefined();
      }
    }
  });
});

describe("presetTarballUrl", () => {
  it("builds a codeload URL and escapes the ref", () => {
    expect(presetTarballUrl("anthropics/skills", "main")).toBe(
      "https://codeload.github.com/anthropics/skills/tar.gz/main"
    );
    expect(presetTarballUrl("anthropics/skills", "refs/tags/v1.0")).toContain("refs%2Ftags%2Fv1.0");
  });

  it("rejects a repo that is not owner/name", () => {
    // Without this, a value like "../../evil" would compose into some other
    // codeload path entirely.
    expect(() => presetTarballUrl("../../evil", "main")).toThrow(/owner\/name/);
    expect(() => presetTarballUrl("anthropics", "main")).toThrow(/owner\/name/);
  });
});

describe("extractPresetFromTarball", () => {
  const tarball = makeTarGz([
    { path: "skills-main/README.md", content: "root readme" },
    { path: "skills-main/skills/pdf/SKILL.md", content: "# pdf" },
    { path: "skills-main/skills/pdf/LICENSE.txt", content: "© Anthropic" },
    { path: "skills-main/skills/pdf/scripts/fill.py", content: "print(1)" },
    { path: "skills-main/skills/pdf/.DS_Store", content: "junk" },
    { path: "skills-main/skills/docx/SKILL.md", content: "# docx" }
  ]);

  it("strips the generated root and the skill's own prefix", () => {
    expect(
      extractPresetFromTarball(tarball, "skills/pdf")
        .map((f) => f.path)
        .sort()
    ).toEqual(["LICENSE.txt", "SKILL.md", "scripts/fill.py"]);
  });

  it("carries the upstream LICENSE.txt into the bundle", () => {
    // The presets are Anthropic's materials; dropping their licence while
    // re-packaging them would strip the terms the files ship under.
    const files = extractPresetFromTarball(tarball, "skills/pdf");
    expect(files.find((file) => file.path === "LICENSE.txt")?.content.toString()).toBe(
      "© Anthropic"
    );
  });

  it("does not leak sibling skills or repository-root files", () => {
    const paths = extractPresetFromTarball(tarball, "skills/pdf").map((file) => file.path);
    expect(paths).not.toContain("README.md");
    expect(paths.some((p) => p.includes("docx"))).toBe(false);
  });

  it("explains an upstream path that no longer exists", () => {
    expect(() => extractPresetFromTarball(tarball, "skills/keynote")).toThrow(
      /"skills\/keynote" was not found/
    );
  });

  it("rejects a folder with no root SKILL.md", () => {
    const noSkillMd = makeTarGz([{ path: "skills-main/skills/pdf/readme.md", content: "x" }]);
    expect(() => extractPresetFromTarball(noSkillMd, "skills/pdf")).toThrow(/no SKILL.md/);
  });
});

describe("readSkillDirectory", () => {
  it("reads a folder whose root holds SKILL.md", () => {
    const dir = makeSkillDir({
      "SKILL.md": "# demo",
      "scripts/run.py": "print(1)"
    });
    expect(
      readSkillDirectory(dir)
        .map((file) => file.path)
        .sort()
    ).toEqual(["SKILL.md", "scripts/run.py"]);
  });

  it("unwraps a directory holding exactly one skill folder", () => {
    const dir = makeSkillDir({ "invoice-parser/SKILL.md": "# demo" });
    expect(readSkillDirectory(dir).map((file) => file.path)).toEqual(["SKILL.md"]);
  });

  it("names the candidates when a wrapper holds several skill folders", () => {
    const dir = makeSkillDir({ "a/SKILL.md": "#a", "b/SKILL.md": "#b" });
    expect(() => readSkillDirectory(dir)).toThrow(/2 of its sub-directories do \(a, b\)/);
  });

  it("says so when nothing under the directory is a skill", () => {
    const dir = makeSkillDir({ "notes.md": "hello" });
    expect(() => readSkillDirectory(dir)).toThrow(/none of its sub-directories has one either/);
  });

  it("drops OS artefacts, VCS metadata, and caches", () => {
    const dir = makeSkillDir({
      "SKILL.md": "# demo",
      ".DS_Store": "junk",
      ".git/config": "junk",
      "__pycache__/run.cpython-311.pyc": "junk",
      "node_modules/left-pad/index.js": "junk",
      "scripts/run.pyc": "junk"
    });
    expect(readSkillDirectory(dir).map((file) => file.path)).toEqual(["SKILL.md"]);
  });

  it("skips symlinks rather than following them out of the directory", () => {
    const outside = makeSkillDir({ "secret.txt": "do not package me" });
    const dir = makeSkillDir({ "SKILL.md": "# demo" });
    fs.symlinkSync(path.join(outside, "secret.txt"), path.join(dir, "linked.txt"));

    const files = readSkillDirectory(dir);
    expect(files.map((file) => file.path)).toEqual(["SKILL.md"]);
  });

  it("errors on a path that is not a directory", () => {
    const dir = makeSkillDir({ "SKILL.md": "# demo" });
    expect(() => readSkillDirectory(path.join(dir, "SKILL.md"))).toThrow(/Not a directory/);
  });

  /**
   * The root is picked with `existsSync`, which follows the link and answers
   * TRUE — but the walk skips symlinks, so the packed bundle carries every other
   * file and no `SKILL.md`. Rejecting locally is the whole point of mirroring
   * the server's limits in this module: the server's own refusal names the
   * archive, never the file.
   */
  it("rejects a root whose SKILL.md is a symlink, which packaging would drop", () => {
    const source = makeSkillDir({ "SKILL.md": "# demo" });
    const dir = makeSkillDir({ "scripts/run.py": "print(1)" });
    fs.symlinkSync(path.join(source, "SKILL.md"), path.join(dir, "SKILL.md"));

    expect(() => readSkillDirectory(dir)).toThrow(/has no SKILL\.md at its root/);
  });

  /** `existsSync` answers TRUE for a directory too, and the walk descends into it. */
  it("rejects a root whose SKILL.md is a directory", () => {
    const dir = makeSkillDir({ "SKILL.md/notes.md": "# not a skill manifest" });
    expect(() => readSkillDirectory(dir)).toThrow(/has no SKILL\.md at its root/);
  });

  /** Same trap one level down: the wrapper's single candidate is chosen the same way. */
  it("rejects an unwrapped sub-directory whose SKILL.md is a symlink", () => {
    const source = makeSkillDir({ "SKILL.md": "# demo" });
    const dir = makeSkillDir({ "invoice-parser/scripts/run.py": "print(1)" });
    fs.symlinkSync(path.join(source, "SKILL.md"), path.join(dir, "invoice-parser", "SKILL.md"));

    expect(() => readSkillDirectory(dir)).toThrow(/has no SKILL\.md at its root/);
  });
});

describe("packSkillZip", () => {
  it("packs files into an archive the server's reader accepts", async () => {
    const zip = await JSZip.loadAsync(
      packSkillZip([{ path: "SKILL.md", content: Buffer.from("# demo") }], "demo")
    );
    expect(await zip.files["SKILL.md"].async("string")).toBe("# demo");
  });

  it("rejects a file over the per-file limit, naming it", () => {
    const oversized = Buffer.alloc(SKILL_ZIP_LIMITS.maxFileBytes + 1);
    expect(() =>
      packSkillZip(
        [
          { path: "SKILL.md", content: Buffer.from("# demo") },
          { path: "assets/big.bin", content: oversized }
        ],
        "demo"
      )
    ).toThrow(/assets\/big\.bin/);
  });

  it("rejects a file count over the limit", () => {
    const files = Array.from({ length: SKILL_ZIP_LIMITS.maxFiles + 1 }, (_, i) => ({
      path: `f${i}.txt`,
      content: Buffer.from("x")
    }));
    expect(() => packSkillZip(files, "demo")).toThrow(/exceeds the 500-file limit/);
  });

  it("rejects a path longer than the server allows", () => {
    const longPath = `${"a".repeat(SKILL_ZIP_LIMITS.maxPathLength)}.md`;
    expect(() => packSkillZip([{ path: longPath, content: Buffer.from("x") }], "demo")).toThrow(
      /path longer than 255 characters/
    );
  });

  it("rejects a bundle whose PACKED size is over the upload limit", () => {
    // Random bytes, so deflate cannot shrink the archive under the cap — this
    // asserts the check runs on the ARCHIVE, not on the sum of the input files:
    // 8 MB of input sits comfortably inside the 20 MB uncompressed limit and
    // each file inside the 2 MB per-file limit, so only the upload cap can fire.
    const files = Array.from({ length: 8 }, (_, i) => ({
      path: `assets/blob-${i}.bin`,
      content: randomBytes(1024 * 1024)
    }));
    expect(() => packSkillZip(files, "demo")).toThrow(/over the 5\.0 MB upload limit/);
  });
});
