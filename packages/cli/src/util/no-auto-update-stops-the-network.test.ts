import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

/**
 * The registry request no longer happens in this process at all — a stale cache
 * schedules a DETACHED CHILD that does it, so the invocation never waits on the
 * network. That moves what this file has to watch: "no request" is now proven by
 * `spawnMock`, not only by `fetchSpy`, because a spawn is how a request would
 * reach npm from here today.
 *
 * 🚨 A FACTORY THAT OMITTED `spawn` WOULD MAKE EVERY REFUSAL CASE BELOW VACUOUS.
 * The import would be `undefined`, calling it would throw, and the scheduler's
 * own catch — which exists so a background nicety can never fail a command —
 * would swallow it. Zero spawns, zero requests, and a suite that proves nothing.
 */
const execSyncMock = vi.fn();
const spawnMock = vi.fn((_command: string, _args: string[], _options: Record<string, unknown>) => ({
  unref: () => undefined
}));
vi.mock("node:child_process", () => ({
  execSync: (...args: unknown[]) => execSyncMock(...args),
  spawn: (...args: unknown[]) => spawnMock(...(args as [string, string[], Record<string, unknown>]))
}));

import { autoUpdate, checkForUpdate, fetchLatestVersion } from "./version-check";

const UPGRADE_SRC = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../commands/upgrade.ts"),
  "utf8"
);

/**
 * THE DOCUMENTED OPT-OUT DID NOT STOP THE NETWORK CALL.
 *
 * `index.ts` decides what to do after every non-`--json` command with ONE `if`:
 *
 *     if (opts.autoUpdate && !isAutoUpdateDisabled())  -> install over yourself
 *     else                                             -> checkForUpdate(...)
 *
 * `isAutoUpdateDisabled()` was a term in the FIRST arm only, and `--auto-update`
 * is off by default — so the `else` arm was the DEFAULT path AND the one holding
 * the registry request. Setting `NEXUS_NO_AUTO_UPDATE=1` did not disable the
 * updater; it selected the half of it that talks to npm.
 *
 * Measured on 0.26.0, built, with a fresh HOME — `nexus auth status` against
 * `registry.npmjs.org/@agent-nexus/cli/latest`. Requests made BY THE INVOCATION
 * ITSELF, which is now always zero: the refresh runs in a detached child, so the
 * column that matters is whether one is started at all.
 *
 *   no variable              refresh scheduled
 *   NEXUS_NO_AUTO_UPDATE=1   nothing scheduled   <- the escape hatch
 *   CI=1                     nothing scheduled   <- and the implicit one
 *   --json                   nothing scheduled   (index.ts returns first)
 *
 * The opt-out has to cover the SPAWN, not only the request. A detached child
 * making an unasked-for registry call is the worse version of the same offence:
 * it outlives the command that started it, so a user watching the process exit
 * cannot even see it happen.
 *
 * ── WHY THIS FILE ASSERTS IN BOTH DIRECTIONS ────────────────────────────────
 *
 * "No request was made" is the assertion a stub that calls nothing passes
 * perfectly. Every refusal case below is therefore paired with a case that
 * DEMANDS the request, over the same fixture and the same spy, so a fixture that
 * quietly stopped reaching the network fails instead of reading as a fix.
 */

const CACHE_REL = path.join(".nexus-mcp", "version-check.json");
const DAY_MS = 24 * 60 * 60 * 1000;

let tmpHome: string;
let homedirSpy: ReturnType<typeof vi.spyOn>;
let fetchSpy: MockInstance<typeof globalThis.fetch>;
let savedEnv: Record<string, string | undefined>;

const ENV_KEYS = ["NEXUS_NO_AUTO_UPDATE", "CI"] as const;

/**
 * A cache old enough that a permitted check MUST go to the network to answer.
 * Every case starts here: with a fresh cache the absence of a request proves
 * nothing, because there would be no request either way.
 */
function writeStaleCache(latestVersion: string): void {
  const file = path.join(tmpHome, CACHE_REL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ lastChecked: Date.now() - 25 * 60 * 60 * 1000, latestVersion })
  );
}

function readCache(): { lastChecked: number; latestVersion: string } {
  return JSON.parse(fs.readFileSync(path.join(tmpHome, CACHE_REL), "utf8")) as {
    lastChecked: number;
    latestVersion: string;
  };
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "no-auto-update-test-"));
  homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(tmpHome);
  fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ version: "9.9.9" })));
  execSyncMock.mockReset();
  spawnMock.mockClear();
  execSyncMock.mockImplementation(() => Buffer.from(""));
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  homedirSpy.mockRestore();
  fetchSpy.mockRestore();
  fs.rmSync(tmpHome, { recursive: true, force: true });
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

/**
 * Each row is one way to say "the automatic updater is off", and the SET is the
 * point: `CI` was leaking exactly as hard as the named variable, and a suite
 * that only covered `NEXUS_NO_AUTO_UPDATE` would have called that fixed.
 */
const DISABLING = [
  { label: "NEXUS_NO_AUTO_UPDATE=1", env: { NEXUS_NO_AUTO_UPDATE: "1" } },
  { label: "NEXUS_NO_AUTO_UPDATE=true", env: { NEXUS_NO_AUTO_UPDATE: "true" } },
  { label: "CI=1", env: { CI: "1" } },
  { label: "CI=true", env: { CI: "true" } }
] as const;

