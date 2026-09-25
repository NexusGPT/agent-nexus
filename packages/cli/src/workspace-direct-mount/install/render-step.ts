import { MANAGED_RCLONE } from "../managed-rclone";
import { FUSE_T_PIN, fuseTPkgName, fuseTPkgUrl, RCLONE_PIN, rcloneZipUrl } from "./install-pins";
import type { InstallStep, PasswordPrompt } from "./install-plan";

/** The pkg's install line, by where the password is asked. A new prompt kind must add its line here. */
const PKG_INSTALL_LINE = {
  terminal: `  sudo installer -pkg ${fuseTPkgName()} -target /   (your own sudo prompt)`,
  dialog: `  installer -pkg ${fuseTPkgName()} -target /   (as administrator: macOS shows its password window)`
} as const satisfies Record<PasswordPrompt, string>;

/**
 * The lines a person reads before answering "Install it now? [y/N]": for each
 * step, what will be downloaded, what it will be checked against, and the
 * exact command that will run. Nothing is abbreviated — the hash is printed in
 * full so it can be compared against the vendor's own list by hand.
 *
 * 🚨 THESE LINES GO TO THE PROMPT STREAM, NEVER INTO A REFUSAL'S HINT. The
 * cask line contains `brew install`, and two specs pin that the darwin install
 * hint never does (`mount-registry.test.ts`, `workspace-mount-collision.test.ts`):
 * that hint must keep saying "not Homebrew's rclone". A rendered step is a
 * conversation with a person, printed by `promptLine`; the hint is the text a
 * script sees on refusal. Mixing them reds both specs and confuses the reader.
 */
export function renderStep(step: InstallStep): readonly string[] {
  switch (step.kind) {
    case "rclone-zip":
      return [
        `rclone ${RCLONE_PIN.version} (${step.target}), the official build:`,
        `  download ${rcloneZipUrl(step.target)}`,
        `  verify   sha256 ${RCLONE_PIN.sha256[step.target]}`,
        `  place    ${MANAGED_RCLONE}   (no sudo; a Homebrew rclone, if any, stays untouched)`
      ];
    case "fuse-t-cask":
      // Brew installs the tap's CURRENT release, checked against the tap's own
      // hash — not this CLI's pin — so the line must not promise a version.
      return [
        "FUSE-T, a FUSE library with no kernel extension, the Homebrew tap's current release:",
        `  brew install ${FUSE_T_PIN.cask}   (brew verifies it and asks for your password)`
      ];
    case "fuse-t-pkg":
      return [
        `FUSE-T ${FUSE_T_PIN.version}, a FUSE library with no kernel extension:`,
        `  download ${fuseTPkgUrl()}`,
        `  verify   sha256 ${FUSE_T_PIN.sha256}`,
        PKG_INSTALL_LINE[step.password]
      ];
    default:
      return step satisfies never;
  }
}

/**
 * What a person should know about a step that the commands do not say. Said
 * once, at install time, and in --help; a user who already has FUSE-T reads it
 * there. Not threaded through the mount footer: three more signatures for one
 * dim line. debt: the read-only caveat is not shown per mount; add it when a
 * second per-FUSE-layer note appears.
 */
export function stepNotes(step: InstallStep): readonly string[] {
  switch (step.kind) {
    case "rclone-zip":
      // Linux has FUSE in the kernel but the mount still needs its user-space
      // half, which this CLI does not install (the package differs by distro).
      return step.target.startsWith("linux")
        ? ["the drive also needs FUSE 3 — on Debian or Ubuntu: sudo apt-get install fuse3"]
        : [];
    case "fuse-t-cask":
    case "fuse-t-pkg":
      return [
        "FUSE-T mounts through an NFS loopback, so a read-only drive fails writes SILENTLY, and macOS may",
        'ask you to allow "Network Volumes" for your terminal app before a folder reads.',
        "It is closed-source with one maintainer; macFUSE stays the manual fallback and is never installed here."
      ];
    default:
      return step satisfies never;
  }
}
