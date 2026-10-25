import fs from "node:fs";

import type { Engine } from "../../mount-registry";
import { color } from "../../output";
import { writeSecretFile } from "../../util/secret-file";
import { DIRECT_MOUNT_INTRO_MARKER } from "../../workspace-direct-mount/session-paths";
import { printMountNotes } from "./print-mount-notes";

/**
 * True exactly once per machine: the first direct mount writes the marker.
 * Owner-only like everything else under the state directory.
 */
function firstDirectMountOnThisMachine(): boolean {
  if (fs.existsSync(DIRECT_MOUNT_INTRO_MARKER)) return false;
  writeSecretFile(DIRECT_MOUNT_INTRO_MARKER, `${new Date().toISOString()}\n`);
  return true;
}

/** What every direct mount tells the user after the "Live shared drive" line. */
function printDirectMountFooter(slug: string): void {
  const onFailure =
    process.platform === "darwin"
      ? "you get a macOS notification and files show an error until it can"
      : "files show an error until it can";
  console.log(
    color.dim(
      "  Access renews itself about every hour while you use the drive — nothing to do. " +
        `If it cannot renew (offline, signed out) ${onFailure}; check with: nexus workspace status`
    )
  );
  console.log(
    color.dim(
      "  The drive does not survive logout or restart, and its renewal does not survive a reinstall of " +
        `node or this CLI. Afterwards run: nexus workspace remount ${slug}`
    )
  );
  if (process.platform === "darwin" && firstDirectMountOnThisMachine()) {
    console.log(
      color.dim(
        "  Notifications come from Terminal: if none appear, allow them in System Settings › Notifications › Terminal."
      )
    );
  }
}

/** The line every engine's mount ends with, the engine's own notes, then the direct engine's footer. */
export function printMountFooter(engine: Engine, slug: string, readOnly: boolean): void {
  console.log(
    color.dim(
      `  Live shared drive — teammates and agents share these files. Unmount: nexus workspace unmount ${slug}`
    )
  );
  printMountNotes(engine, readOnly);
  if (engine === "direct") printDirectMountFooter(slug);
}
