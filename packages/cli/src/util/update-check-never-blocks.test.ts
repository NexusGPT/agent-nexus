import type { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SpawnCall = { command: string; args: string[]; options: Record<string, unknown> };
type RealSpawn = typeof spawn;

/**
 * ONE MOCK, TWO JOBS, AND THE SECOND ONE IS WHY THIS FILE IS NOT VACUOUS.
 *
 * The mock records the OPTIONS the production code passes — that is how
 * `detached`, `stdio` and `unref()` are checked. It also DELEGATES to the real
 * `spawn`, with the child's program swapped for whatever the current case wants,
 * so the timing cases run a genuine second process against a genuine socket.
 *
 * 🚨 THE OPTIONS ASSERTION ALONE PASSES ON CODE THAT ALSO AWAITS THE CHILD.
 * `detached: true` and a recorded `unref()` describe how the handle was
 * configured and say nothing about whether the caller then waited for it. Only
 * the timing cases below can tell those apart, which is why both exist.
 *
 * 🚨 THE REAL `spawn` HAS TO COME FROM `importOriginal`, NEVER FROM A TOP-LEVEL
 * IMPORT. A top-level `import { spawn } from "node:child_process"` in this file
 * resolves to the MOCK, so the delegating call re-enters itself, no child is
 * ever started, and every timing case fails on a cache nobody wrote. Measured
 * here before the fix: 3 of 4 real-child cases red for that reason alone.
 *
 * `vi.hoisted` is what makes the shared state reachable: `vi.mock` is hoisted
 * above every `const` in the file, so a factory closing over an ordinary
 * declaration reads it in its temporal dead zone.
 */
const harness = vi.hoisted(() => ({
  calls: [] as SpawnCall[],
  unrefCount: 0,
  /** Program the delegating spawn substitutes. Null = record only, start nothing. */
  childProgram: null as string | null,
  /** Arms one refusal, to stand in for a sandbox that forbids `spawn`. */
  refuseNextSpawn: false,
  /** Starts a binary that cannot exist, so the start fails ASYNCHRONOUSLY. */
  spawnMissingBinary: false,
  /** The handle handed back to production code, so a spec can read its listeners. */
  lastChild: null as { listenerCount: (event: string) => number } | null,
  realSpawn: null as RealSpawn | null,
  execSyncMock: vi.fn()
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  harness.realSpawn = actual.spawn;
  return {
    ...actual,
    execSync: (...args: unknown[]) => harness.execSyncMock(...args),
    spawn: (command: string, args: string[], options: Record<string, unknown>) => {
      harness.calls.push({ command, args, options });
      if (harness.refuseNextSpawn) {
        harness.refuseNextSpawn = false;
        throw new Error("EPERM: spawn is not permitted");
      }
      if (harness.spawnMissingBinary && harness.realSpawn !== null) {
        // A real ChildProcess whose start fails with ENOENT. The failure arrives
        // as an `error` event on a later tick — which is exactly the shape a
        // try/catch around `spawn` cannot see.
        const failing = harness.realSpawn(
          "/nonexistent/nexus-refresher-that-cannot-exist",
          [],
          options
        );
        harness.lastChild = failing;
        return failing;
      }
      if (harness.childProgram === null || harness.realSpawn === null) {
        const stub = {
          unref: () => void (harness.unrefCount += 1),
          listeners: new Set<string>(),
          on(event: string) {
            this.listeners.add(event);
            return this;
          },
          listenerCount(event: string) {
            return this.listeners.has(event) ? 1 : 0;
          }
        };
        harness.lastChild = stub;
        return stub;
      }
      const child = harness.realSpawn(command, [args[0] ?? "-e", harness.childProgram], options);
      harness.lastChild = child;
      const originalUnref = child.unref.bind(child);
      child.unref = () => {
        harness.unrefCount += 1;
        return originalUnref();
      };
      return child;
    }
  };
});

import {
  acquireRefreshLock,
  buildRefreshScript,
  checkForUpdate,
  readCachedNewerVersion
} from "./version-check";

const INDEX_SRC = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../index.ts"),
  "utf8"
);

const CACHE_REL = path.join(".nexus-mcp", "version-check.json");
const LOCK_REL = path.join(".nexus-mcp", "version-check.lock");

let tmpHome: string;
let homedirSpy: ReturnType<typeof vi.spyOn>;
let savedEnv: Record<string, string | undefined>;

/**
 * 🚨 CLEARED FOR THE WHOLE FILE. `CI` is read by the same predicate that governs
 * the refresh, so a runner that exports it — every GitHub Actions job — turns
 * every case here into a no-op. Left alone, this suite goes RED on the machine
 * that matters and GREEN on every laptop.
 */
const ENV_KEYS = ["NEXUS_NO_AUTO_UPDATE", "CI"] as const;

function cacheFile(): string {
  return path.join(tmpHome, CACHE_REL);
}

function lockDir(): string {
  return path.join(tmpHome, LOCK_REL);
}

/** Expired by a day, so a refresh is genuinely due. A fresh cache proves nothing. */
function writeStaleCache(latestVersion: string): void {
  fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
  fs.writeFileSync(
    cacheFile(),
    JSON.stringify({ lastChecked: Date.now() - 25 * 60 * 60 * 1000, latestVersion })
  );
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "update-nonblocking-test-"));
  homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(tmpHome);
  harness.calls.length = 0;
  harness.unrefCount = 0;
  harness.childProgram = null;
  harness.refuseNextSpawn = false;
  harness.spawnMissingBinary = false;
  harness.lastChild = null;
  harness.execSyncMock.mockReset();
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  homedirSpy.mockRestore();
  fs.rmSync(tmpHome, { recursive: true, force: true });
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("the refresh is handed to a detached child", () => {
  it("spawns node with the refresh program, detached, with no stdio", async () => {
    writeStaleCache("0.2.21");

    await checkForUpdate("0.2.19");

    expect(harness.calls).toHaveLength(1);
    const call = harness.calls[0];
    expect(call.command).toBe(process.execPath);
    expect(call.args[0]).toBe("-e");
    expect(call.options.detached).toBe(true);
    // Not "inherit" (the child would write over the command's output) and not a
    // pipe (the parent would hold the read end and re-couple the two lifetimes).
    expect(call.options.stdio).toBe("ignore");
  });

  it("unrefs the handle, so the parent's event loop does not hold the child", async () => {
    writeStaleCache("0.2.21");

    await checkForUpdate("0.2.19");

    expect(harness.unrefCount).toBe(1);
  });

  /**
   * 🚨 THE try/catch AROUND `spawn` DOES NOT COVER A FAILED START.
   *
   * `spawn` hands back a handle before the child exists, and a start that fails
   * — ENOENT, EACCES in a sandbox, EAGAIN with a full process table — arrives
   * later, as an `error` event on that handle. An `error` event with no listener
   * is thrown by `EventEmitter` itself, so it becomes an uncaught exception and
   * kills the process — AFTER the command has printed its output, with a stack
   * trace about something the user never asked for.
   *
   * The environment where a background refresh must be least visible is exactly
   * the environment where this fires.
   */
  it("attaches an error listener, which is the only thing covering an async start failure", async () => {
    writeStaleCache("0.2.21");

    await checkForUpdate("0.2.19");

    expect(harness.lastChild?.listenerCount("error")).toBe(1);
  });

  it("survives a start that fails asynchronously, and stays silent about it", async () => {
    writeStaleCache("0.2.21");
    harness.spawnMissingBinary = true;
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    try {
      const message = await checkForUpdate("0.2.19");

      // The ENOENT lands on a later tick. Without the listener this is where the
      // process dies, and the run fails on an unhandled error naming no test.
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(message).toContain("Update available");
      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  }, 15_000);

  it("returns the notice from the cache it already had, not from the refresh", async () => {
    writeStaleCache("0.2.21");

    await expect(checkForUpdate("0.2.19")).resolves.toContain("Update available: 0.2.19 → 0.2.21");
  });
});

/**
 * THE ONLY CASES THAT CAN SEE THE DEFECT THIS CHANGE FIXES.
 *
 * A real child, a real HTTP server that answers deliberately late, and a clock.
 * The claim is not "a child was configured correctly" — it is "the caller came
 * back before the child had finished", and nothing short of running both can
 * establish that.
 */
describe("the invocation returns while the refresh is still running", () => {
  let server: http.Server;
  let url: string;
  const RESPONSE_DELAY_MS = 700;

  beforeEach(async () => {
    server = http.createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ version: "9.9.9" }));
      }, RESPONSE_DELAY_MS);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    url = `http://127.0.0.1:${address.port}/latest`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function waitForCacheVersion(version: string, budgetMs: number): Promise<boolean> {
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
      try {
        if (JSON.parse(fs.readFileSync(cacheFile(), "utf-8")).latestVersion === version) {
          return true;
        }
      } catch {
        // The cache may be mid-replacement, or not yet written.
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return false;
  }

  it("comes back long before the child's request completes", async () => {
    writeStaleCache("0.2.21");
    harness.childProgram = buildRefreshScript({
      cacheFile: cacheFile(),
      lockDir: lockDir(),
      url,
      timeoutMs: 5_000
    });

    const started = Date.now();
    const message = await checkForUpdate("0.2.19");
    const returnedAfterMs = Date.now() - started;

    // The answer is the cached one, and it arrived before the server had even
    // begun to reply. Awaiting the child would put this number past the delay.
    expect(message).toContain("0.2.21");
    expect(returnedAfterMs).toBeLessThan(RESPONSE_DELAY_MS);

    // ...and the refresh really was still in flight at that moment.
    expect(JSON.parse(fs.readFileSync(cacheFile(), "utf-8")).latestVersion).toBe("0.2.21");

    // Then it lands, on its own, after the caller is long gone.
    await expect(waitForCacheVersion("9.9.9", 10_000)).resolves.toBe(true);
  }, 20_000);

  it("leaves an intact cache and no temporary file behind", async () => {
    writeStaleCache("0.2.21");
    harness.childProgram = buildRefreshScript({
      cacheFile: cacheFile(),
      lockDir: lockDir(),
      url,
      timeoutMs: 5_000
    });

    await checkForUpdate("0.2.19");
    await expect(waitForCacheVersion("9.9.9", 10_000)).resolves.toBe(true);

    const entries = fs.readdirSync(path.dirname(cacheFile()));
    // Floor over the SAME listing before reading anything from it. An empty
    // `readdirSync` — a wrong path, a directory that was never created — reads
    // exactly like "no temporary files", so "clean" would be a scan that
    // resolved nothing wearing a tick.
    expect(entries).toContain(path.basename(cacheFile()));
    expect(entries.filter((name) => name.endsWith(".tmp"))).toEqual([]);
    // Released on success, so an invocation a minute later is not blocked.
    expect(fs.existsSync(lockDir())).toBe(false);
  }, 20_000);

  it("leaves the cache owner-only, on a path that was already loose", async () => {
    // `~/.nexus-mcp` also holds the plaintext API key, so a refresher that
    // widened the directory — or wrote a fresh file under a permissive umask —
    // would undo the credential hardening beside it. A create-only `mode:` would
    // not have covered this case at all: the file already exists here.
    fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
    fs.writeFileSync(cacheFile(), JSON.stringify({ lastChecked: 0, latestVersion: "0.2.21" }));
    fs.chmodSync(cacheFile(), 0o644);
    fs.chmodSync(path.dirname(cacheFile()), 0o755);
    harness.childProgram = buildRefreshScript({
      cacheFile: cacheFile(),
      lockDir: lockDir(),
      url,
      timeoutMs: 5_000
    });

    await checkForUpdate("0.2.19");
    await expect(waitForCacheVersion("9.9.9", 10_000)).resolves.toBe(true);

    expect(fs.statSync(cacheFile()).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(cacheFile())).mode & 0o777).toBe(0o700);
  }, 20_000);

  it("merges the refresh into the fields the parent still owns", async () => {
    // `failedVersion` / `failedAt` are written by the self-install backoff, in
    // the PARENT, and a refresh that replaced the file wholesale would erase
    // them — re-running a blocking install that is known to fail, every day.
    const failedAt = Date.now() - 60_000;
    fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
    fs.writeFileSync(
      cacheFile(),
      JSON.stringify({
        lastChecked: Date.now() - 25 * 60 * 60 * 1000,
        latestVersion: "0.2.21",
        failedVersion: "0.2.21",
        failedAt
      })
    );
    harness.childProgram = buildRefreshScript({
      cacheFile: cacheFile(),
      lockDir: lockDir(),
      url,
      timeoutMs: 5_000
    });

    await checkForUpdate("0.2.19");
    await expect(waitForCacheVersion("9.9.9", 10_000)).resolves.toBe(true);

    const saved = JSON.parse(fs.readFileSync(cacheFile(), "utf-8"));
    expect(saved.failedVersion).toBe("0.2.21");
    expect(saved.failedAt).toBe(failedAt);
  }, 20_000);

  it("terminates rather than lingering when the reply never comes", async () => {
    /**
     * THE REFRESHER IS DETACHED, SO NOTHING ELSE EVER REAPS IT. A child that
     * lingers is a process the user cannot see, did not ask for, and cannot
     * attribute — and on a machine running the CLI in a loop they accumulate.
     *
     * ⚠️ THIS CASE PROVES THE CHILD TERMINATES. IT IS NOT THE GUARD ON THE
     * HARD-STOP TIMER, and it was measured failing to be: with the timer
     * disarmed the way the defect disarms it, this case still passed. Aborting
     * a request whose socket is already CONNECTED destroys that socket, so the
     * child exits promptly either way. The defect needs a connect that is still
     * PENDING, which needs an unroutable address — a fact about the network the
     * machine is on, not about this code, and not something a suite may depend
     * on. The shape assertion below is the guard; this is the behaviour beside
     * it.
     */
    const hang = http.createServer(() => {
      // Accept, then never answer.
    });
    await new Promise<void>((resolve) => hang.listen(0, "127.0.0.1", resolve));
    const address = hang.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    const timeoutMs = 600;
    const script = buildRefreshScript({
      cacheFile: cacheFile(),
      lockDir: lockDir(),
      url: `http://127.0.0.1:${address.port}/latest`,
      timeoutMs
    });

    try {
      const startedAt = Date.now();
      const exited = await new Promise<number>((resolve) => {
        const child = harness.realSpawn?.(process.execPath, ["-e", script], {
          stdio: "ignore"
        });
        child?.on("close", () => resolve(Date.now() - startedAt));
      });

      expect(exited).toBeLessThan(timeoutMs * 2 + 3_000);
    } finally {
      await new Promise<void>((resolve) => hang.close(() => resolve()));
    }
  }, 30_000);

  /**
   * THE OUTCOMES THAT LEAVE THE WORK EARLY, WHICH ARE ALSO THE LIKELY ONES.
   *
   * A registry 500, a rate limit, a body without a `version` — none of them is
   * an error, so none goes through the catch. Each takes a `return`, and a
   * `return` inside a try skips anything written after the catch. A child that
   * misses its exit that way sits until the hard stop fires, which is the
   * lingering detached process this whole change exists to avoid.
   *
   * Both cases are deterministic: an ordinary HTTP reply, no timing and no
   * network topology involved.
   */
  const EARLY_RETURN_REPLIES = [
    {
      label: "the registry answers 500",
      reply: (res: http.ServerResponse) => {
        res.writeHead(500);
        res.end("upstream is unhappy");
      }
    },
    {
      label: "the body carries no version",
      reply: (res: http.ServerResponse) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ name: "@agent-nexus/cli" }));
      }
    },
    {
      label: "the version is not a string",
      reply: (res: http.ServerResponse) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ version: 42 }));
      }
    },
    {
      label: "the body is not JSON",
      reply: (res: http.ServerResponse) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("<html>gateway</html>");
      }
    }
  ] as const;

  it.each(eachOrRefuse(EARLY_RETURN_REPLIES, "the replies that leave the refresh work early"))(
    "$label — the child still exits at once, not on the hard stop",
    async ({ reply }) => {
      const server2 = http.createServer((_req, res) => reply(res));
      await new Promise<void>((resolve) => server2.listen(0, "127.0.0.1", resolve));
      const address = server2.address();
      if (address === null || typeof address === "string") throw new Error("no port");
      const timeoutMs = 3_000;
      const script = buildRefreshScript({
        cacheFile: cacheFile(),
        lockDir: lockDir(),
        url: `http://127.0.0.1:${address.port}/latest`,
        timeoutMs
      });

      try {
        const startedAt = Date.now();
        const lifetimeMs = await new Promise<number>((resolve) => {
          const child = harness.realSpawn?.(process.execPath, ["-e", script], {
            stdio: "ignore"
          });
          child?.on("close", () => resolve(Date.now() - startedAt));
        });

        // The hard stop is at timeoutMs * 2 = 6 s. Anything near it means the
        // child fell through to the timer instead of exiting on its own.
        expect(lifetimeMs).toBeLessThan(timeoutMs);
      } finally {
        await new Promise<void>((resolve) => server2.close(() => resolve()));
      }
    },
    30_000
  );

  it("survives many refreshers at once with exactly one intact cache", async () => {
    // The lock stops this happening from the CLI, so this case answers the
    // question the lock cannot: if two children ever DID overlap, is the file
    // still readable? The atomic rename is what makes the answer yes; a plain
    // write would interleave.
    fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
    const script = buildRefreshScript({
      cacheFile: cacheFile(),
      lockDir: lockDir(),
      url,
      timeoutMs: 5_000
    });

    await Promise.all(
      Array.from(
        { length: 12 },
        () =>
          new Promise<void>((resolve) => {
            harness
              .realSpawn?.(process.execPath, ["-e", script], {
                stdio: "ignore"
              })
              .on("close", () => resolve());
          })
      )
    );

    expect(JSON.parse(fs.readFileSync(cacheFile(), "utf-8")).latestVersion).toBe("9.9.9");

    const entries = fs.readdirSync(path.dirname(cacheFile()));
    // Same floor as above, and for the same reason: the listing has to be shown
    // to have reached something before its emptiness means anything.
    expect(entries).toContain(path.basename(cacheFile()));
    expect(entries.filter((name) => name.endsWith(".tmp"))).toEqual([]);
  }, 30_000);
});

