import fs from "node:fs";
import path from "node:path";

import { STATE_DIR } from "../../../mount-registry";
import type { DepsIo } from "../../../workspace-direct-mount/deps-io";
import { errnoOf } from "../../../workspace-direct-mount/errno-of";

/**
 * Where a downloaded installer waits for `installer` (macOS) or `msiexec`
 * (Windows) to read it, under a per-process name; removed as soon as the
 * installer returns, whatever it answered.
 */
export const DOWNLOADS_DIR = path.join(STATE_DIR, "downloads");

/**
 * Remove a file or folder an install wrote, retrying while an antivirus holds
 * it (`maxRetries` needs `recursive`). A removal that still fails never
 * replaces the install's outcome, so the path is named on the prompt stream and left.
 */
export function removeDownload(io: DepsIo, target: string): void {
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) {
    io.promptLine(
      `note: ${target} could not be removed (${errnoOf(error) ?? "unknown"}); delete it yourself.`
    );
  }
}
