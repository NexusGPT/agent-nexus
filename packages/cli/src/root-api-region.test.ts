import fs from "node:fs";

import { CommanderError } from "commander";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 🚨 HOISTED, BEFORE THE IMPORTS BELOW — `config.ts` reads `os.homedir()` at
 * module load, so a `HOME` moved later would let every arm read the developer's
 * real profiles and answer THEIR host. `base-url-precedence.test.ts` carries
 * the measurement; this sandbox is empty, so no stored profile takes part.
 */
const SANDBOX = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/nexus-api-region-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import { resolveBaseUrl } from "./config";
import { buildRootProgram } from "./index";

/**
 * `--api-region` THROUGH THE REAL PROGRAM: the option as `index.ts` declares
 * it, the root `preAction` hook as installed, and the canon `resolveBaseUrl`
 * every command calls. Only the leaf is a probe — it records the host the
 * canon answers from the globals commander merged, which is exactly what each
 * real command hands it. One arm per `it`.
 */

const EU = "https://api.nexusgpt.io";
const US = "https://api.us.gpt.nexus";
const EXPLICIT = "http://127.0.0.1:19611";
const AMBIENT = "http://127.0.0.1:19612";

beforeEach(() => {
  fs.mkdirSync(SANDBOX, { recursive: true });
  delete process.env.NEXUS_BASE_URL;
  delete process.env.NEXUS_API_KEY;
  delete process.env.NEXUS_PROFILE;
  delete process.env.NEXUS_ENV;
});

afterAll(() => {
  delete process.env.NEXUS_BASE_URL;
  fs.rmSync(SANDBOX, { recursive: true, force: true });
});

/** The host a command run with `argv` (globals only) would send to. */
async function hostFor(argv: readonly string[]): Promise<string> {
  const program = buildRootProgram("0.0.0-test").exitOverride();
  let host: string | undefined;
  program.command("region-probe").action((_opts, command) => {
    const globals = command.optsWithGlobals();
    host = resolveBaseUrl(globals.baseUrl, globals.profile);
  });
  await program.parseAsync(["region-probe", ...argv], { from: "user" });
  if (host === undefined) throw new Error("the probe action never ran");
  return host;
}

describe("--api-region", () => {
  it("with nothing set, the host is the EU default, unchanged", async () => {
    expect(await hostFor([])).toBe(EU);
  });

  it("us targets the US host", async () => {
    expect(await hostFor(["--api-region", "us"])).toBe(US);
  });

  it("eu targets the EU host", async () => {
    expect(await hostFor(["--api-region", "eu"])).toBe(EU);
  });

  it("NEXUS_BASE_URL alone is still honoured", async () => {
    process.env.NEXUS_BASE_URL = AMBIENT;
    expect(await hostFor([])).toBe(AMBIENT);
  });

  it("wins over NEXUS_BASE_URL", async () => {
    process.env.NEXUS_BASE_URL = AMBIENT;
    expect(await hostFor(["--api-region", "us"])).toBe(US);
  });

  it("loses to an explicit --base-url, in either order on the line", async () => {
    expect(await hostFor(["--api-region", "us", "--base-url", EXPLICIT])).toBe(EXPLICIT);
  });

  it("loses to an explicit --base-url typed first", async () => {
    expect(await hostFor(["--base-url", EXPLICIT, "--api-region", "us"])).toBe(EXPLICIT);
  });

  it("refuses a name the SDK's table does not hold, before any action runs", async () => {
    let caught: unknown;
    try {
      await hostFor(["--api-region", "mars"]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CommanderError);
    expect(caught instanceof CommanderError ? caught.code : undefined).toBe(
      "commander.invalidArgument"
    );
  });
});
