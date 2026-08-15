import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { compareSemver } from "./version-check";

/**
 * `which -a <name>` in Node, plus the version each hit reports.
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
 * they are invisible unless every row is printed. So this module returns the
 * full list, in the order a shell searches it, and the caller prints all of it.
 *
 * ── WHAT THIS MODELS, AND THE THREE THINGS IT CANNOT SEE ────────────────────
 *
 * A POSIX shell resolving a bare word searches `$PATH` left to right and takes
 * the first executable file. That is what {@link resolveOnPath} does, and it
 * agrees with `which -a` on every ordinary machine. It is NOT the whole of what
 * an interactive shell does, and the gap is deliberately named rather than
 * papered over:
 *
 *   - a shell FUNCTION or ALIAS named `nexus` wins over every path entry, and
 *     lives in the shell's own state — no child process can read it;
 *   - `hash`/`rehash` caching can keep a shell on a path that no longer exists
 *     until the table is cleared, so a freshly-correct PATH can still run the
 *     old binary in THAT terminal;
 *   - a login shell's PATH is not always the PATH this process inherited.
 *
 * All three make the reported list a lower bound on the confusion, never an
 * upper one. That is the safe direction: this module never reports agreement
 * that a shell would contradict, only disagreement a shell might also have.
 */

/** One `nexus` on the PATH, and what it says it is. */
export interface PathCandidate {
  /** The path exactly as PATH resolution found it — symlinks NOT followed. */
  readonly path: string;
  /** The version it reports, or null when it could not be read. */
  readonly version: string | null;
  /** Why the version could not be read. Null when it was read. */
  readonly failure: string | null;
}

/** Runs a candidate and returns what it printed. Injected so specs need no disk. */
export type VersionProbe = (binary: string) => { version: string | null; failure: string | null };

/** How long a single `<binary> --version` may take before it is abandoned. */
const PROBE_TIMEOUT_MS = 10_000;

/** Longest failure text kept from a candidate's stderr. */
const FAILURE_EXCERPT_LIMIT = 400;

/**
 * The extensions a bare name may carry, in search order.
 *
 * POSIX has none. On Windows `PATHEXT` is the list, and a bare `nexus` resolves
 * to `nexus.cmd` — searching for `nexus` alone would find nothing there and
 * report "not on your PATH" on a machine where it plainly is.
 */
function executableExtensions(env: NodeJS.ProcessEnv): string[] {
  if (process.platform !== "win32") return [""];
  const pathext = env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD";
  return ["", ...pathext.split(";").filter((e) => e.length > 0)];
}

function isExecutableFile(candidate: string): boolean {
  try {
    if (!fs.statSync(candidate).isFile()) return false;
  } catch {
    return false;
  }
  // Windows reports X_OK for everything, which is why the extension list above
  // carries the real filter there.
  if (process.platform === "win32") return true;
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every executable named `name` on PATH, in the order a shell searches.
 *
 * Empty when nothing matches — and also when `name` contains a separator, which
 * a shell runs directly rather than looking up. Modelling that as "no PATH
 * resolution" is correct: there genuinely is none.
 */
export function resolveOnPath(name: string, env: NodeJS.ProcessEnv = process.env): string[] {
  if (name.includes("/") || name.includes("\\")) return [];

  // `Path` is the casing Windows uses; `env` lookups there are case-insensitive
  // in practice, but a plain object read is not.
  const raw = env.PATH ?? env.Path ?? "";
  if (raw.length === 0) return [];

  const extensions = executableExtensions(env);
  const seen = new Set<string>();
  const found: string[] = [];

  for (const entry of raw.split(path.delimiter)) {
    // An EMPTY PATH entry means the current directory to a POSIX shell. Keeping
    // that faithful matters: it is one of the ways a stale local copy wins.
    const dir = entry.length === 0 ? "." : entry;
    for (const extension of extensions) {
      const candidate = path.join(dir, name + extension);
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      if (isExecutableFile(candidate)) found.push(candidate);
    }
  }

  return found;
}

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

/**
 * The full resolution list for `name`, each entry probed.
 *
 * The probe is bounded to the first {@link PROBE_LIMIT} entries. A PATH with
 * dozens of hits is pathological, and spawning one process per entry to render
 * a diagnostic is a cost the diagnostic does not need to pay.
 */
const PROBE_LIMIT = 6;

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

/** Longest failure text shown INSIDE a resolution row, before it is elided. */
const ROW_FAILURE_LIMIT = 48;

/**
 * The resolution list as a reader sees it — every entry, the winner marked.
 *
 * ONE LINE PER ARRAY ELEMENT, never a single string with newlines in it. The
 * caller joins its hint with an indent, and an embedded newline skips that
 * indent — which silently un-aligns exactly the block whose alignment is the
 * diagnostic. Returning lines makes the caller's join reach all of them.
 *
 * Marking the WINNER rather than the newest is deliberate. The reader's next
 * action is to remove or outrank one specific file, and the arrow names it.
 */
export function formatResolutionList(candidates: readonly PathCandidate[]): string[] {
  const width = Math.max(...candidates.map((c) => c.path.length), 0);

  return candidates.map((candidate, index) => {
    const marker = index === 0 ? "→" : " ";
    const tail = index === 0 ? "   ← your shell runs this one" : "";
    return `  ${marker} ${candidate.path.padEnd(width)}  ${describeRow(candidate)}${tail}`;
  });
}

/**
 * What one row says in its version column.
 *
 * A failure is shortened to its first line and elided, because the row is a
 * COLUMN and a full stack trace in it destroys the alignment that makes the
 * list readable. The unabridged text is printed above the list by the caller
 * for the entry that actually matters — the one the shell runs.
 */
function describeRow(candidate: PathCandidate): string {
  if (candidate.version !== null) return candidate.version;

  const reason = (candidate.failure ?? "no version").split("\n")[0];
  const short =
    reason.length > ROW_FAILURE_LIMIT ? `${reason.slice(0, ROW_FAILURE_LIMIT - 1)}…` : reason;
  return `(${short})`;
}
