/**
 * `which -a <name>` IN NODE, PLUS THE VERSION EACH HIT REPORTS.
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
 * clean upgrade, and the next run was still the old build. The whole answer is
 * in the RESOLUTION LIST rather than in the first hit, which is why this family
 * returns every row in the order a shell searches them.
 *
 * ── WHERE EACH PART LIVES ───────────────────────────────────────────────────
 *
 * This file is the entry point and declares nothing of its own, so every
 * importer keeps one import path while each concern stays its own module. The
 * reasoning that used to sit in this header moved WITH the code it is about:
 *
 *   `.model.ts`       the candidate shape and the injectable probe signature
 *   `.lookup.ts`      the PATH walk, and the three things a child process
 *                     cannot see about an interactive shell
 *   `.probe.ts`       running ONE binary — the family's only child process
 *   `.candidates.ts`  the walk joined to the probe, bounded, and why the list
 *                     rather than the winner is the diagnostic
 *   `.verdict.ts`     the four outcomes an install can have, and the judge
 *   `.format.ts`      the list as a reader sees it, one line per entry
 */

export { resolveCandidates } from "./resolve-on-path.candidates";
export { formatResolutionList } from "./resolve-on-path.format";
export { resolveOnPath } from "./resolve-on-path.lookup";
export type { PathCandidate, VersionProbe } from "./resolve-on-path.model";
export { parseReportedVersion, probeVersion } from "./resolve-on-path.probe";
export { judgeResolution, type UpgradeVerdict } from "./resolve-on-path.verdict";
