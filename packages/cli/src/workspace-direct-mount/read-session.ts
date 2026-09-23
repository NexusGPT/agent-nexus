import fs from "node:fs";

import { isMountSession } from "./is-mount-session";
import { isNoSuchFile } from "./is-no-such-file";
import type { MountSession } from "./mount-session";
import { sessionPathsFor } from "./session-paths";

export type SessionRead =
  | { readonly ok: true; readonly session: MountSession }
  | { readonly ok: false; readonly why: "missing" | "malformed" };

/**
 * Read a mount's session. Never throws: an absent or damaged file is a typed
 * miss. Only an absent file is `missing` — one the process cannot read (a
 * directory in its place, somebody else's ownership) is a damaged mount, not an
 * unrecorded one, and is reported as such.
 */
export function readSession(mountId: string): SessionRead {
  let text: string;
  try {
    text = fs.readFileSync(sessionPathsFor(mountId).sessionFile, "utf-8");
  } catch (error) {
    return { ok: false, why: isNoSuchFile(error) ? "missing" : "malformed" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, why: "malformed" };
  }
  if (!isMountSession(parsed) || parsed.mountId !== mountId) return { ok: false, why: "malformed" };
  return { ok: true, session: parsed };
}
