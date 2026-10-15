import type { PushEntry, PushPlan } from "./push-plan";
import { collectSource } from "./walk-source";

/** Move every entry whose destination an earlier entry already claimed into `duplicates`. */
function separateDuplicates(plan: PushPlan): void {
  const firstBy = new Map<string, string>();
  const unique: PushEntry[] = [];
  for (const entry of plan.entries) {
    const first = firstBy.get(entry.remotePath);
    if (first !== undefined) {
      plan.duplicates.push({ remotePath: entry.remotePath, first, second: entry.localPath });
      continue;
    }
    firstBy.set(entry.remotePath, entry.localPath);
    unique.push(entry);
  }
  plan.entries = unique;
}

/** Every file the named sources resolve to, with what was left out and why. Throws on a missing source. */
export function planPush(
  sources: readonly string[],
  prefix: string,
  includeHidden: boolean
): PushPlan {
  const plan: PushPlan = {
    entries: [],
    hiddenSkipped: 0,
    loops: [],
    oversized: [],
    duplicates: [],
    dangling: [],
    invalid: [],
    unreadable: []
  };
  for (const source of sources) collectSource(source, prefix, includeHidden, plan);
  separateDuplicates(plan);
  return plan;
}
