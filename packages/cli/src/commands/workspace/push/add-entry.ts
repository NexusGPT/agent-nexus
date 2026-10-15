import fs from "node:fs";

import { remotePathRefusal } from "../../workspace-remote-path";
import { PACK_MAX_BYTES } from "./pack-limits";
import type { PushEntry, PushPlan } from "./push-plan";

export function addEntry(plan: PushPlan, entry: PushEntry): void {
  const reason = remotePathRefusal(entry.remotePath);
  if (reason !== null) {
    plan.invalid.push({ localPath: entry.localPath, remotePath: entry.remotePath, reason });
    return;
  }
  if (!isReadable(entry.localPath)) {
    plan.unreadable.push(entry.localPath);
    return;
  }
  if (entry.size >= PACK_MAX_BYTES) plan.oversized.push(entry);
  else plan.entries.push(entry);
}

function isReadable(localPath: string): boolean {
  try {
    fs.accessSync(localPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
