import { resolveOnPath } from "./resolve-on-path.lookup";
import type { PathCandidate, VersionProbe } from "./resolve-on-path.model";
import { probeVersion } from "./resolve-on-path.probe";

/**
 * The PATH walk and the per-binary probe, joined into one list.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A PACKAGE MANAGER EXITING 0 IS A CLAIM ABOUT A DIRECTORY, NEVER ABOUT THE
 *    COMMAND YOUR SHELL RUNS. THE TWO ARE ROUTINELY DIFFERENT MACHINES' WORTH
 *    OF DIFFERENT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus upgrade` printed "Successfully upgraded to <latest>." whenever the
 * install command exited 0, and it never re-read anything. So an install that
 * genuinely succeeded INTO A PREFIX THE SHELL DOES NOT SEARCH FIRST reported a
 * clean upgrade, and the next run was still the old build. The CEO sat in that
 * loop for days: run it, be told it worked, still be on 0.22.
 *
 * The whole answer is in the RESOLUTION LIST rather than in the first hit.
 * `which nexus` prints the winner, which is the entry that is NOT the problem;
 * the shadowing entry and the new install are the second and third rows, and
 * they are invisible unless every row is printed. So this function returns the
 * full list, in the order a shell searches it, and the caller prints all of it.
 */

/**
 * The probe is bounded to the first this many entries. A PATH with dozens of
 * hits is pathological, and spawning one process per entry to render a
 * diagnostic is a cost the diagnostic does not need to pay.
 */
const PROBE_LIMIT = 6;

/** The full resolution list for `name`, each entry probed. */
export function resolveCandidates(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  probe: VersionProbe = probeVersion
): PathCandidate[] {
  return resolveOnPath(name, env).map((found, index) => {
    if (index >= PROBE_LIMIT) {
      return { path: found, version: null, failure: "not probed — too many entries on PATH" };
    }
    const { version, failure } = probe(found);
    return { path: found, version, failure };
  });
}
