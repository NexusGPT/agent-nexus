import { parseWorkspaceSpec } from "../../../util/workspace-spec";

/**
 * `<slug>` or `<slug>:<folder>` — the workspace and the folder inside it the
 * sources land under. `pull`'s `parseSource` is the same parse naming the same
 * string the `folder` it reads from; `util/workspace-spec.ts` owns it.
 */
export function parseDestination(spec: string): { slug: string; prefix: string } {
  const { slug, folder } = parseWorkspaceSpec(spec);
  return { slug, prefix: folder };
}