/**
 * THE HARD STOP IS THE CHILD'S ONLY CEILING, AND CLEARING IT IS INVISIBLE.
 *
 * The timer force-exits a refresher whose fetch settled while a handle stayed
 * open — an abort rejects the PROMISE and does not close a connection that is
 * still being opened, which is the same mechanism that made the CLI itself wait
 * 10.6 s for a 3 s ceiling. A `finally { clearTimeout(hardStop) }` reads as
 * ordinary hygiene and disarms the timer at precisely the moment it becomes
 * load-bearing, leaving the child to undici's 10 s connect timeout instead.
 *
 * It is asserted on the SOURCE because the behaviour it protects needs an
 * unroutable address to reproduce — see the case above, which was measured
 * passing against the defect. A gate that cannot run in CI is not a gate, and a
 * shape assertion that can is worth more than a timing one that lies.
 */
describe("the child's hard stop stays armed", () => {
  const script = buildRefreshScript({
    cacheFile: "/tmp/cache.json",
    lockDir: "/tmp/cache.lock",
    url: "http://127.0.0.1:1/latest",
    timeoutMs: 3_000
  });

  it("arms a force-exit on a multiple of its own fetch timeout", () => {
    expect(script).toMatch(/setTimeout\(\(\) => process\.exit\(0\), TIMEOUT \* 2\)/);
  });

  it("never clears it, and holds no handle on it that could", () => {
    expect(script).not.toMatch(/clearTimeout\(hardStop\)/);
    // No binding at all, so a later edit cannot reach the timer to clear it.
    expect(script).not.toContain("hardStop");
  });

  it("puts the explicit exit in a finally, which the early returns cannot skip", () => {
    // A statement BELOW the catch is skipped by every `return` inside the try —
    // and there are two, on the outcomes that are most likely. Those children
    // would then idle until the hard stop fired. The behavioural cases below
    // measure that; this names the construct so a refactor cannot quietly undo
    // it while they still pass on the one path they happen to exercise.
    expect(script).toMatch(/\}\s*finally\s*\{[\s\S]*process\.exit\(0\);[\s\S]*\}/);
  });
});

