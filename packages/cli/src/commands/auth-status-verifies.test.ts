/**
 * `nexus auth status` MUST SEND A REQUEST, AND MUST EXIT NON-ZERO WHEN IT FAILS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS BESIDE `auth-probe.test.ts`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * That file proves the PROBE maps every wire shape to the right refusal. It says
 * nothing about whether any command calls it. Deleting the `probeCredential` call
 * from `auth status` leaves every one of those cases green and restores the exact
 * defect this work closed: local config read, key present, exit `0`, and the 63
 * calls behind the preflight failing on auth.
 *
 * So the population here is the WIRING, and the assertion is on the two things a
 * caller can actually observe — whether a request went out, and what the process
 * exited with. Both are asserted for the bad key AND the good one: a fix that
 * reddens a working credential refuses correct work and gets reverted, which
 * protects nothing.
 *
 * ── WHY IT ASSERTS `fetch` WAS CALLED AND NOT ONLY THE EXIT CODE ─────────────
 *
 * An exit code alone cannot separate "verified against the server" from "guessed
 * from the key's shape". A future refactor that decided a key looked invalid
 * locally would satisfy an exit-code-only test and would be the same class of
 * defect — a verdict nobody measured.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SANDBOX = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/nexus-status-verify-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import fs from "node:fs";
import path from "node:path";

import { type NexusProfile } from "../config";
import { EXIT_CODES } from "../exit-codes";
import { buildRootProgram } from "../index";
import { setJsonMode } from "../output";

const CONFIG_FILE = path.join(SANDBOX, ".nexus-mcp", "config.json");
const BASE_URL = "https://api.example.test";

const LIVE_PROFILE: NexusProfile = {
  apiKey: "nxs_u_aaaabbbbccccddddeeeeffff",
  baseUrl: BASE_URL
};

function writeConfig(profile: NexusProfile = LIVE_PROFILE): void {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ activeProfile: "p", profiles: { p: profile } }));
}

/** A `fetch` double answering one status, counting the calls it received. */
function stubFetch(status: number, body: unknown = {}): { calls: () => number } {
  let calls = 0;
  vi.stubGlobal("fetch", () => {
    calls += 1;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body)
    });
  });
  return { calls: () => calls };
}

/** Run `nexus auth status …` and return what a caller sees: stdout and the code. */
async function runStatus(argv: string[]): Promise<{ out: string; exitCode: number }> {
  const program = buildRootProgram();
  program.exitOverride();

  const stdout: string[] = [];
  const logSpy = vi
    .spyOn(console, "log")
    .mockImplementation((...args: unknown[]) => void stdout.push(args.map(String).join(" ")));
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    await program.parseAsync(["node", "nexus", "auth", "status", ...argv]);
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
  // `process.exitCode` is left unset on success — which IS exit 0, and reading it
  // as anything else would make the success cases pass for the wrong reason.
  return { out: stdout.join("\n"), exitCode: Number(process.exitCode ?? 0) };
}

beforeEach(() => {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  writeConfig();
  process.exitCode = undefined;
  delete process.env.NEXUS_API_KEY;
  delete process.env.NEXUS_PROFILE;
  delete process.env.NEXUS_BASE_URL;
  delete process.env.NEXUS_ORGANIZATION_ID;
});

afterEach(() => {
  vi.unstubAllGlobals();
  setJsonMode(false);
  process.exitCode = undefined;
  fs.rmSync(SANDBOX, { recursive: true, force: true });
});

describe("auth status verifies the credential it reports on", () => {
  it("sends a request and exits 0 when the API accepts the key", async () => {
    // The direction a wrong fix breaks. A gate that reddens a working credential
    // refuses correct work, gets reverted, and then the real hole is open again.
    const fetch = stubFetch(200, { data: { orgId: "org_1", orgName: "Acme" } });

    const { out, exitCode } = await runStatus(["--json"]);

    expect(exitCode).toBe(0);
    expect(fetch.calls()).toBe(1);
    expect(JSON.parse(out)).toMatchObject({ verified: true, baseUrl: BASE_URL });
  });

  it("exits `not-authenticated` when the server refuses the key — THE DEFECT", async () => {
    // This is the case that exited 0 and let 63 calls run against a dead key.
    const fetch = stubFetch(401);

    const { out, exitCode } = await runStatus(["--json"]);

    expect(exitCode).toBe(EXIT_CODES["not-authenticated"]);
    expect(exitCode).not.toBe(0);
    expect(fetch.calls()).toBe(1);
    // Under --json a failure is the error document and nothing else, and it names
    // the profile and the host — the two facts the record would have carried.
    const document = JSON.parse(out);
    expect(document.error.code).toBe("CLI_NOT_AUTHENTICATED");
    expect(document.error.message).toContain(BASE_URL);
    expect(document.error).not.toHaveProperty("verified");
  });

  it("exits `connection-failed`, NOT `not-authenticated`, when nothing answers", async () => {
    // "Get a new key" and "check your network" are opposite actions. Reporting a
    // dead network as a dead credential is the same defect one layer down.
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));

    const { out, exitCode } = await runStatus(["--json"]);

    expect(exitCode).toBe(EXIT_CODES["connection-failed"]);
    expect(exitCode).not.toBe(EXIT_CODES["not-authenticated"]);
    expect(JSON.parse(out).error.code).toBe("CLI_CONNECTION_FAILED");
  });

  it("exits `remote-error` when the server was reached and broke", async () => {
    stubFetch(503);

    const { exitCode } = await runStatus(["--json"]);

    expect(exitCode).toBe(EXIT_CODES["remote-error"]);
  });

  it("refuses a profile holding no key WITHOUT sending a request", async () => {
    // Sending a blank key earns a 401 and reads as "the server rejected your
    // key", naming a credential the profile does not hold.
    writeConfig({ apiKey: "", baseUrl: BASE_URL });
    const fetch = stubFetch(401);

    const { out, exitCode } = await runStatus(["--json"]);

    expect(exitCode).toBe(EXIT_CODES["not-authenticated"]);
    expect(fetch.calls()).toBe(0);
    expect(JSON.parse(out).error.message).toContain("No API key stored");
  });

  it("exits `not-authenticated` when there is no profile at all", async () => {
    fs.rmSync(SANDBOX, { recursive: true, force: true });
    const fetch = stubFetch(200);

    const { exitCode } = await runStatus(["--json"]);

    expect(exitCode).toBe(EXIT_CODES["not-authenticated"]);
    expect(fetch.calls()).toBe(0);
  });
});

