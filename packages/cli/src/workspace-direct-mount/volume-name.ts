/**
 * The longest volume name the drive is labelled with. rclone sanitises only its
 * DEFAULT volname, so a name the CLI passes is the CLI's to bound.
 */
export const VOLUME_NAME_MAX_CHARS = 64;

/**
 * The Finder label. rclone sanitises only its DEFAULT volname — which would be
 * the remote string, bucket included — so a name the CLI passes is stripped
 * here: `:` and `/` are path separators to macOS, runs of whitespace collapse,
 * and the length is capped. The org name is appended so two organizations
 * mounting a same-named workspace get two labels.
 *
 * The cap counts CODE POINTS, not UTF-16 units. `slice` cuts units, so a name
 * whose boundary falls inside a surrogate pair — any emoji or astral character
 * sitting on the limit — would end in half a character: invalid UTF-8 for the
 * FUSE layer, a lone `\udXXX` escape inside `session.json` that every later read
 * carries forward, and a replacement glyph in the notification title. Spreading
 * the string iterates by code point, which cannot split one.
 */
export function toVolumeName(workspaceName: string, orgName?: string): string {
  const label = orgName === undefined ? workspaceName : `${workspaceName} (${orgName})`;
  const cleaned = label
    .replace(/[:/]/g, " ")
    .replace(/[\p{Cc}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const named = cleaned === "" ? "Nexus workspace" : cleaned;
  return [...named].slice(0, VOLUME_NAME_MAX_CHARS).join("").trim();
}
