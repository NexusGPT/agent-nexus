import type { Engine } from "../../mount-registry";
import { color } from "../../output";

/**
 * The limit and the way around it. "workspace push" is none: it refuses every
 * file of 45 MiB or more. The direct engine signs storage requests itself, so
 * its uploads skip the gateway, and it runs on every platform.
 */
const NOTE =
  "Files over 100 MiB never finish uploading on this engine: the copy looks done, rclone keeps retrying. " +
  'Mount with "--engine direct" to write them.';

/**
 * The fact a person needs about THIS drive that no refusal would ever tell
 * them: on the rclone engine (Linux, Windows) a save goes through the Nexus
 * gateway, whose upload stops at 100 MiB, and Explorer or a file manager
 * reports the copy done while rclone keeps retrying in the background. A
 * read-only drive uploads nothing, so it gets no note.
 */
export function printMountNotes(engine: Engine, readOnly: boolean): void {
  if (engine !== "rclone" || readOnly) return;
  console.log(color.dim(`  ${NOTE}`));
}
