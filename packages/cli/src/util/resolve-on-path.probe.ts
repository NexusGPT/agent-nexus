import { spawnSync } from "node:child_process";

/**
 * Running ONE candidate and reading the version it reports.
 *
 * The spawn below is the only child process this module family starts. Its
 * arguments, its options and its single call site are unchanged from when they
 * lived beside the PATH walk — a split moves the lines, never the call.
 */

/** How long a single `<binary> --version` may take before it is abandoned. */
const PROBE_TIMEOUT_MS = 10_000;

/** Longest failure text kept from a candidate's stderr. */
const FAILURE_EXCERPT_LIMIT = 400;

/** The first semver-shaped token in some output, or null. */
export function parseReportedVersion(output: string): string | null {
  return /\b\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/.exec(output)?.[0] ?? null;
}

/**
 * Run one candidate and read the version it reports.
 *
 * `NEXUS_NO_AUTO_UPDATE` is set for the child on purpose. Without it a CLI that
 * has auto-update armed could start its own global install from inside the
 * verification step of a global install — two package managers writing the same
 * directory, which is the failure mode that leaves a shim pointing into a
 * collected pnpm hash directory and nothing in the package running at all.
 */
export function probeVersion(binary: string): { version: string | null; failure: string | null } {
  const result = spawnSync(binary, ["--version"], {
    encoding: "utf-8",
    timeout: PROBE_TIMEOUT_MS,
    env: { ...process.env, NEXUS_NO_AUTO_UPDATE: "1", NO_COLOR: "1" }
  });

  if (result.error) {
    return { version: null, failure: result.error.message };
  }

  const version = parseReportedVersion(result.stdout ?? "");
  if (version !== null) return { version, failure: null };

  // No version in stdout. The binary either failed or printed something else —
  // both are "cannot verify", and the caller has to say WHICH so the reader can
  // act. A broken global shim throws MODULE_NOT_FOUND here, which is the exact
  // text that names the repair.
  const stderr = (result.stderr ?? "").trim();
  const excerpt = stderr.length > 0 ? stderr : (result.stdout ?? "").trim();
  const reason =
    excerpt.length > 0
      ? excerpt.slice(0, FAILURE_EXCERPT_LIMIT)
      : `exited ${result.status ?? "on a signal"} and printed no version`;

  return { version: null, failure: reason };
}
