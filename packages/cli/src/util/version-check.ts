import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getGlobalInstallCommand, getGlobalUpdateHint } from "./package-manager";
import { firstNonBlankOr } from "./present-text";
import { ensureSecretDir, SECRET_DIR_MODE, SECRET_FILE_MODE, writeSecretFile } from "./secret-file";

const PACKAGE_NAME = "@agent-nexus/cli";
const REGISTRY_LATEST_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day
const FETCH_TIMEOUT_MS = 3_000; // don't slow down the CLI
// A failed install attempt is close to permanent (EACCES on a root-owned
// prefix, broken npm) — don't re-run the blocking install on every invocation.
const FAILURE_BACKOFF_MS = 24 * 60 * 60 * 1000; // 1 day
// Hard ceiling on how long a self-install may hold up process exit.
const INSTALL_TIMEOUT_MS = 60_000;
// How long one refresh may hold the lock before another invocation may take it
// over. Long enough to cover a slow-but-alive fetch, short enough that a killed
// refresher does not suppress the next one for a noticeable time.
const REFRESH_LOCK_TTL_MS = 60_000;
// Resolved lazily (not at import time) so the home dir is read when the cache
// is actually used.
function getCacheFile(): string {
  return path.join(os.homedir(), ".nexus-mcp", "version-check.json");
}

function getRefreshLockDir(): string {
  return path.join(os.homedir(), ".nexus-mcp", "version-check.lock");
}

interface VersionCache {
  lastChecked: number;
  latestVersion: string;
  /** Version a self-install attempt failed for; retries suppressed for FAILURE_BACKOFF_MS. */
  failedVersion?: string;
  failedAt?: number;
}

function loadCache(): VersionCache | null {
  try {
    return JSON.parse(fs.readFileSync(getCacheFile(), "utf-8")) as VersionCache;
  } catch {
    return null;
  }
}

function saveCache(cache: VersionCache): void {
  try {
    // `~/.nexus-mcp` also holds `config.json`, the plaintext API key. This cache
    // carries no secret of its own, but it is one of the routes that CREATES
    // that directory, so it decides the mode the credential file sits behind.
    writeSecretFile(getCacheFile(), JSON.stringify(cache));
  } catch {
    // Non-critical — silently ignore write failures
  }
}

/**
 * Claim the right to refresh the cache. True means THIS invocation owns it.
 *
 * ── WHY A LOCK AT ALL ───────────────────────────────────────────────────────
 *
 * The refresh runs in a detached child (see {@link scheduleCacheRefresh}), so
 * nothing serialises it any more. Twenty parallel `nexus` invocations against
 * one expired cache would otherwise be twenty node processes and twenty writers
 * of one file. The write itself is made atomic separately, by rename; this stops
 * the twenty PROCESSES, which is the cost the atomic write cannot address.
 *
 * ── WHY A DIRECTORY AND NOT A FILE ──────────────────────────────────────────
 *
 * `mkdir` is create-or-fail in ONE syscall, on POSIX and on NFS alike, with no
 * flag to get wrong. `open(O_EXCL)` is the usual alternative and is documented
 * as unreliable over older NFS, which a corporate home directory can still be.
 *
 * 🚨 `recursive: true` DEFEATS THIS ENTIRELY — it succeeds on an existing
 * directory instead of throwing `EEXIST`, so every racer would "win". The parent
 * directory is created separately, above, precisely so this call can stay
 * non-recursive.
 *
 * ── THE CEILING, STATED ─────────────────────────────────────────────────────
 *
 * The takeover path (a lock older than {@link REFRESH_LOCK_TTL_MS}, left by a
 * killed refresher) is NOT exclusive: two invocations can both remove and
 * recreate it and both proceed. The cost is one extra detached child, in a
 * window that opens only after a crash, so it is not worth a second lock to
 * close. The common path — a live holder — is exclusive, and that is the path
 * that runs twenty times at once.
 */
