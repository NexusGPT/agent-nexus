import type { createClient } from "../../client";
import type { MountTarget } from "./mount-target";
import { resolveMountTargetDetailed } from "./resolve-mount-target-detailed";

/**
 * The degrading wrapper, kept for callers that genuinely do not care WHY the
 * list was unavailable — the default bare-slug mount path, which is documented
 * above as best-effort. Anything that REPORTS a failure to the user must use
 * {@link resolveMountTargetDetailed} instead, or it will report a cause it
 * never looked at.
 */
export async function resolveMountTarget(
  client: ReturnType<typeof createClient>,
  slug: string,
  wantShared: boolean
): Promise<MountTarget | null> {
  return (await resolveMountTargetDetailed(client, slug, wantShared)).target;
}