describe("twenty invocations do not become twenty refreshers", () => {
  it("schedules exactly one refresh across many overlapping calls", async () => {
    writeStaleCache("0.2.21");

    await Promise.all(Array.from({ length: 20 }, () => checkForUpdate("0.2.19")));

    expect(harness.calls).toHaveLength(1);
  });

  it("holds the lock, so a later invocation within the TTL adds nothing", () => {
    expect(acquireRefreshLock(lockDir())).toBe(true);
    expect(acquireRefreshLock(lockDir())).toBe(false);
    expect(acquireRefreshLock(lockDir())).toBe(false);
  });

  it("takes a lock over once it is older than the TTL, so a killed refresher cannot wedge it", () => {
    expect(acquireRefreshLock(lockDir())).toBe(true);
    const longAgo = new Date(Date.now() - 10 * 60 * 1000);
    fs.utimesSync(lockDir(), longAgo, longAgo);

    expect(acquireRefreshLock(lockDir())).toBe(true);
  });
});

/**
 * Each row is a way the environment can refuse the cache write or the child.
 * None of them may reach the caller: this runs before every command, on a CLI
 * whose `--json` output has to stay one parseable document.
 */
const HOSTILE = [
  {
    label: "spawn itself throws (a sandbox that forbids it)",
    arrange: () => {
      harness.refuseNextSpawn = true;
    }
  },
  {
    label: "the cache file holds truncated JSON",
    arrange: () => {
      fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
      fs.writeFileSync(cacheFile(), '{"lastChecked":1712,"latestVer');
    }
  },
  {
    label: "the cache file is not JSON at all",
    arrange: () => {
      fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
      fs.writeFileSync(cacheFile(), "  binary garbage ");
    }
  },
  {
    label: "the cache file is a directory",
    arrange: () => {
      fs.mkdirSync(cacheFile(), { recursive: true });
    }
  },
  {
    label: "no cache has ever been written",
    arrange: () => undefined
  },
  {
    label: "the state directory does not exist and the home dir is read-only",
    arrange: () => {
      fs.chmodSync(tmpHome, 0o500);
    }
  }
] as const;