export function acquireRefreshLock(lockDir: string): boolean {
  try {
    // `~/.nexus-mcp` holds the plaintext API key, so its mode is the helper's
    // business and not this function's — creating it here with a create-only
    // `mode:` is the exact shape `secret-file.ts` exists to keep out of the tree.
    ensureSecretDir(path.dirname(lockDir));
  } catch {
    // The parent may already exist, or be unwritable — the mkdir below decides.
  }
  try {
    // No mode of its own: an empty lock directory holds nothing, and it inherits
    // the 0700 the line above asserts on its parent.
    fs.mkdirSync(lockDir);
    return true;
  } catch {
    try {
      if (Date.now() - fs.statSync(lockDir).mtimeMs < REFRESH_LOCK_TTL_MS) return false;
      fs.rmdirSync(lockDir);
      fs.mkdirSync(lockDir);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * The program the detached refresher runs, as source.
 *
 * Exported so a spec can run it for real — a child process, a real socket, a
 * real rename — rather than asserting on a string nobody executes.
 *
 * Every path and number is baked in via `JSON.stringify`, so the child needs no
 * argument parsing and no environment. It also reads NOTHING from this package:
 * a `require` of our own `dist` would resolve differently for a global install,
 * an `npx` run and a `tsx` run, and a refresher that cannot start is a refresher
 * that never reports why.
 *
 * ── THE WRITE IS ATOMIC, AND THAT IS RULE-DRIVEN ────────────────────────────
 *
 * It writes a temp file and renames it over the cache. `rename(2)` within one
 * directory is atomic on POSIX, so a reader either sees the whole old file or
 * the whole new one — never a half-written one. A plain `writeFileSync` can be
 * interrupted (the refresher is detached, so it outlives the terminal that could
 * be Ctrl-C'd) and leave truncated JSON behind, which `loadCache` would then
 * treat as no cache at all until the next successful refresh.
 *
 * ── THE LOCK IS RELEASED ONLY ON SUCCESS, ON PURPOSE ────────────────────────
 *
 * A failed refresh leaves the cache expired, so the NEXT invocation would try
 * again, and the one after that. Holding the lock until it ages out turns an
 * unreachable registry from "one detached child per invocation" into "one per
 * minute". After a success the lock is worthless anyway — the cache is fresh for
 * a day and nobody asks again.
 */
export function buildRefreshScript(options: {
  cacheFile: string;
  lockDir: string;
  url: string;
  timeoutMs: number;
}): string {
  const { cacheFile, lockDir, url, timeoutMs } = options;
  return `
const fs = require("node:fs");
const path = require("node:path");
const CACHE = ${JSON.stringify(cacheFile)};
const LOCK = ${JSON.stringify(lockDir)};
const URL_ = ${JSON.stringify(url)};
const TIMEOUT = ${JSON.stringify(timeoutMs)};
const DIR_MODE = ${JSON.stringify(SECRET_DIR_MODE)};
const FILE_MODE = ${JSON.stringify(SECRET_FILE_MODE)};
// 🚨 ARMED ONCE AND NEVER CLEARED. Aborting a fetch rejects the PROMISE without
// closing a connection that is still being opened, so the work below can settle
// while a handle keeps the loop alive — which is the whole reason this child
// exists. Clearing this timer when the work settles would disarm it in exactly
// the hang it is here for, and the child would linger to undici's own connect
// timeout instead. Every path below ends in an explicit exit, so this only ever
// fires when the work never settles at all.
setTimeout(() => process.exit(0), TIMEOUT * 2);
(async () => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    const res = await fetch(URL_, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return;
    const json = await res.json();
    const latest = json && json.version;
    if (typeof latest !== "string" || latest.length === 0) return;
    let previous = {};
    try {
      const parsed = JSON.parse(fs.readFileSync(CACHE, "utf-8"));
      if (parsed && typeof parsed === "object") previous = parsed;
    } catch {}
    const next = Object.assign({}, previous, {
      lastChecked: Date.now(),
      latestVersion: latest
    });
    // chmod AFTER the write, never a create-only \`mode:\` option: \`open(2)\` and
    // \`mkdir(2)\` honour that argument only when they create the path and ignore
    // it outright when it already exists. \`secret-file.ts\` owns this reasoning
    // and a spec refuses the option's shape everywhere else in this package;
    // this child cannot import the helper because it is a standalone program, so
    // it carries the helper's SHAPE and its two constants instead.
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    try { fs.chmodSync(path.dirname(CACHE), DIR_MODE); } catch {}
    // The rename carries the temp file's mode onto the cache, so tightening it
    // here is what makes the final path owner-only.
    const tmp = CACHE + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(next));
    try { fs.chmodSync(tmp, FILE_MODE); } catch {}
    fs.renameSync(tmp, CACHE);
    try { fs.rmdirSync(LOCK); } catch {}
  } catch {
  } finally {
    // 🚨 finally, NOT a statement after the catch. A \`return\` inside the try —
    // there are two, for a non-OK response and for a missing version — leaves
    // the whole function, so anything BELOW the catch is skipped on exactly the
    // outcomes that are most likely. Those children would then sit until the
    // hard stop fired, which is the lingering process this whole change avoids.
    // A finally runs on the returns as well.
    //
    // Leaving normally is not enough on its own: an aborted request can leave a
    // socket pending, and node will not exit while one is open. Exiting is safe
    // here — every write above is synchronous and already on disk, and stdio is
    // ignored, so nothing is buffered.
    process.exit(0);
  }
})();
`;
}

/**
 * Refresh the version cache for the NEXT invocation, in a detached child.
 *
 * ── WHY NOT SIMPLY NOT AWAIT THE FETCH ──────────────────────────────────────
 *
 * 🚨 AN UNAWAITED `fetch` DOES NOT MAKE THE CLI FASTER. It keeps a handle on the
 * event loop, so node refuses to exit until the request settles — the wait moves
 * from before the last line of output to after it, and the user's shell prompt
 * is held for exactly as long. Measured on 0.26.0 against a registry that never
 * answers: output complete at 90 ms, process exit at 10.6 s. The AbortController
 * ceiling of 3 s rejects the PROMISE and does not close the pending connection,
 * so the remaining ~7 s is undici's own connect timeout. Only a separate process
 * removes the wait rather than relocating it.
 *
 * ── THE TRADE, NAMED ────────────────────────────────────────────────────────
 *
 * The current run answers from whatever is already on disk. A version published
 * in the last few minutes is therefore announced one invocation late. Against a
 * 24-hour check interval that lag is noise, and it buys every invocation an exit
 * that never waits on the network.
 *
 * Never throws, and never writes a byte to stdout. It runs before every command,
 * on a CLI whose `--json` output must stay one parseable document, so a spawn
 * that fails — no `execPath`, a read-only filesystem, a sandbox that forbids
 * `spawn`, a container with no writable home — has to be indistinguishable from
 * one that succeeded.
 */
function scheduleCacheRefresh(): void {
  try {
    if (!process.execPath) return;
    const lockDir = getRefreshLockDir();
    if (!acquireRefreshLock(lockDir)) return;

    const script = buildRefreshScript({
      cacheFile: getCacheFile(),
      lockDir,
      url: REGISTRY_LATEST_URL,
      timeoutMs: FETCH_TIMEOUT_MS
    });

    const child = spawn(process.execPath, ["-e", script], {
      detached: true,
      // Not "inherit", and not a pipe either. A pipe would leave the parent
      // holding the read end and re-couple the two lifetimes.
      stdio: "ignore",
      windowsHide: true
    });
    // 🚨 THE try/catch AROUND THIS CANNOT CATCH A FAILED START, AND THE CRASH
    // LANDS AFTER THE COMMAND HAS ALREADY PRINTED ITS OUTPUT.
    //
    // `spawn` returns a handle before the child exists. A start that fails —
    // ENOENT on an `execPath` that moved, EACCES or EPERM in a sandbox, EAGAIN
    // when the process table is full — is reported ASYNCHRONOUSLY, as an
    // `error` event on that handle, long after this function has returned. An
    // `error` event with no listener is not swallowed by anything: `EventEmitter`
    // throws it, and it becomes an uncaught exception that tears the process
    // down. So the one environment where a background refresh must be least
    // visible is the one where it would kill the command, on the way out, with a
    // stack trace about a process the user never asked for.
    //
    // Empty on purpose. There is nothing to report and nowhere to report it:
    // stdout must stay one parseable document under `--json`, and stderr would
    // put a warning about the CLI's own housekeeping on top of the command's
    // real output.
    child.on("error", () => undefined);
    // Without this the parent still waits for the child to exit, which is the
    // whole defect wearing a new shape.
    child.unref();
  } catch {
    // The SYNCHRONOUS half — invalid arguments, and a mocked `spawn` that
    // throws. The listener above is the asynchronous half; both are needed, and
    // neither covers the other.
  }
}

/**
 * The cached `latest`, plus a refresh scheduled when it has expired.
 *
 * Single copy of the read-and-maybe-schedule decision, so the notice path and
 * the self-install path can never disagree about what "fresh" means.
 */
function readCacheAndScheduleRefresh(): VersionCache | null {
  const cache = loadCache();
  const isFresh = cache !== null && Date.now() - cache.lastChecked < CHECK_INTERVAL_MS;
  if (!isFresh) scheduleCacheRefresh();
  return cache;
}

function recordFailedAttempt(version: string): void {
  const cache = loadCache() ?? { lastChecked: 0, latestVersion: version };
  saveCache({ ...cache, failedVersion: version, failedAt: Date.now() });
}

function clearFailedAttempt(): void {
  const cache = loadCache();
  if (!cache) return;
  saveCache({ lastChecked: cache.lastChecked, latestVersion: cache.latestVersion });
}

function isEnvFlagSet(value: string | undefined): boolean {
  return !!value && value !== "0" && value.toLowerCase() !== "false";
}

/**
 * The automatic updater is off — via `NEXUS_NO_AUTO_UPDATE`, or implicitly in
 * CI, an environment where neither a global self-install nor an unasked-for
 * registry round trip is ever wanted.
 *
 * 🚨 THIS GOVERNS TWO SIDE EFFECTS, NOT ONE: the self-INSTALL and the version
 * LOOKUP. It used to gate only the install, and the lookup is the one a user
 * actually feels — `checkForUpdate` ran in the `else` branch of the same `if`,
 * so setting the variable moved the CLI from "install over yourself" to "make
 * the npm request anyway". Measured on 0.26.0: with `NEXUS_NO_AUTO_UPDATE=1`
 * and with `CI=1`, `registry.npmjs.org` was still contacted once per 24 h, at
 * ~300 ms warm and a 3 s ceiling with no egress.
 *
 * Read {@link checkForUpdate} for where the second gate now lives, and why it
 * is inside this module rather than at the call site.
 */
export function isAutoUpdateDisabled(): boolean {
  return isEnvFlagSet(process.env.NEXUS_NO_AUTO_UPDATE) || isEnvFlagSet(process.env.CI);
}

/**
 * Walk up from the running module to the directory installed under
 * node_modules (handling scoped packages). Null when not running from a
 * node_modules layout (e.g. local dev via tsx).
 */
function findPackageRoot(from: string): string | null {
  let dir = from;
  for (;;) {
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    const parentBase = path.basename(parent);
    const grandBase = path.basename(path.dirname(parent));
    if (
      parentBase === "node_modules" ||
      (parentBase.startsWith("@") && grandBase === "node_modules")
    ) {
      return dir;
    }
    dir = parent;
  }
}

/**
 * Pre-check that a global self-install could succeed at all: the package dir
 * and its parent must be writable by this user (they are root-owned after
 * `sudo npm i -g`, the macOS default). When the layout can't be determined,
 * stays permissive — the failure backoff catches anything this misses.
 */
export function isInstallPrefixWritable(): boolean {
  let pkgRoot: string | null;
  try {
    pkgRoot = findPackageRoot(path.dirname(fs.realpathSync(process.argv[1] ?? "")));
  } catch {
    return true;
  }
  if (!pkgRoot) return true;
  try {
    fs.accessSync(pkgRoot, fs.constants.W_OK);
    fs.accessSync(path.dirname(pkgRoot), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(REGISTRY_LATEST_URL, {
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const json = (await res.json()) as { version?: string };
    return json.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Compare two semver strings. Returns:
 *  -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/** The update notice for a known `latest`, or null when it is not newer. */
function messageIfNewer(currentVersion: string, latest: string): string | null {
  return compareSemver(currentVersion, latest) < 0
    ? formatUpdateMessage(currentVersion, latest)
    : null;
}

/**
 * Check if a newer version of the CLI is available.
 *
 * - Answers from the cache. NEVER waits on the network — a stale cache schedules
 *   a detached refresh for the next invocation; see {@link scheduleCacheRefresh}
 *   for why an unawaited fetch relocates the wait instead of removing it.
 * - Refreshes at most once per day, and at most once per {@link REFRESH_LOCK_TTL_MS}
 *   while the registry is unreachable.
 * - Never throws — all failures are silently swallowed.
 * - Returns an update message if outdated, or null if up-to-date / check skipped.
 *
 * ── THE OPT-OUT IS ENFORCED HERE, NOT AT THE CALL SITE ──────────────────────
 *
 * 🚨 `index.ts` chooses between "install on exit" and "print a notice" with one
 * `if`, and `isAutoUpdateDisabled()` was a term in the FIRST branch only. So
 * the documented escape hatch selected the OTHER branch — and that branch was
 * the one holding the network call. A gate that sits in one arm of a two-arm
 * decision does not disable the behaviour; it picks which half of it you get.
 *
 * The cure is that the gate lives beside the side effect it governs. A future
 * caller of this function inherits it by construction and cannot forget it,
 * which a second copy of the condition at a second call site could not promise.
 *
 * The refusal is NARROW ON PURPOSE: it removes the REQUEST, never the NOTICE.
 * `NEXUS_NO_AUTO_UPDATE` is documented as "ignore `--auto-update`, print the
 * notice instead", and a user who is already told about 0.30.0 on disk is still
 * told about it. Only the lookup that would refresh that number is skipped —
 * so this reads exactly like a cache that is always fresh.
 *
 * `nexus upgrade` is unaffected: it calls {@link fetchLatestVersion} directly,
 * because an explicit upgrade command is the user asking rather than the CLI
 * deciding. Gating the fetch itself would have broken the one path that is
 * supposed to reach the network under this variable.
 */
export async function checkForUpdate(currentVersion: string): Promise<string | null> {
  try {
    // Under the opt-out nothing is scheduled at all — a detached child making an
    // unasked-for registry request is exactly what the variable refuses, and it
    // would be a worse offence than the blocking one because it also survives
    // the command that started it.
    const cache = isAutoUpdateDisabled() ? loadCache() : readCacheAndScheduleRefresh();

    return cache === null ? null : messageIfNewer(currentVersion, cache.latestVersion);
  } catch {
    return null;
  }
}

/** Set only for the duration of an {@link asDerivedCapture} render. */
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

export function formatUpdateMessage(current: string, latest: string): string {
  return (
    `\n  Update available: ${current} → ${latest}\n` +
    `  Run "${getGlobalUpdateHint(PACKAGE_NAME)}" to update.\n`
  );
}

/**
 * One-line notice shown when a background auto-update could not complete
 * (e.g. EACCES on a root-owned global install dir). The command already ran
 * on the installed version, so this is informational — not a hard warning.
 */
export function formatAutoUpdateFailedMessage(latest: string): string {
  return `\n  Auto-update to ${latest} failed. Run "${getGlobalInstallCommand(PACKAGE_NAME)}" to update manually.\n`;
}

/**
 * Automatically update the CLI to the latest version.
 *
 * - Reads the version from the cache and NEVER waits on the network; a stale
 *   cache schedules a detached refresh for the next invocation, exactly as
 *   {@link checkForUpdate} does and through the same helper.
 * - Never attempts an install that cannot succeed: skips when the install
 *   prefix isn't writable, and backs off for FAILURE_BACKOFF_MS after any
 *   failed attempt instead of re-running the blocking install per invocation.
 * - The install itself is bounded by INSTALL_TIMEOUT_MS.
 * - Never throws — all failures are silently swallowed and fall back to a manual-update message.
 * - Does nothing at all when {@link isAutoUpdateDisabled} — no install, and no
 *   network lookup either.
 * - Returns a status message describing what happened.
 */
export async function autoUpdate(currentVersion: string): Promise<string | null> {
  // Beside the side effect, for the reason {@link checkForUpdate} documents at
  // length. `index.ts` tests the same predicate, and that is NOT a duplicate of
  // this line: there it selects a BRANCH (install, or fall through to the
  // notice), so deleting it would suppress the notice too. This line is the
  // guarantee that no caller — present or future — can start an install the
  // environment has refused.
  if (isAutoUpdateDisabled()) return null;

  let latest: string | null = null;
  try {
    // Same contract as `checkForUpdate`: decide from the cache, schedule the
    // refresh for the next run. A self-install is a heavier side effect than a
    // notice, so acting one invocation later is if anything the safer half of
    // this trade — it never installs on the strength of a number the user has
    // not already been shown.
    const cache = readCacheAndScheduleRefresh();
    latest = cache?.latestVersion ?? null;

    if (!latest || compareSemver(currentVersion, latest) >= 0) {
      return null; // up-to-date or unable to check
    }

    // A recent attempt at this same version already failed — the condition is
    // effectively permanent (EACCES prefix), so don't retry within the TTL.
    if (
      cache?.failedVersion === latest &&
      typeof cache.failedAt === "number" &&
      Date.now() - cache.failedAt < FAILURE_BACKOFF_MS
    ) {
      return formatAutoUpdateFailedMessage(latest);
    }

    // If the install prefix isn't writable by this user the install can never
    // succeed — skip the attempt (one syscall) and hint at a manual update.
    if (!isInstallPrefixWritable()) {
      recordFailedAttempt(latest);
      return formatAutoUpdateFailedMessage(latest);
    }

    // Mark the attempt as failed up-front so an interrupted install (Ctrl-C
    // mid-npm) still backs off; cleared on success.
    recordFailedAttempt(latest);

    // Attempt the upgrade.
    // Capture (don't inherit) the installer's output: a failed background
    // update — e.g. EACCES on a root-owned global dir — must not dump a
    // multi-line npm error stack over the command's real output.
    const { execSync } = await import("node:child_process");
    process.stderr.write(`\n  Auto-updating: ${currentVersion} → ${latest}…\n`);
    execSync(getGlobalInstallCommand(PACKAGE_NAME), {
      stdio: ["ignore", "ignore", "pipe"],
      timeout: INSTALL_TIMEOUT_MS
    });
    clearFailedAttempt();
    return `\n  Successfully auto-updated to ${latest}.\n`;
  } catch {
    // Auto-update failed. The command already ran on the installed version,
    // so this is non-fatal — show a brief one-line notice, never the
    // alarming "MUST update / results may be incorrect" warning.
    if (latest) recordFailedAttempt(latest);
    return formatAutoUpdateFailedMessage(
      firstNonBlankOr([latest, loadCache()?.latestVersion], "latest")
    );
  }
}
