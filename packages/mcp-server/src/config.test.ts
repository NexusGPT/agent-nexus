import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * READ AND WRITE MUST NAME THE SAME PROFILE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE FAILURE THIS PINS, IN THE ORDER A USER WOULD HIT IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every write in this package is a read-modify-write: `logout` calls
 * `loadConfig()`, deletes `apiKey` from what it got back, and hands the result to
 * `saveConfig()`. So the two functions disagreeing about WHICH profile they mean
 * is not a cosmetic split — it moves the mutation onto a different entry:
 *
 *     NEXUS_PROFILE=staging nexus-mcp logout
 *       reads  staging   → finds a key → deletes it
 *       writes production
 *
 * The key the operator asked to remove is still there, the one they were using in
 * another shell is gone, and the command prints "Logged out." either way. `login`
 * has the identical shape, storing a freshly pasted key on a profile nobody
 * named.
 *
 * ⚠️ THE HOME DIRECTORY IS SET BEFORE THE MODULE IS IMPORTED. `config.ts` resolves
 * `~/.nexus-mcp/config.json` ONCE, at load, so a static import would bind this
 * suite to whatever profiles the machine running it happens to have — and would
 * WRITE to them.
 */

type ConfigModule = typeof import("./config");

let mod: ConfigModule;
let home: string;
let configFile: string;

const V2 = {
  activeProfile: "production",
  profiles: {
    production: { apiKey: "nxs_prod", baseUrl: "https://api.nexusgpt.io", orgId: "org_prod" },
    staging: { apiKey: "nxs_staging", baseUrl: "https://staging.invalid", orgId: "org_staging" }
  }
};

beforeAll(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-mcp-config-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  configFile = path.join(home, ".nexus-mcp", "config.json");
  mod = await import("./config");
});

beforeEach(() => {
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(V2, null, 2));
  delete process.env.NEXUS_PROFILE;
  delete process.env.NEXUS_API_KEY;
  delete process.env.NEXUS_BASE_URL;
  delete process.env.NEXUS_ORGANIZATION_ID;
});

afterEach(() => {
  delete process.env.NEXUS_PROFILE;
  delete process.env.NEXUS_API_KEY;
  delete process.env.NEXUS_ORGANIZATION_ID;
});

function onDisk(): typeof V2 {
  return JSON.parse(fs.readFileSync(configFile, "utf-8"));
}

describe("which profile this process is on", () => {
  it("reads the active profile when nothing else selects one", () => {
    expect(mod.loadConfig()).toEqual({
      apiKey: "nxs_prod",
      baseUrl: "https://api.nexusgpt.io",
      orgId: "org_prod"
    });
  });

  it("lets NEXUS_PROFILE select another, as the CLI's own precedence does", () => {
    process.env.NEXUS_PROFILE = "staging";
    expect(mod.loadConfig().apiKey).toBe("nxs_staging");
  });

  it("WRITES the profile it read, never the active one", () => {
    process.env.NEXUS_PROFILE = "staging";

    mod.saveConfig({ apiKey: "nxs_staging_new" });

    const after = onDisk();
    expect(after.profiles.staging.apiKey).toBe("nxs_staging_new");
    // The entry nobody named must be untouched — this is the assertion that
    // fails when the writer falls back to `activeProfile`.
    expect(after.profiles.production.apiKey).toBe("nxs_prod");
    expect(after.activeProfile).toBe("production");
  });

  it("clears the key the caller read, which is what logout does", () => {
    process.env.NEXUS_PROFILE = "staging";

    // `logout`'s exact shape: read, delete the key, save.
    const config = mod.loadConfig();
    delete config.apiKey;
    mod.saveConfig(config);

    const after = onDisk();
    expect(after.profiles.staging.apiKey).toBeUndefined();
    expect(after.profiles.production.apiKey).toBe("nxs_prod");
    // The organization on the entry survives a logout: it is a selection, not a
    // credential, and re-logging in should not silently move tenant.
    expect(after.profiles.staging.orgId).toBe("org_staging");
  });

  it("writes the active profile when NEXUS_PROFILE is unset", () => {
    mod.saveConfig({ apiKey: "nxs_prod_new" });

    const after = onDisk();
    expect(after.profiles.production.apiKey).toBe("nxs_prod_new");
    expect(after.profiles.staging.apiKey).toBe("nxs_staging");
  });

  it("reports no credentials for a NEXUS_PROFILE that does not exist", () => {
    process.env.NEXUS_PROFILE = "nope";
    // Silently falling back to the active profile would authenticate as an
    // organization the operator explicitly steered away from.
    expect(mod.loadConfig()).toEqual({});
  });
});

describe("the organization a tool call lands in", () => {
  it("comes from the selected profile", () => {
    process.env.NEXUS_PROFILE = "staging";
    expect(mod.resolveOrganizationId()).toBe("org_staging");
  });

  it("is overridden per shell by NEXUS_ORGANIZATION_ID", () => {
    process.env.NEXUS_ORGANIZATION_ID = "org_env";
    expect(mod.resolveOrganizationId()).toBe("org_env");
  });

  it("is absent when the key's own organization decides", () => {
    fs.writeFileSync(
      configFile,
      JSON.stringify({ activeProfile: "a", profiles: { a: { apiKey: "nxs_scoped" } } })
    );
    // Absent, not empty: an org-scoped key reaches exactly one organization by
    // construction, and an empty header would be refused rather than defaulted.
    expect(mod.resolveOrganizationId()).toBeUndefined();
  });
});
