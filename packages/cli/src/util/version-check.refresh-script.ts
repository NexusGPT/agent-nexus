import { SECRET_DIR_MODE, SECRET_FILE_MODE } from "./secret-file";

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
