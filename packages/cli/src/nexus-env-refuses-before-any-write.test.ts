import fs from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE REFUSAL HAPPENS BEFORE THE WRITE, AND *THAT* IS THE PROPERTY.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY AN ARM ASSERTING "IT THROWS" WOULD PROVE NOTHING HERE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 `resolveDashboardUrl` ALREADY THREW ON THE BROKEN CODE. An arm asserting a
 * throw is green with the defect present and green with it fixed, because the
 * defect was never *whether* the refusal happened — it was *when*.
 *
 * `resolveBaseUrl` and `resolveDashboardUrl` walk INDEPENDENT chains and each
 * consults `NEXUS_ENV` LAST. So the API host can be settled by an earlier term
 * — an override, a named profile, `NEXUS_BASE_URL`, or an ACTIVE PROFILE
 * carrying a `baseUrl` and NO `dashboardUrl`, which is the fixture below and
 * needs no flag and no other variable — while the console host falls all the
 * way through and refuses. About sixteen commands build their console link
 * AFTER the mutating call, so the resource was created and the process then
 * exited non-zero. A script reads that as a failed create and retries, and the
 * retry duplicates the resource: strictly worse than the silent wrong-host
 * write NEX-5919 set out to remove.
 *
 * ── WHAT THE ARM ACTUALLY ASSERTS ────────────────────────────────────────────
 *
 * That NO REQUEST WAS ISSUED. A non-zero exit is necessary and says nothing
 * about ordering; only the absence of a call to `fetch` does, and only because
 * the arm above it proves the very same invocation DOES call `fetch` when the
 * environment name is one this CLI knows. Without that positive control the
 * zero is satisfied by any harness that never reached the network layer at all
 * — a missing credential, a mis-built program, a command that refused its own
 * arguments.
 */

