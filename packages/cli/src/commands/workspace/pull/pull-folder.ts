import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { createClient } from "../../../client";
import { failure } from "../../../errors";
import { unpackCommand } from "./unpack-command";
import { writeBody } from "./write-body";

/** The folder as one ZIP, saved then unpacked in place; the ZIP is removed unless asked to stay. */
export async function pullFolder(
  client: ReturnType<typeof createClient>,
  slug: string,
  folder: string,
  out: string,
  opts: { workspaceId?: string; keepZip: boolean }
): Promise<{ zip: string; bytes: number; kept: boolean }> {
  const res = await client.workspaces.downloadFolderArchive(slug, {
    path: folder === "" ? undefined : folder,
    workspaceId: opts.workspaceId
  });
  const zip = path.join(out, `${folder === "" ? slug : path.basename(folder)}.zip`);
  const bytes = await writeBody(res.body, zip);
  const unpack = unpackCommand(process.platform, zip, out);
  try {
    execFileSync(unpack.file, unpack.args, { stdio: "pipe" });
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : "";
    throw failure(
      "local-failed",
      `Could not unpack ${zip} with ${unpack.file}${detail}`,
      `The archive is intact at ${zip}; unpack it by hand, or install ${unpack.file}.`
    );
  }
  if (opts.keepZip) return { zip, bytes, kept: true };
  // Every file is already on disk; a zip that cannot be removed (an indexer or
  // scanner holding it) is a leftover to mention, never a failed pull.
  try {
    fs.unlinkSync(zip);
  } catch {
    return { zip, bytes, kept: true };
  }
  return { zip, bytes, kept: false };
}
