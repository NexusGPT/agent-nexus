import { lstatSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { cleanupTempDirs, pack, tempDir } from "./install-harness";
import { assertMirrorIsComplete, mirrorPackageInto } from "./pack-source";

/**
 * `mirrorPackageInto` is the seam `packSource()` runs against `PACKAGE_ROOT`.
 * These cases run it against throwaway fixtures instead, so a worktree's own
 * symlinked canon (`packages/cli/CLAUDE.md`, into the main checkout) never has
 * to be reproduced here to prove the behaviour.
 */

afterAll(() => {
  cleanupTempDirs();
});

/** The paths `npm pack` puts in the tarball, sorted so two trees compare cleanly. */
function packedPaths(dir: string): string[] {
  return pack(dir, tempDir("packed"))
    .manifest.files.map((file) => file.path)
    .sort();
}

describe("mirrorPackageInto", () => {
  it("reproduces a symlink to a regular file outside the root, absolute and relative alike", () => {
    const outside = tempDir("outside");
    const targetPath = join(outside, "shared.txt");
    writeFileSync(targetPath, "shared content");

    const root = tempDir("root");
    writeFileSync(join(root, "regular.txt"), "in package");
    symlinkSync(targetPath, join(root, "absolute-link.txt"));
    symlinkSync(relative(root, targetPath), join(root, "relative-link.txt"));

    const mirror = tempDir("mirror");
    mirrorPackageInto(root, mirror);

    for (const name of ["absolute-link.txt", "relative-link.txt"]) {
      const mirrored = join(mirror, name);
      expect(lstatSync(mirrored).isSymbolicLink()).toBe(true);
      expect(realpathSync(mirrored)).toBe(realpathSync(targetPath));
    }
  });

  it("packs the same files from the mirror as from the real tree", () => {
    const outside = tempDir("outside");
    writeFileSync(join(outside, "LICENSE-real.txt"), "MIT\n");
    writeFileSync(join(outside, "README-real.txt"), "# fixture\n");

    const root = tempDir("root");
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist", "index.js"), "console.log('hi');\n");
    // Symlinked, exactly like the worktree's own CLAUDE.md — `npm pack` drops a
    // symlinked file from the tarball whatever names it, README.md included.
    symlinkSync(join(outside, "LICENSE-real.txt"), join(root, "LICENSE"));
    symlinkSync(join(outside, "README-real.txt"), join(root, "README.md"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "pack-source-fixture", version: "1.0.0", files: ["dist", "LICENSE"] })
    );

    const mirror = tempDir("mirror");
    mirrorPackageInto(root, mirror);

    const paths = packedPaths(root);
    expect(packedPaths(mirror)).toEqual(paths);

    // The lists agree because both drop the symlinked files, not because both
    // are empty.
    expect(paths).toContain("dist/index.js");
    expect(paths).not.toContain("LICENSE");
    expect(paths).not.toContain("README.md");
  });

  it("throws naming a dangling symlink", () => {
    const root = tempDir("root");
    symlinkSync(join(root, "does-not-exist.txt"), join(root, "dangling.txt"));

    expect(() => mirrorPackageInto(root, tempDir("mirror"))).toThrow(
      /dangling\.txt\tNOT-A-REGULAR-FILE/
    );
  });

  it("throws naming a symlink to a directory", () => {
    const root = tempDir("root");
    const realDir = join(root, "real-dir");
    mkdirSync(realDir);
    symlinkSync(realDir, join(root, "dir-link"));

    expect(() => mirrorPackageInto(root, tempDir("mirror"))).toThrow(
      /dir-link\tNOT-A-REGULAR-FILE/
    );
  });

  it("fails completeness when a mirrored link is replaced by a regular file of the same content", () => {
    const outside = tempDir("outside");
    const targetPath = join(outside, "target.txt");
    writeFileSync(targetPath, "same bytes");

    const root = tempDir("root");
    writeFileSync(join(root, "regular.txt"), "keep");
    symlinkSync(targetPath, join(root, "linked.txt"));

    const mirror = tempDir("mirror");
    mirrorPackageInto(root, mirror);

    // Swap the reproduced link for a plain file carrying identical bytes — the
    // exact divergence `npm pack` would ship differently, since a symlinked
    // file is dropped from the tarball and a regular one is not.
    rmSync(join(mirror, "linked.txt"));
    writeFileSync(join(mirror, "linked.txt"), "same bytes");

    expect(() => assertMirrorIsComplete(root, mirror)).toThrow(/linked\.txt\tLINK:/);
  });
});
