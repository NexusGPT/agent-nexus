import { describe, expect, it } from "vitest";

import { MANAGED_RCLONE } from "../managed-rclone";
import { rcloneInstallHint } from "../rclone-install-hint";
import { FUSE_T_PIN, fuseTPkgUrl, RCLONE_PIN, rcloneZipUrl } from "./install-pins";
import { renderStep, stepNotes } from "./render-step";

describe("renderStep — what a person reads before answering the question", () => {
  it("rclone-zip names the pinned version, the exact url, the full hash and the managed path", () => {
    const lines = renderStep({ kind: "rclone-zip", target: "osx-arm64" }).join("\n");
    expect(lines).toContain(`rclone ${RCLONE_PIN.version} (osx-arm64)`);
    expect(lines).toContain(rcloneZipUrl("osx-arm64"));
    expect(lines).toContain(RCLONE_PIN.sha256["osx-arm64"]);
    expect(lines).toContain(MANAGED_RCLONE);
    expect(lines).toContain("no sudo");
  });

  it("fuse-t-cask is the one brew command, tap included, and promises no version it does not pin", () => {
    const lines = renderStep({ kind: "fuse-t-cask" }).join("\n");
    expect(lines).toContain(`brew install ${FUSE_T_PIN.cask}`);
    // brew installs the tap's current release, not FUSE_T_PIN.version.
    expect(lines).not.toContain(FUSE_T_PIN.version);
    expect(lines).toContain("current release");
  });

  it("fuse-t-pkg names the url, the full hash, and where the password is asked: sudo, or the macOS window", () => {
    const window = renderStep({ kind: "fuse-t-pkg", password: "dialog" }).join("\n");
    expect(window).toContain("macOS shows its password window");
    expect(window).not.toContain("sudo");
    const lines = renderStep({ kind: "fuse-t-pkg", password: "terminal" }).join("\n");
    expect(lines).toContain(fuseTPkgUrl());
    expect(lines).toContain(FUSE_T_PIN.sha256);
    expect(lines).toContain("sudo installer -pkg");
    expect(lines).toContain("-target /");
  });

  it("the cask line carries `brew install`, and the darwin refusal hint still does not — two different texts", () => {
    // The rendered step is prompt-stream text; the hint is what a refusal
    // prints. The pin on the hint lives in mount-registry.test.ts; this case
    // pins that the two are not the same string and must never be merged.
    expect(renderStep({ kind: "fuse-t-cask" }).join("\n")).toContain("brew install");
    expect(rcloneInstallHint("darwin")).not.toContain("brew install");
  });
});

describe("stepNotes — what the commands do not say", () => {
  it("FUSE-T steps warn about silent read-only writes and the Network Volumes permission; Linux rclone names fuse3", () => {
    for (const step of [
      { kind: "fuse-t-cask" },
      { kind: "fuse-t-pkg", password: "terminal" }
    ] as const) {
      const notes = stepNotes(step).join(" ");
      expect(notes).toContain("SILENTLY");
      expect(notes).toContain("Network Volumes");
      expect(notes).toContain("never installed here");
    }
    // macOS rclone needs no note; Linux rclone names the FUSE half it cannot install.
    expect(stepNotes({ kind: "rclone-zip", target: "osx-arm64" })).toEqual([]);
    expect(stepNotes({ kind: "rclone-zip", target: "linux-amd64" }).join(" ")).toContain(
      "sudo apt-get install fuse3"
    );
  });
});