const SANDBOX = vi.hoisted(() => {
  // 🚨 BEFORE THE IMPORTS BELOW. `config.ts` computes its config directory from
  // `os.homedir()` at MODULE LOAD, so a `beforeEach` is too late and every case
  // would read the developer's real profiles instead of this fixture.
  const dir = `${process.env.TMPDIR ?? "/tmp"}/nexus-env-order-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import { buildRootProgram } from "./index";

const API = "http://127.0.0.1:19701";

/**
 * A profile with a `baseUrl` and NO `dashboardUrl` — the no-flag trigger.
 *
 * The API host is settled by the active profile, so `resolveBaseUrl` returns
 * without ever looking at `NEXUS_ENV`; the dashboard has nothing to settle it
 * and reaches the environment name.
 */
const CONFIG = {
  activeProfile: "default",
  profiles: { default: { apiKey: "nxs_o_fixture_aaaaaaaaaaaa", baseUrl: API } }
};

/**
 * How many requests the invocation issued.
 *
 * A counter rather than a typed spy handle: `vi.spyOn(globalThis, "fetch")`
 * returns a `MockInstance` whose signature no loose annotation accepts, and the
 * only thing any arm here asks is HOW MANY calls there were.
 */
let fetchCalls = 0;

beforeEach(() => {
  fs.mkdirSync(path.join(SANDBOX, ".nexus-mcp"), { recursive: true });
  fs.writeFileSync(path.join(SANDBOX, ".nexus-mcp", "config.json"), JSON.stringify(CONFIG), {
    mode: 0o600
  });

  // The canned 201 below is a stub, not a real agent, so the SDK's response
  // contract check warns about every field it omits. That warning is correct
  // and is noise here; it says nothing about what this file asserts.
  process.env.NEXUS_CONTRACT_WARNINGS = "off";
  delete process.env.NEXUS_ENV;
  delete process.env.NEXUS_BASE_URL;
  delete process.env.NEXUS_DASHBOARD_URL;
  delete process.env.NEXUS_PROFILE;
  delete process.env.NEXUS_API_KEY;

  // ⚠️ A FRESH `Response` PER CALL. `mockResolvedValue` hands every caller the
  // SAME object, and a body can only be read once — the second call fails with
  // `Body has already been read`, which reads as a transport fault.
  fetchCalls = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    fetchCalls += 1;
    return Promise.resolve(
      new Response(
        JSON.stringify({ success: true, data: { id: "agent-1", firstName: "Ada", lastName: "L" } }),
        { status: 201, headers: { "content-type": "application/json" } }
      )
    );
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  // 🚨 A LEAKED NON-ZERO `process.exitCode` FAILS THE WHOLE RUN. The command's
  // own catch sets it, so it has to be put back or this file reds every sibling
  // by exiting the worker non-zero with nothing to point at.
  process.exitCode = 0;
  vi.restoreAllMocks();
});

afterAll(() => {
  delete process.env.NEXUS_CONTRACT_WARNINGS;
  fs.rmSync(SANDBOX, { recursive: true, force: true });
});

/** Run `nexus agent create` through the real root program. */
async function runAgentCreate(): Promise<{ threw: boolean; exitCode: number }> {
  let threw = false;
  try {
    await buildRootProgram("0.0.0-test").parseAsync([
      "node",
      "nexus",
      "--json",
      "agent",
      "create",
      // 🔴 ALL THREE ARE `requiredOption`, AND OMITTING ONE IS HOW THIS WHOLE
      // FILE GOES VACUOUS. Commander refuses the invocation before anything
      // resolves a host, so `fetch` is never called and every "no request"
      // arm below passes for a reason that has nothing to do with NEXUS_ENV.
      // The positive control is what caught it — it reported 0 calls on a
      // known environment, which is the one reading the defect cannot produce.
      "--first-name",
      "Ada",
      "--last-name",
      "Lovelace",
      "--role",
      "Analyst"
    ]);
  } catch {
    threw = true;
  }
  return { threw, exitCode: typeof process.exitCode === "number" ? process.exitCode : 0 };
}

describe("an unrecognised NEXUS_ENV refuses before the command writes anything", () => {
  it("POSITIVE CONTROL: the same invocation DOES issue a request on a known env", async () => {
    // Without this, the zero below is satisfied by any harness that never got
    // near the network — and that harness looks identical in the report.
    const outcome = await runAgentCreate();

    expect(fetchCalls, "the control must reach the network").toBeGreaterThan(0);
    expect(outcome.threw).toBe(false);
  });

  it("ISSUES NO REQUEST AT ALL when NEXUS_ENV names no environment", async () => {
    process.env.NEXUS_ENV = "banana";

    const outcome = await runAgentCreate();

    // 🔴 THIS IS THE ARM. Everything else in the file is scaffolding for it.
    expect(fetchCalls, "a request was issued before the refusal").toBe(0);
    expect(outcome.threw, "the refusal must reach the caller").toBe(true);
  });

  it("still issues no request when only the API host is pinned by an env var", async () => {
    // The same defect through the other short-circuit: `NEXUS_BASE_URL` settles
    // the API host, `NEXUS_DASHBOARD_URL` is unset, so the dashboard resolver
    // is the one that reaches the environment name.
    process.env.NEXUS_ENV = "banana";
    process.env.NEXUS_BASE_URL = API;

    const outcome = await runAgentCreate();

    expect(fetchCalls).toBe(0);
    expect(outcome.threw).toBe(true);
  });

  it("issues a request for an EMPTY NEXUS_ENV, which is what CI templating writes", async () => {
    // `NEXUS_ENV: ${{ vars.NEXUS_ENV }}` over a variable that does not exist is
    // `""`, and `??` does not default on it. Refusing here would break callers
    // who never chose anything — the opposite of the point.
    process.env.NEXUS_ENV = "";

    const outcome = await runAgentCreate();

    expect(fetchCalls).toBeGreaterThan(0);
    expect(outcome.threw).toBe(false);
  });
});
