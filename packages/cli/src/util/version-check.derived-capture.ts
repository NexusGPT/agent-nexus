import { loadCache } from "./version-check.cache";
import { compareSemver } from "./version-check.semver";

/**
 * 🔴 THE ONE COPY OF THIS FLAG, AND IT STAYS THE ONE COPY.
 *
 * `asDerivedCapture` writes it and `isDerivedCapture` / `readCachedNewerVersion`
 * read it, so all three live in this file. Declared twice — once beside the
 * writer and once beside a reader — the writer would set a flag the reader never
 * sees, and the symptom is a per-machine `Update available:` line baked into a
 * committed docs page, which is exactly the defect this mechanism exists to
 * prevent. Set only for the duration of an {@link asDerivedCapture} render.
 */
let derivedCapture = false;

/**
 * Is the caller rendering a DERIVED capture rather than a live `--help`?
 *
 * Read by everything that would otherwise put a fact into the render that is
 * true of THIS PROCESS rather than of the tree. See {@link asDerivedCapture}
 * for the two such facts and why both have to go.
 */
export function isDerivedCapture(): boolean {
  return derivedCapture;
}

/**
 * The newest version this machine has already been told about, read from the
 * cache and NOTHING ELSE — no network, no promise.
 *
 * `checkForUpdate` is async because it may fetch, and help rendering in
 * commander is synchronous, so the help surface could not call it. That is the
 * whole reason this exists: the fact is already on disk, written by the last
 * command that ran, and a help screen that omits it omits something the process
 * already knows.
 *
 * Null when no check has ever run, when the cache is unreadable, or when the
 * cached version is not newer than the running one. Callers get "there is
 * nothing to say" and "I could not look" as the same answer on purpose — a help
 * footer has no way to act on the difference, and inventing a "could not check"
 * line on every help screen would train the reader to skip the line that
 * matters.
 */
export function readCachedNewerVersion(currentVersion: string): string | null {
  if (derivedCapture) return null;
  const cache = loadCache();
  if (!cache?.latestVersion) return null;
  return compareSemver(currentVersion, cache.latestVersion) < 0 ? cache.latestVersion : null;
}

/**
 * Render a capture that is a function of THE TREE ALONE.
 *
 * 🚨 A HELP SCREEN IS A FUNCTION OF (TREE, VERSION, THIS MACHINE'S CACHE). A
 * COMMITTED DOCS PAGE MUST BE A FUNCTION OF THE TREE ALONE. Two inputs have to
 * be removed to get there, and this wrapper removes both.
 *
 * ── 1. THIS MACHINE'S CACHE ─────────────────────────────────────────────────
 *
 * `~/.nexus-mcp/version-check.json`, written by whichever real command last ran
 * on that machine — so capturing help for a projection bakes a per-machine,
 * per-day fact into it. Measured on a developer box mid-2026: every generated
 * page would have carried `Update available: 0.21.9 → 0.24.1` and the npm
 * command to fix it, frozen into committed markdown, while CI — which has no
 * cache — reproduced neither line.
 *
 * ── 2. THE VERSION, AND IT IS NOT PART OF THE TREE THE PAGE IS COMPARED TO ──
 *
 * 🚨 `packages/cli/package.json`'s `version` is written by the changesets
 * release, which lands on `main` and NEVER on `staging`. A staging→main
 * promotion is tested on `refs/pull/<n>/merge` — main's package.json beside
 * staging's committed pages — so a footer naming the version made every page in
 * that tree differ from its projection, on a tree where nobody had touched a
 * CLI file. Measured on PR #3638: `main` at 0.25.0, `staging` at 0.21.9, all 45
 * generated pages reported stale, and the same pages were byte-identical and
 * green on staging alone. Reproduced by editing that one field and nothing
 * else: 0 stale at 0.21.9, 45 stale at 0.25.0.
 *
 * That is not a race anybody can win by regenerating. The next release re-opens
 * it, so the coupling itself is what goes.
 *
 * A concrete version in a committed page is also FALSE for its whole life: the
 * page can only ever name the version it was generated from, and npm shipped
 * four minor versions past it. A live `--help` names the client that is
 * actually talking, which is the fact the footer exists for, and it keeps it.
 *
 * Synchronous by contract, and `commander`'s help rendering is synchronous, so
 * the flag is set for exactly the render it wraps. Do not make it async — an
 * `await` inside would leave it set across unrelated work. The previous value
 * is saved rather than cleared, so nesting cannot switch either fact back on
 * halfway through an outer capture.
 */
export function asDerivedCapture<T>(render: () => T): T {
  const previous = derivedCapture;
  derivedCapture = true;
  try {
    return render();
  } finally {
    derivedCapture = previous;
  }
}
