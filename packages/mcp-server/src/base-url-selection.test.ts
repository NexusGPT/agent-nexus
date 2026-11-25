import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { parseHostArgs } from "./host-args";

/**
 * WHICH HOST THE BRIDGE TALKS TO: `--base-url` > `--region` > `NEXUS_BASE_URL`
 * > the config file > `NEXUS_ENV` > the EU default.
 *
 * `config.ts` resolves `~/.nexus-mcp/config.json` once, at load, so the home
 * directory is moved BEFORE the dynamic import — a static import would read the
 * real machine's profile and answer its host. The config file starts absent;
 * the arm that needs one writes it. One arm per `it`.
 */

type ConfigModule = typeof import("./config");

const EU = "https://api.nexusgpt.io";
const US = "https://api.us.gpt.nexus";
const EXPLICIT = "http://127.0.0.1:19701";
const AMBIENT = "http://127.0.0.1:19702";
const STORED = "http://127.0.0.1:19703";

let mod: ConfigModule;
let home: string;
let configFile: string;

beforeAll(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-mcp-base-url-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  configFile = path.join(home, ".nexus-mcp", "config.json");
  mod = await import("./config");
});

beforeEach(() => {
  fs.rmSync(path.dirname(configFile), { recursive: true, force: true });
  delete process.env.NEXUS_BASE_URL;
  delete process.env.NEXUS_ENV;
  delete process.env.NEXUS_PROFILE;
});

afterAll(() => {
  delete process.env.NEXUS_BASE_URL;
  fs.rmSync(home, { recursive: true, force: true });
});

function writeStoredBaseUrl(baseUrl: string): void {
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify({ apiKey: "nxs_x", baseUrl }), { mode: 0o600 });
}

describe("the bridge's base URL", () => {
  it("with nothing set, is the EU default exactly as before", () => {
    expect(mod.resolveBaseUrlWithSource()).toEqual({ baseUrl: EU, source: "default" });
  });

  it("--region us targets the US host", () => {
    expect(mod.resolveBaseUrlWithSource({ region: "us" })).toEqual({
      baseUrl: US,
      source: "region"
    });
  });

  it("--region eu targets the EU host", () => {
    expect(mod.resolveBaseUrl({ region: "eu" })).toBe(EU);
  });

  it("NEXUS_BASE_URL alone is still honoured", () => {
    process.env.NEXUS_BASE_URL = AMBIENT;
    expect(mod.resolveBaseUrl()).toBe(AMBIENT);
  });

  it("--region wins over NEXUS_BASE_URL", () => {
    process.env.NEXUS_BASE_URL = AMBIENT;
    expect(mod.resolveBaseUrl({ region: "us" })).toBe(US);
  });

  it("--region wins over the stored config", () => {
    writeStoredBaseUrl(STORED);
    expect(mod.resolveBaseUrl({ region: "us" })).toBe(US);
  });

  it("--base-url wins over NEXUS_BASE_URL", () => {
    process.env.NEXUS_BASE_URL = AMBIENT;
    expect(mod.resolveBaseUrlWithSource({ override: EXPLICIT })).toEqual({
      baseUrl: EXPLICIT,
      source: "flag"
    });
  });

  it("--base-url wins over --region", () => {
    expect(mod.resolveBaseUrl({ override: EXPLICIT, region: "us" })).toBe(EXPLICIT);
  });

  it("refuses a region the SDK's table does not hold", () => {
    expect(() => mod.resolveBaseUrl({ region: "mars" })).toThrow(/Accepted: eu, us/);
  });
});

describe("parseHostArgs", () => {
  it("reads both flags in the spaced form", () => {
    expect(parseHostArgs(["--base-url", EXPLICIT, "--region", "us"])).toEqual({
      override: EXPLICIT,
      region: "us"
    });
  });

  it("reads both flags in the = form", () => {
    expect(parseHostArgs([`--base-url=${EXPLICIT}`, "--region=us"])).toEqual({
      override: EXPLICIT,
      region: "us"
    });
  });

  it("ignores arguments it does not know, as the bridge always has", () => {
    expect(parseHostArgs(["--verbose", "serve"])).toEqual({});
  });

  it("refuses a flag with no value rather than dropping it", () => {
    expect(() => parseHostArgs(["--region"])).toThrow(/--region needs a value/);
  });

  it("refuses a flag whose value is the next flag", () => {
    expect(() => parseHostArgs(["--region", "--base-url", EXPLICIT])).toThrow(
      /--region needs a value/
    );
  });
});