describe("--no-verify reports an UNRUN check as unrun, never as a pass", () => {
  it("sends nothing, exits 0, and reports `verified: null` rather than `true`", async () => {
    const fetch = stubFetch(401);

    const { out, exitCode } = await runStatus(["--json", "--no-verify"]);

    expect(exitCode).toBe(0);
    expect(fetch.calls()).toBe(0);
    // 🚨 THREE VALUES, NEVER TWO. `true` would claim a check nobody ran; `false`
    // would claim the key was judged and failed. Neither happened.
    const document = JSON.parse(out);
    expect(document.verified).toBeNull();
    expect(document.verified).not.toBe(true);
    expect(document.verified).not.toBe(false);
  });

  it("says so on the human channel too, where there is no field to read", async () => {
    stubFetch(401);

    const { out } = await runStatus(["--no-verify"]);

    // Silence here reads as a pass, which is the false green the flag is allowed
    // to produce and must therefore announce.
    expect(out).toContain("NOT VERIFIED");
  });
});

/** Run any `nexus auth <verb> --json` and return what a caller sees. */
async function runVerb(verb: string): Promise<{ out: string; exitCode: number }> {
  const program = buildRootProgram();
  program.exitOverride();

  const stdout: string[] = [];
  const logSpy = vi
    .spyOn(console, "log")
    .mockImplementation((...args: unknown[]) => void stdout.push(args.map(String).join(" ")));
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    await program.parseAsync(["node", "nexus", "--json", "auth", verb]);
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
  return { out: stdout.join("\n"), exitCode: Number(process.exitCode ?? 0) };
}

describe("no refusal names a flag its own command does not declare", () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * THIS DRIVES THE REAL COMMANDS. AN EARLIER VERSION DID NOT, AND WAS VACUOUS.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `refusalForProbe` hardcoded ", or re-run with --no-verify" while both verbs
   * shared it, so an unreachable API from `auth whoami` — which declares no such
   * flag — pointed the reader at an invocation commander rejects. Extracting the
   * helper to REMOVE drift is what created it: a caller-specific sentence moved
   * into the shared copy and went silently wrong for the caller that differed.
   *
   * The first attempt at this rule walked a `callers` list written by hand in the
   * test, pairing each verb with the advice it was BELIEVED to pass. Restoring the
   * exact bug in `auth.ts` left it green — it was asserting its own table, not the
   * code. So this drives each verb for real and reads the hint the process
   * actually emits, then checks every flag in it against that command's own
   * declared options.
   */
  const GLOBAL_FLAGS = new Set(["--timeout", "--json", "--profile", "--api-key", "--base-url"]);

  /** Every `auth` leaf that verifies a credential, from the real tree. */
  function verifyingVerbs(): readonly string[] {
    const auth = buildRootProgram().commands.find((c) => c.name() === "auth");
    return (auth?.commands ?? [])
      .map((c) => c.name())
      .filter((n) => n === "status" || n === "whoami");
  }

  function declaredFlags(verb: string): ReadonlySet<string> {
    const auth = buildRootProgram().commands.find((c) => c.name() === "auth");
    const command = auth?.commands.find((c) => c.name() === verb);
    const declared = new Set<string>(GLOBAL_FLAGS);
    for (const option of command?.options ?? []) {
      if (option.long) declared.add(option.long);
    }
    return declared;
  }

  it("CONTROL: the tree really has the verbs this rule walks", () => {
    // An empty verb list and a clean sweep are the same green.
    expect([...verifyingVerbs()].sort()).toEqual(["status", "whoami"]);
  });

  it("every flag in an unreachable-API refusal is declared on the verb that emitted it", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));

    for (const verb of verifyingVerbs()) {
      process.exitCode = undefined;
      const { out, exitCode } = await runVerb(verb);

      // The refusal has to have happened, or there is no hint to inspect.
      expect(exitCode, `${verb} must refuse an unreachable API`).not.toBe(0);
      const { error } = JSON.parse(out) as { error: { message: string; hint: string | null } };

      const declared = declaredFlags(verb);
      const text = `${error.message} ${error.hint ?? ""}`;
      for (const flag of text.match(/--[a-z][a-z0-9-]*/g) ?? []) {
        expect(declared.has(flag), `nexus auth ${verb} refusal names ${flag}, which it lacks`).toBe(
          true
        );
      }
    }
  });

  it("CONTROL: the refusals DO name flags, so the sweep above is not passing on empty text", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    process.exitCode = undefined;

    const { out } = await runVerb("status");
    const { error } = JSON.parse(out) as { error: { hint: string | null } };

    // `status` declares --no-verify, so it is entitled to name it — and must.
    expect(error.hint ?? "").toContain("--no-verify");
  });
});
