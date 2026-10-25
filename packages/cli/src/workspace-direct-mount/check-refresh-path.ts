import fs from "node:fs";

import type { AwsConfigInput } from "./aws-config";
import { isNoSuchFile } from "./is-no-such-file";
import { awsProfileFor } from "./mount-id";
import type { MountSession } from "./mount-session";
import { parseAwsConfig } from "./parse-aws-config";
import { sessionPathsFor } from "./session-paths";
import { parseRenewCmd } from "./win32/renew-cmd";

type Problem = { readonly ok: false; readonly problem: string };

export type RefreshPathProbe = { readonly ok: true } | Problem;

type Read<T> = { readonly ok: true; readonly value: T } | Problem;

function readText(file: string): Read<string> {
  try {
    return { ok: true, value: fs.readFileSync(file, "utf-8") };
  } catch (error) {
    const state = isNoSuchFile(error) ? "missing" : "unreadable";
    return { ok: false, problem: `${file} ${state}` };
  }
}

function notOurLine(mountId: string): Problem {
  const file = sessionPathsFor(mountId).awsConfigFile;
  return {
    ok: false,
    problem: `${file} does not carry the credential_process line this CLI writes for mount ${mountId}`
  };
}

/** The command `renew.cmd` runs, when it is exactly the file this CLI writes for this mount. */
function wrapperCommandOf(mountId: string): Read<AwsConfigInput> {
  const renewCmdFile = sessionPathsFor(mountId).renewCmdFile;
  const text = readText(renewCmdFile);
  if (!text.ok) return text;
  const input = parseRenewCmd(text.value);
  if (input === null || input.mountId !== mountId) {
    return {
      ok: false,
      problem: `${renewCmdFile} does not carry the command this CLI writes for mount ${mountId}`
    };
  }
  return { ok: true, value: input };
}

/**
 * The node binary and CLI entry the renewal runs. macOS/Linux: the line names
 * them. Windows: the line names this mount's `renew.cmd` under this mount's
 * profile, and `renew.cmd` names them.
 */
function renewalCommandOf(text: string, mountId: string): Read<AwsConfigInput> {
  const parsed = parseAwsConfig(text);
  if (parsed === null) return notOurLine(mountId);
  if (parsed.kind === "command") {
    if (parsed.input.mountId !== mountId) return notOurLine(mountId);
    return { ok: true, value: parsed.input };
  }
  if (parsed.renewCmdFile !== sessionPathsFor(mountId).renewCmdFile) return notOurLine(mountId);
  if (!text.includes(`[profile ${awsProfileFor(mountId)}]`)) return notOurLine(mountId);
  return wrapperCommandOf(mountId);
}

/**
 * Is the mount's refresh path usable, without minting anything? `aws.config`
 * carries the line this CLI writes for this mount (and on Windows, `renew.cmd`
 * the command), and the node binary and CLI entry that command names are still
 * where it says. `mount` runs this before spawning rclone,
 * `credential-process --check` on demand, and `status` on every direct row —
 * one probe, so the three cannot disagree about what "usable" is.
 */
export function checkRefreshPath(session: Pick<MountSession, "mountId">): RefreshPathProbe {
  const config = readText(sessionPathsFor(session.mountId).awsConfigFile);
  if (!config.ok) return config;
  const command = renewalCommandOf(config.value, session.mountId);
  if (!command.ok) return command;
  // node EXECUTES `execPath` and READS `entry`, so the two are checked for the
  // access each one actually needs.
  const probes = [
    { what: "node", target: command.value.execPath, mode: fs.constants.X_OK },
    { what: "the CLI entry", target: command.value.entry, mode: fs.constants.R_OK }
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
