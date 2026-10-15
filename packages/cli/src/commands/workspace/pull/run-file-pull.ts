import { EXIT_CODES } from "../../../exit-codes";
import { color, isJsonMode, printSuccess } from "../../../output";
import { pullFile } from "./pull-file";
import type { PullTarget } from "./pull-target";

function joinRemote(folder: string, name: string): string {
  return folder === "" ? name : `${folder}/${name}`;
}

type PulledFile = Awaited<ReturnType<typeof pullFile>>;

export async function runFilePull(t: PullTarget, files: readonly string[]): Promise<number> {
  // Every link first, so a file that does not exist refuses the whole run
  // before any byte lands — "fails loud, not partial" starts here. A link is
  // not a download: nothing is on disk yet, and the server has written nothing.
  const links = await Promise.all(
    files.map(async (file) => {
      const remotePath = joinRemote(t.folder, file);
      const { url } = await t.client.workspaces.getFileUrl(t.slug, remotePath, {
        workspaceId: t.workspaceId
      });
      return { path: remotePath, url };
    })
  );
  // The downloads are settled TOGETHER: `Promise.all` would print the first
  // failure while its siblings kept streaming and landed files after the
  // document was written. Every download finishes before anything is said, and
  // a failure names what landed beside it.
  const settled = await Promise.allSettled(links.map((link) => pullFile(link, t.out)));
  const failed = settled.find(
    (entry): entry is PromiseRejectedResult => entry.status === "rejected"
  );
  if (failed !== undefined) {
    const landed = settled
      .filter((entry): entry is PromiseFulfilledResult<PulledFile> => entry.status === "fulfilled")
      .map((entry) => entry.value.local);
    if (landed.length > 0 && failed.reason instanceof Error) {
      failed.reason.message += ` (already on disk: ${landed.join(", ")})`;
    }
    throw failed.reason;
  }
  const pulled = settled.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : []));
  printSuccess(
    `Pulled ${pulled.length} file${pulled.length === 1 ? "" : "s"} from "${t.slug}" into ${t.out}`,
    { files: pulled.map((entry) => entry.path) }
  );
  // Human channel only: under --json the document above is the whole of stdout.
  if (!isJsonMode()) {
    for (const entry of pulled) console.log(color.dim(`  ${entry.local}  (${entry.bytes} B)`));
  }
  return EXIT_CODES.success;
}
