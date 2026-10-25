/**
 * The two third-party artifacts the mount CLI can install for the user, pinned
 * by version AND by the sha256 of the bytes. A download that does not hash to
 * the pin is refused before anything is written, so the CLI never runs or
 * installs bytes nobody looked at.
 *
 * Both pins were taken from the vendors' own sources and checked against the
 * real artifacts the same day:
 *   rclone  https://downloads.rclone.org/v1.74.4/SHA256SUMS; the osx-arm64 zip
 *           downloaded and hashed on 2026-09-23, the two Windows zips on
 *           2026-09-28: each matched its SHA256SUMS line.
 *   FUSE-T  the GitHub release asset digest for 1.2.7, the Homebrew cask's own
 *           sha256 line, and the pkg downloaded and hashed: all three matched;
 *           the pkg is signed by an Apple developer certificate and notarized.
 *   WinFsp  lives in `winfsp-pin.ts`, the same rule.
 *
 * To bump: change the version, re-fetch the vendor's hash list, replace every
 * hash from it, and download one artifact to confirm the bytes. Never copy a
 * hash from a chat, a ticket or a review.
 *
 * debt: hand-refreshed pins, so the CLI can sit one rclone minor behind the
 *       vendor; refresh when a preflight problem the pinned version cannot fix
 *       is reported, or when either vendor publishes a security fix.
 */

/** The six builds rclone publishes that the CLI can mount with. */
export const RCLONE_TARGETS = [
  "osx-arm64",
  "osx-amd64",
  "linux-amd64",
  "linux-arm64",
  "windows-amd64",
  "windows-arm64"
] as const;
export type RcloneTarget = (typeof RCLONE_TARGETS)[number];

export const RCLONE_PIN = {
  version: "1.74.4",
  sha256: {
    "osx-arm64": "c2100e2d4a4b3be04c55cd45380cafe7647e1ad772bb055f52f00876ed701167",
    "osx-amd64": "4188aa84043d7a6240912923f47639a9d2da21f3b40a521c065c8d92e66563f6",
    "linux-amd64": "fe435e0c36228e7c2f116a8701f01127bb1f694005fc11d1f27186c8bca4115d",
    "linux-arm64": "97685285c9ad6a0cf17d5844115d2a67245af6444db672187074bd9c358de419",
    "windows-amd64": "ef097ef9de37a57feb7d9f9c7afb34148ad3c65be8025f1d8f7f521554a701ea",
    "windows-arm64": "72194ad0aaf210d7a55808801191fecc7e175444dab7be7491b7a63074521f3a"
  }
} as const satisfies { readonly version: string; readonly sha256: Record<RcloneTarget, string> };

/** The binary's file name inside each zip: Windows builds carry `.exe`, the others none. */
export const RCLONE_MEMBER_FILE = {
  "osx-arm64": "rclone",
  "osx-amd64": "rclone",
  "linux-amd64": "rclone",
  "linux-arm64": "rclone",
  "windows-amd64": "rclone.exe",
  "windows-arm64": "rclone.exe"
} as const satisfies Record<RcloneTarget, "rclone" | "rclone.exe">;

/** `rclone-v1.74.4-osx-arm64.zip` — the file name the vendor publishes. */
export function rcloneZipName(target: RcloneTarget): string {
  return `rclone-v${RCLONE_PIN.version}-${target}.zip`;
}

export function rcloneZipUrl(target: RcloneTarget): string {
  return `https://downloads.rclone.org/v${RCLONE_PIN.version}/${rcloneZipName(target)}`;
}

/** The path of the binary inside the zip: one folder named after the zip, then the binary. */
export function rcloneZipMember(target: RcloneTarget): string {
  return `rclone-v${RCLONE_PIN.version}-${target}/${RCLONE_MEMBER_FILE[target]}`;
}

export const FUSE_T_PIN = {
  version: "1.2.7",
  sha256: "6a29c747e61a86a405a189efc3de42812d73147135f93a1bb0624c1e7b90e654",
  /** The Homebrew cask, tap included, so `brew install` needs no separate `brew tap`. */
  cask: "macos-fuse-t/homebrew-cask/fuse-t"
} as const;

export function fuseTPkgName(): string {
  return `fuse-t-macos-installer-${FUSE_T_PIN.version}.pkg`;
}

export function fuseTPkgUrl(): string {
  return `https://github.com/macos-fuse-t/fuse-t/releases/download/${FUSE_T_PIN.version}/${fuseTPkgName()}`;
}
