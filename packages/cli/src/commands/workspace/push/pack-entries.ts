import { PACK_MAX_BYTES, PACK_MAX_FILES } from "./pack-limits";
import type { PushEntry } from "./push-plan";

/** Greedy, in order: a pack closes at {@link PACK_MAX_FILES} files or when the next file would cross {@link PACK_MAX_BYTES}. */
export function packEntries(entries: readonly PushEntry[]): PushEntry[][] {
  const packs: PushEntry[][] = [];
  let current: PushEntry[] = [];
  let bytes = 0;
  for (const entry of entries) {
    if (current.length >= PACK_MAX_FILES || bytes + entry.size >= PACK_MAX_BYTES) {
      packs.push(current);
      current = [];
      bytes = 0;
    }
    current.push(entry);
    bytes += entry.size;
  }
  if (current.length > 0) packs.push(current);
  return packs;
}
