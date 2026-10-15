import type { WorkspaceUploadBatchResponse, WorkspaceUploadResult } from "@agent-nexus/sdk";

import type { createClient } from "../../../client";
import type { PackOutcome } from "./pack-outcome";
import { pushPack } from "./push-pack";
import type { PushEntry } from "./push-plan";

/**
 * The packs a throw never reached, reported the only honest way: every file in
 * them as a failure row carrying the error, so a `--json` reader and a human
 * both see what did NOT land next to what did.
 */
function bouncedPacks(
  packs: readonly (readonly PushEntry[])[],
  err: unknown
): WorkspaceUploadBatchResponse {
  const error = err instanceof Error ? err.message : String(err);
  const results: WorkspaceUploadResult[] = packs
    .flat()
    .map((entry) => ({ path: entry.remotePath, success: false, skipped: false, error }));
  return { results, successCount: 0, failureCount: results.length, skippedCount: 0 };
}

/**
 * Packs go up in order. A request that THROWS (auth, transport, a 5xx) is not
 * a per-file verdict: on the first pack nothing has landed, so the error
 * document with its own exit category is the whole answer and it propagates.
 * On a later pack, earlier packs ARE in the workspace, so their rows must be
 * printed — the throw becomes failure rows for that pack and every pack after
 * it, and the run stops sending, because the same request would throw again.
 */
export async function pushPacks(
  client: ReturnType<typeof createClient>,
  slug: string,
  packs: readonly (readonly PushEntry[])[],
  options: { workspaceId?: string; noClobber: boolean }
): Promise<PackOutcome[]> {
  const outcomes: PackOutcome[] = [];
  for (const [index, pack] of packs.entries()) {
    try {
      outcomes.push(await pushPack(client, slug, pack, options));
    } catch (err) {
      if (index === 0) throw err;
      outcomes.push({ response: bouncedPacks(packs.slice(index), err), localFailures: 0 });
      break;
    }
  }
  return outcomes;
}
