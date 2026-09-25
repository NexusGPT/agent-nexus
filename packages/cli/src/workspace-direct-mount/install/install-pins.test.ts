import { describe, expect, it } from "vitest";

import {
  FUSE_T_PIN,
  fuseTPkgName,
  fuseTPkgUrl,
  RCLONE_PIN,
  RCLONE_TARGETS,
  rcloneZipMember,
  rcloneZipName,
  rcloneZipUrl
} from "./install-pins";

// A spec cannot reach the vendors, so it pins the SHAPE of the pins: a hash that
// is not 64 hex characters, or two targets sharing one hash, is a half-edited
// bump. The bytes themselves were checked by hand on the date in the docblock.
const SHA256 = /^[0-9a-f]{64}$/;

describe("install pins — the shape a bump must keep", () => {
  it("rclone: one 64-hex sha256 per target, all distinct, version in semver form", () => {
    expect(RCLONE_PIN.version).toMatch(/^\d+\.\d+\.\d+$/);
    const hashes = RCLONE_TARGETS.map((target) => RCLONE_PIN.sha256[target]);
    for (const hash of hashes) expect(hash).toMatch(SHA256);
    expect(new Set(hashes).size).toBe(RCLONE_TARGETS.length);
  });

  it("rclone: name, url and zip member all derive from the one pinned version", () => {
    expect(rcloneZipName("osx-arm64")).toBe(`rclone-v${RCLONE_PIN.version}-osx-arm64.zip`);
    expect(rcloneZipUrl("linux-amd64")).toBe(
      `https://downloads.rclone.org/v${RCLONE_PIN.version}/rclone-v${RCLONE_PIN.version}-linux-amd64.zip`
    );
    expect(rcloneZipMember("osx-amd64")).toBe(`rclone-v${RCLONE_PIN.version}-osx-amd64/rclone`);
  });

  it("FUSE-T: 64-hex sha256, semver version, pkg url built from them, cask carries its tap", () => {
    expect(FUSE_T_PIN.sha256).toMatch(SHA256);
    expect(FUSE_T_PIN.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(fuseTPkgName()).toBe(`fuse-t-macos-installer-${FUSE_T_PIN.version}.pkg`);
    expect(fuseTPkgUrl()).toBe(
      `https://github.com/macos-fuse-t/fuse-t/releases/download/${FUSE_T_PIN.version}/${fuseTPkgName()}`
    );
    // `<user>/<tap>/<cask>`: three segments, so `brew install` resolves it without a prior `brew tap`.
    expect(FUSE_T_PIN.cask.split("/")).toHaveLength(3);
    expect(FUSE_T_PIN.cask.endsWith("/fuse-t")).toBe(true);
  });
});