/**
 * The values this variable is documented to IGNORE. They are here because they
 * are the negative control on the parse: a gate that fired on any value at all
 * would pass every case above and silently disable the check for a user who
 * wrote `CI=false` to turn it back on.
 */
const NOT_DISABLING = [
  { label: "NEXUS_NO_AUTO_UPDATE=0", env: { NEXUS_NO_AUTO_UPDATE: "0" } },
  { label: "NEXUS_NO_AUTO_UPDATE=false", env: { NEXUS_NO_AUTO_UPDATE: "false" } },
  { label: "CI=0", env: { CI: "0" } },
  { label: "unset", env: {} }
] as const;

function applyEnv(env: Record<string, string>): void {
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
}

describe("checkForUpdate makes NO registry request when the updater is off", () => {
  it.each(eachOrRefuse(DISABLING, "the spellings that disable the automatic updater"))(
    "$label — zero requests",
    async ({ env }) => {
      writeStaleCache("0.2.21");
      applyEnv(env);

      await checkForUpdate("0.2.19");

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(spawnMock).not.toHaveBeenCalled();
    }
  );

  it.each(eachOrRefuse(NOT_DISABLING, "the spellings that leave the automatic updater on"))(
    "$label — the refresh IS scheduled, so the case above is not vacuous",
    async ({ env }) => {
      writeStaleCache("0.2.21");
      applyEnv(env);

      await checkForUpdate("0.2.19");

      // Still zero requests from THIS process — that is the point of the child.
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(spawnMock).toHaveBeenCalledTimes(1);
      // The registry is named in the child's program, which is where the request
      // now lives. Asserting only the call count would pass on a spawn of
      // anything at all.
      expect(String(spawnMock.mock.calls[0]?.[1]?.[1])).toContain("registry.npmjs.org");
    }
  );

  it("still prints the notice the docs promise, from the cache, with no request", async () => {
    // The refusal is narrow on purpose. `NEXUS_NO_AUTO_UPDATE` is documented as
    // "ignore --auto-update, print the notice instead" — removing the notice
    // along with the request would be a second broken promise, not a fix.
    writeStaleCache("0.2.21");
    process.env.NEXUS_NO_AUTO_UPDATE = "1";

    const msg = await checkForUpdate("0.2.19");

    expect(msg).toContain("Update available: 0.2.19 → 0.2.21");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("says nothing, and does not throw, when the cache has never been written", async () => {
    process.env.NEXUS_NO_AUTO_UPDATE = "1";

    await expect(checkForUpdate("0.2.19")).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("leaves lastChecked alone, so unsetting the variable checks immediately", async () => {
    // Stamping `lastChecked = now` on a skipped check would suppress the next
    // REAL check for 24 h — the opt-out would keep acting for a day after it
    // was removed, which is a second bug wearing this one's fix.
    writeStaleCache("0.2.21");
    const before = readCache().lastChecked;
    process.env.CI = "1";

    await checkForUpdate("0.2.19");

    expect(readCache().lastChecked).toBe(before);
    expect(Date.now() - readCache().lastChecked).toBeGreaterThan(DAY_MS);
  });
});

describe("autoUpdate makes no request and starts no install when the updater is off", () => {
  it.each(eachOrRefuse(DISABLING, "the spellings that disable the automatic updater"))(
    "$label — no request, no install",
    async ({ env }) => {
      writeStaleCache("0.2.21");
      applyEnv(env);

      await expect(autoUpdate("0.2.19")).resolves.toBeNull();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(spawnMock).not.toHaveBeenCalled();
      expect(execSyncMock).not.toHaveBeenCalled();
    }
  );

  it("installs when nothing disables it, so the case above is not vacuous", async () => {
    writeStaleCache("0.2.21");

    const msg = await autoUpdate("0.2.19");

    // 0.2.21 is the CACHED version, not the 9.9.9 the mocked fetch would return.
    // That is the trade this design makes visible: the install acts on what the
    // last run already learned, and the refresh it schedules is for the next one.
    expect(msg).toContain("Successfully auto-updated to 0.2.21");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(execSyncMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * THE GATE MUST NOT SINK ANY LOWER THAN `checkForUpdate`.
 *
 * The tidiest-looking version of this fix puts the refusal in
 * `fetchLatestVersion`, the one function that owns the request — and it breaks
 * `nexus upgrade`, because an explicit upgrade command is the user ASKING and
 * has to look the version up. `NEXUS_NO_AUTO_UPDATE` names the AUTOMATIC
 * updater; it is not a global network kill switch, and a machine that sets it
 * permanently must still be able to upgrade on demand.
 */
describe("an explicit upgrade is not the automatic updater", () => {
  it("fetchLatestVersion still reaches the registry with both variables set", async () => {
    process.env.NEXUS_NO_AUTO_UPDATE = "1";
    process.env.CI = "1";

    await expect(fetchLatestVersion()).resolves.toBe("9.9.9");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("and `nexus upgrade` is wired to that function, so the case above is the real path", () => {
    // Read as text on purpose: the wiring is the whole claim, and a refactor
    // that routed the command through `checkForUpdate` would leave every
    // assertion in this file green while `nexus upgrade` stopped working
    // wherever the variable is set.
    expect(UPGRADE_SRC).toMatch(/fetchLatest:\s*fetchLatestVersion/);
  });
});
