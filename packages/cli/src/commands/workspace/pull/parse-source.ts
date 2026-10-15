import { parseWorkspaceSpec } from "../../../util/workspace-spec";

/**
 * `<slug>` or `<slug>:<folder>` — the workspace and the folder inside it this
 * pull READS FROM. `push`'s `parseDestination` is the same parse naming the same
 * string the `prefix` it writes under; `util/workspace-spec.ts` owns it.
 */
export function parseSource(spec: string): { slug: string; folder: string } {
  return parseWorkspaceSpec(spec);
}
