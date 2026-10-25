import { describe, expect, it } from "vitest";

import { RCLONE_MEMBER_FILE, RCLONE_PIN } from "./install-pins";
import { rcloneTargetFor, TARGET_PLATFORM } from "./rclone-target";

describe("rcloneTargetFor — platform × arch to one pinned build, or nothing to offer", () => {
  it.each([
    ["darwin", "arm64", "osx-arm64"],
    ["darwin", "x64", "osx-amd64"],
    ["linux", "x64", "linux-amd64"],
    ["linux", "arm64", "linux-arm64"],
    ["win32", "x64", "windows-amd64"],
    ["win32", "arm64", "windows-arm64"]
  ] as const)("%s/%s → %s, and that build carries a pinned hash", (platform, arch, target) => {
    expect(rcloneTargetFor(platform, arch)).toBe(target);
    // Derived, not duplicated: every answer must be a key of the pin table.
    expect(RCLONE_PIN.sha256[target]).toBeDefined();
    expect(TARGET_PLATFORM[target]).toBe(platform);
  });

  it("the Windows builds are the only ones whose binary carries .exe", () => {
    expect(RCLONE_MEMBER_FILE["windows-amd64"]).toBe("rclone.exe");
    expect(RCLONE_MEMBER_FILE["windows-arm64"]).toBe("rclone.exe");
    expect(RCLONE_MEMBER_FILE["osx-arm64"]).toBe("rclone");
    expect(RCLONE_MEMBER_FILE["linux-amd64"]).toBe("rclone");
  });

  it.each([
    ["win32", "ia32"],
    ["darwin", "ia32"],
    ["linux", "ppc64"],
    ["freebsd", "x64"]
  ] as const)("%s/%s → null: no build to offer, the manual hint stays", (platform, arch) => {
    expect(rcloneTargetFor(platform, arch)).toBeNull();
  });

  it("answers for the machine running this spec — a positive control for the table", () => {
    // This spec runs on macOS and Linux CI on x64 or arm64; a null here means
    // the table lost a row the project's own machines need.
    expect(rcloneTargetFor(process.platform, process.arch)).not.toBeNull();
  });
});