/**
 * A half-written cache is the case the atomic rename exists to prevent, and it
 * is also the case a machine that predates the rename can still be holding.
 */
const UNREADABLE_CACHES = [
  {
    label: "truncated mid-write",
    write: (file: string) => fs.writeFileSync(file, '{"lastChecked":1712,"latestVer')
  },
  { label: "empty", write: (file: string) => fs.writeFileSync(file, "") },
  { label: "not JSON at all", write: (file: string) => fs.writeFileSync(file, "garbage") },
  { label: "JSON, but not an object", write: (file: string) => fs.writeFileSync(file, "[1,2,3]") },
  {
    label: "an object with no version",
    write: (file: string) => fs.writeFileSync(file, '{"lastChecked":1712}')
  },
  { label: "absent entirely", write: () => undefined },
  { label: "a directory where the file should be", write: (file: string) => fs.mkdirSync(file) }
] as const;

describe("nothing here may reach the caller", () => {
  it.each(eachOrRefuse(HOSTILE, "the ways the environment can refuse a background refresh"))(
    "$label — resolves without throwing and writes nothing to stdout",
    async ({ arrange }) => {
      arrange();
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

      try {
        // Null or a notice are both fine. Throwing is not, and neither is a byte
        // of output — a corrupt cache degrades to "no cache", never to a crash
        // and never to a wrong version claim.
        const result = await checkForUpdate("0.2.19");
        expect(result === null || result.includes("Update available")).toBe(true);
        expect(stdoutSpy).not.toHaveBeenCalled();
        expect(stderrSpy).not.toHaveBeenCalled();
      } finally {
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
        fs.chmodSync(tmpHome, 0o700);
      }
    }
  );

  it("never claims a version it cannot read", async () => {
    fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
    fs.writeFileSync(cacheFile(), "{ this is not json");

    await expect(checkForUpdate("0.2.19")).resolves.toBeNull();
  });

  /**
   * 🚨 THE CASES ABOVE CANNOT SEE WHICH LAYER SAVED THEM, AND THAT WAS MEASURED.
   *
   * `checkForUpdate` wraps its whole body in a catch, so deleting the degradation
   * inside `loadCache` — making a corrupt cache THROW — left all 21 cases green.
   * Two guards, one of them provably untested.
   *
   * `readCachedNewerVersion` is where the degradation is the only protection:
   * it has no catch of its own, and `commander` calls it while rendering `--help`.
   * A throw there is not a missed notice, it is `nexus --help` crashing on a file
   * the user has never heard of.
   */
  it.each(eachOrRefuse(UNREADABLE_CACHES, "the cache contents a synchronous read must survive"))(
    "$label — the help footer degrades to silence instead of throwing",
    ({ write }) => {
      fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
      write(cacheFile());

      expect(() => readCachedNewerVersion("0.2.19")).not.toThrow();
      expect(readCachedNewerVersion("0.2.19")).toBeNull();
    }
  );

  it("still reports a real cached version, so the case above is not vacuous", () => {
    fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
    fs.writeFileSync(
      cacheFile(),
      JSON.stringify({ lastChecked: Date.now(), latestVersion: "0.2.21" })
    );

    expect(readCachedNewerVersion("0.2.19")).toBe("0.2.21");
  });
});

describe("the paths that must schedule nothing", () => {
  it("spawns nothing under NEXUS_NO_AUTO_UPDATE", async () => {
    writeStaleCache("0.2.21");
    process.env.NEXUS_NO_AUTO_UPDATE = "1";

    await checkForUpdate("0.2.19");

    expect(harness.calls).toHaveLength(0);
  });

  it("spawns nothing under CI", async () => {
    writeStaleCache("0.2.21");
    process.env.CI = "1";

    await checkForUpdate("0.2.19");

    expect(harness.calls).toHaveLength(0);
  });

  it("spawns nothing when the cache is still fresh", async () => {
    fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
    fs.writeFileSync(
      cacheFile(),
      JSON.stringify({ lastChecked: Date.now(), latestVersion: "0.2.21" })
    );

    await checkForUpdate("0.2.19");

    expect(harness.calls).toHaveLength(0);
  });

  it("is never reached at all in --json mode", () => {
    // Read as text because the guard is a `return` in `index.ts`, above every
    // call into this module. A unit test of `checkForUpdate` cannot see it, and
    // a `--json` run that emitted one extra byte would stop being parseable.
    expect(INDEX_SRC).toMatch(/if \(isJsonMode\(\)\) return;/);
  });
});
