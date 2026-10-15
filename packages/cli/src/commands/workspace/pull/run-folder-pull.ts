import { EXIT_CODES } from "../../../exit-codes";
import { color, isJsonMode, printSuccess } from "../../../output";
import { pullFolder } from "./pull-folder";
import type { PullTarget } from "./pull-target";

/** The whole folder as one ZIP, unpacked in place under `--out`. */
export async function runFolderPull(t: PullTarget, keepZip: boolean): Promise<number> {
  const archive = await pullFolder(t.client, t.slug, t.folder, t.out, {
    workspaceId: t.workspaceId,
    keepZip
  });
  printSuccess(`Pulled "${t.slug}${t.folder === "" ? "" : `:${t.folder}`}" into ${t.out}`, {
    bytes: archive.bytes,
    ...(archive.kept ? { zip: archive.zip } : {})
  });
  if (archive.kept && !keepZip && !isJsonMode()) {
    console.log(color.yellow(`  The archive could not be removed and was left at ${archive.zip}`));
  }
  return EXIT_CODES.success;
}
