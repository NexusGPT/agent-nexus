import { isDriveLetter } from "../../../workspace-direct-mount/mount-path-key";

/**
 * What a Windows mount point names (`--at`, or the default folder when `--at`
 * is absent), read as a STRING before anything touches the
 * disk: Node's `path` binds to the host when it loads, so on Windows a rule
 * written with `path.win32` would still be the only honest one, and this file
 * needs none. A folder falls through to the caller's `path.resolve`.
 */
export type Win32MountPoint =
  | { readonly kind: "drive"; readonly letter: string }
  | { readonly kind: "folder" }
  | { readonly kind: "refused"; readonly message: string; readonly hint: string };

/**
 * Names Windows reserves in EVERY folder, whatever the extension after them;
 * the ports take the superscript digits ¹ ² ³ too.
 */
const RESERVED = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(\..*)?$/i;

export function classifyWin32MountPoint(at: string): Win32MountPoint {
  if (at === "*") {
    return refused(
      "--at * lets rclone pick a drive letter, and then status and unmount cannot find it.",
      "Name the letter: --at X:"
    );
  }
  if (isDriveLetter(at)) return { kind: "drive", letter: `${at.slice(0, 1).toUpperCase()}:` };
  if (at.includes('"')) {
    return refused(
      `The mount point ${at} holds a double quote. In PowerShell 5.1 a quoted path ending in a backslash ('C:\\my ws\\') swallows the flags after it.`,
      "Drop the trailing backslash, or quote the path without one."
    );
  }
  // Windows reads `\\`, `//`, `\/` and `/\` alike as the start of a network (UNC) path.
  if (/^[\\/]{2}/.test(at)) {
    return refused(
      `${at} is a network path, which cannot hold a mount point.`,
      "Pick a local folder or a drive letter: --at X:"
    );
  }
  for (const part of at.split(/[\\/]/)) {
    // `.` and `..` are navigation, not names; an empty part is a doubled separator.
    if (part === "" || part === "." || part === "..") continue;
    if (RESERVED.test(part) || /[. ]$/.test(part)) {
      return refused(
        `"${part}" is a name Windows reserves or silently rewrites (a device name, or a trailing dot or space).`,
        "Pick another folder name for --at."
      );
    }
  }
  return { kind: "folder" };
}

/**
 * A folder inside OneDrive would be synced by OneDrive itself: it would try to
 * upload the whole workspace a second time and fight the drive over every
 * file. The OneDrive roots are the `OneDrive*` variables Windows sets.
 */
export function insideOneDrive(resolved: string, env: NodeJS.ProcessEnv): string | null {
  const folder = resolved.toLowerCase();
  for (const [key, value] of Object.entries(env)) {
    if (!/^onedrive/i.test(key) || value === undefined || value === "") continue;
    const root = value.toLowerCase().replace(/[\\/]+$/, "");
    if (folder === root || folder.startsWith(`${root}\\`) || folder.startsWith(`${root}/`))
      return value;
  }
  return null;
}

function refused(message: string, hint: string): Win32MountPoint {
  return { kind: "refused", message, hint };
}
