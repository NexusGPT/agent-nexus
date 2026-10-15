import fs from "node:fs";
import path from "node:path";

import type { WorkspaceUploadResult } from "@agent-nexus/sdk";

import type { createClient } from "../../../client";
import type { PackOutcome } from "./pack-outcome";
import type { PushEntry } from "./push-plan";

/**
 * One pack, one request. The bytes are read here, just before they are sent,
 * and a file that cannot be read NOW (the plan admitted it; permissions or the
 * file itself changed since) is bounced as its own failure row while the rest
 * of the pack still goes up — a mailbag, so one file's fault is one file's row,
 * never a throw that reads as the request failing.
 */
export async function pushPack(
  client: ReturnType<typeof createClient>,
  slug: string,
  pack: readonly PushEntry[],
  options: { workspaceId?: string; noClobber: boolean }
): Promise<PackOutcome> {
  const files: { path: string; file: Blob; fileName: string }[] = [];
  const unreadable: WorkspaceUploadResult[] = [];
  for (const entry of pack) {
    try {
      files.push({
        path: entry.remotePath,
        file: new Blob([fs.readFileSync(entry.localPath)]),
        fileName: path.basename(entry.localPath)
      });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      unreadable.push({
        path: entry.remotePath,
        success: false,
        skipped: false,
        error: `could not read ${entry.localPath}: ${detail}`
      });
    }
  }
  const sent =
    files.length === 0
      ? { results: [], successCount: 0, failureCount: 0, skippedCount: 0 }
      : await client.workspaces.uploadBatch(slug, files, options);
  if (unreadable.length === 0) return { response: sent, localFailures: 0 };
  return {
    response: {
      ...sent,
      results: [...sent.results, ...unreadable],
      failureCount: sent.failureCount + unreadable.length
    },
    localFailures: unreadable.length
  };
}
