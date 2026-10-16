import type { PathCandidate } from "./resolve-on-path.model";
import { compareSemver } from "./version-check";

/**
 * What the resolution list says about an install that just claimed to succeed.
 *
 * Four outcomes, and only ONE of them is an upgrade. The other three are all
 * "the install worked and your shell did not notice", which is one sentence in
 * English and three genuinely different repairs.
 */
export type UpgradeVerdict =
  /** The command a shell resolves reports the version we installed, or newer. */
  | { readonly kind: "verified"; readonly binary: string; readonly version: string }
  /** It resolves, it runs, and it is OLDER. Something on PATH shadows the install. */
  | { readonly kind: "shadowed"; readonly binary: string; readonly version: string }
  /** It resolves and will not tell us its version — usually a broken shim. */
  | { readonly kind: "unreadable"; readonly binary: string; readonly failure: string }
  /** Nothing by that name is on PATH at all — npx, a vendored copy, a direct path. */
  | { readonly kind: "unresolved" };

/**
 * Judge a resolution list against the version that was just installed.
 *
 * The FIRST entry decides, because it is the only one a shell will run. The
 * rest are printed for the reader, never weighed here — a newer copy sitting in
 * position two is precisely the bug, not a mitigation of it.
 *
 * `>= 0` rather than `===` so a machine already carrying a NEWER build than the
 * registry's `latest` is not reported as shadowed. That is a real state on any
 * box that installed a pre-release, and calling it a failure would send someone
 * to repair a PATH that is correct.
 */
export function judgeResolution(
  installed: string,
  candidates: readonly PathCandidate[]
): UpgradeVerdict {
  const first = candidates[0];
  if (!first) return { kind: "unresolved" };

  if (first.version === null) {
    return {
      kind: "unreadable",
      binary: first.path,
      failure: first.failure ?? "printed no version"
    };
  }

  return compareSemver(first.version, installed) >= 0
    ? { kind: "verified", binary: first.path, version: first.version }
    : { kind: "shadowed", binary: first.path, version: first.version };
}
