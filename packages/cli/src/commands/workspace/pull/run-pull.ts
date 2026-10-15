import path from "node:path";

import type { Command } from "commander";

import { createClient } from "../../../client";
import { refuse } from "../../../errors";
import { sharedWorkspaceId } from "../../workspace-mount/shared-workspace-id";
import { duplicateBaseName } from "./duplicate-base-name";
import { parseSource } from "./parse-source";
import { runFilePull } from "./run-file-pull";
import { runFolderPull } from "./run-folder-pull";

/** Everything `nexus workspace pull` reads off the command line. */
export interface PullOptions {
  out?: string;
  keepZip?: boolean;
  shared?: boolean;
}

export async function runPull(
  source: string,
  files: string[],
  opts: PullOptions,
  program: Command
): Promise<number> {
  const { slug, folder } = parseSource(source);
  const out = path.resolve(opts.out ?? ".");
  const duplicate = duplicateBaseName(files);
  if (duplicate !== undefined) {
    return refuse(
      `Two files would land on "${path.join(out, duplicate)}"`,
      "Pull them in two runs, or into two --out folders."
    );
  }
  // `--out` is created at the first successful byte (`writeBody`), never here:
  // a refused run leaves the disk as it found it.

  const client = createClient(program.optsWithGlobals());
  const workspaceId = opts.shared ? await sharedWorkspaceId(client, slug) : undefined;
  const target = { client, slug, folder, out, workspaceId };
  return files.length === 0 ? runFolderPull(target, !!opts.keepZip) : runFilePull(target, files);
}
