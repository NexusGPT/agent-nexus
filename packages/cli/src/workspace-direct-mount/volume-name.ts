import { type MountPlatform, mountPlatformOf } from "./mount-platform";

/**
 * The longest volume name the drive is labelled with. rclone sanitises only its
 * DEFAULT volname, so a name the CLI passes is the CLI's to bound.
 */
export const VOLUME_NAME_MAX_CHARS = 64;

/** A WinFsp volume label holds 32 UTF-16 units, one of them its terminator. */
export const WIN32_LABEL_MAX_UNITS = 31;

function capCodePoints(name: string, max: number): string {
  return [...name].slice(0, max).join("");
}

/**
 * A label Explorer can hold: at most {@link WIN32_LABEL_MAX_UNITS} UTF-16 units,
 * cut at a code point so a character is never split in two.
 */
export function win32VolumeLabel(name: string): string {
  let label = "";
  for (const character of name) {
    if (label.length + character.length > WIN32_LABEL_MAX_UNITS) break;
    label += character;
  }
  return label.trim();
}

const LABEL_CAP_FOR = {
  darwin: (name) => capCodePoints(name, VOLUME_NAME_MAX_CHARS),
  linux: (name) => capCodePoints(name, VOLUME_NAME_MAX_CHARS),
  win32: (name) => win32VolumeLabel(capCodePoints(name, VOLUME_NAME_MAX_CHARS))
} as const satisfies Record<MountPlatform, (name: string) => string>;

/**
 * The drive's label. rclone sanitises only its DEFAULT volname — which would be
 * the remote string, bucket included — so a name the CLI passes is stripped
 * here: `:` and `/` are path separators to macOS, runs of whitespace collapse,
 * and the length is capped per platform. The org name is appended so two
 * organizations mounting a same-named workspace get two labels.
 *
 * The cap counts CODE POINTS, not UTF-16 units. `slice` cuts units, so a name
 * whose boundary falls inside a surrogate pair — any emoji or astral character
 * sitting on the limit — would end in half a character: invalid UTF-8 for the
 * FUSE layer, a lone `\udXXX` escape inside `session.json` that every later read
 * carries forward, and a replacement glyph in the notification title. Spreading
 * the string iterates by code point, which cannot split one. Windows then cuts
 * again to what a WinFsp label holds.
 */
export function toVolumeName(
  workspaceName: string,
  orgName?: string,
  platform: MountPlatform = mountPlatformOf(process.platform)
): string {
  const label = orgName === undefined ? workspaceName : `${workspaceName} (${orgName})`;
  const cleaned = label
    .replace(/[:/]/g, " ")
    .replace(/[\p{Cc}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const named = cleaned === "" ? "Nexus workspace" : cleaned;
  return LABEL_CAP_FOR[platform](named).trim();
}
