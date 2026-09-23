import fs from "node:fs";

import { isNoSuchFile } from "./is-no-such-file";
import type { MountSession } from "./mount-session";
import { parseAwsConfig } from "./parse-aws-config";
import { sessionPathsFor } from "./session-paths";

export type RefreshPathProbe =
  | { readonly ok: true }
  | { readonly ok: false; readonly problem: string };

/**
 * Is the mount's refresh path usable, without minting anything? `aws.config`
 * carries the line this CLI writes for this mount, and the node binary and CLI
 * entry that line names are still where it says. `mount` runs this before
 * spawning rclone, `credential-process --check` on demand, and `status` on every
 * direct row — one probe, so the three cannot disagree about what "usable" is.
 */
export function checkRefreshPath(session: Pick<MountSession, "mountId">): RefreshPathProbe {
  const paths = sessionPathsFor(session.mountId);
  let text: string;
  try {
    text = fs.readFileSync(paths.awsConfigFile, "utf-8");
  } catch (error) {
    const state = isNoSuchFile(error) ? "missing" : "unreadable";
    return { ok: false, problem: `${paths.awsConfigFile} ${state}` };
  }
  const line = parseAwsConfig(text);
  if (line === null || line.mountId !== session.mountId) {
    return {
      ok: false,
      problem: `${paths.awsConfigFile} does not carry the credential_process line this CLI writes for mount ${session.mountId}`
    };
  }
  // node EXECUTES `execPath` and READS `entry`, so the two are checked for the
  // access each one actually needs.
  const probes = [
    { what: "node", target: line.execPath, mode: fs.constants.X_OK },
    { what: "the CLI entry", target: line.entry, mode: fs.constants.R_OK }
  ];
  for (const probe of probes) {
    try {
      fs.accessSync(probe.target, probe.mode);
    } catch {
      return {
        ok: false,
        problem: `${probe.what} at ${probe.target} missing or not usable (node or the CLI moved since the mount)`
      };
    }
  }
  return { ok: true };
}
