import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `whoami`'s ORG LINE — the value and its label come from one resolution.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS PINS (NEX-4621), AND WHY A "CORRECT TODAY" LINE NEEDED A SPEC
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This command prints the acting organization and, beside it, WHICH selector
 * chose it. Those were two separate reads: the id came from the resolver, and
 * the label came from `whoami` testing the environment variable itself. Both
 * answers were right, because both happened to implement the same precedence.
 *
 * That is the shape of NEX-2525 on the CLI side, where `nexus auth status`
 * printed the profile's organization unconditionally while the client sent the
 * env var's — the one surface whose whole job is answering "which org am I in"
 * was the one that lied. A label derived independently of the thing it labels
 * cannot report a disagreement, because it is not looking at it.
 *
 * ⚠️ THE PRECEDENCE CASES BELOW ARE NOT WHAT PROVES THE REPAIR. They passed
 * before it too. The case that separates the two spellings is the last one:
 * with the resolver's precedence flipped, a label read from the resolution
 * moves WITH the value and stays consistent, while a label read from the
 * environment keeps naming a selector that no longer answered. Measured both
 * ways — see the file's own mutation note in the PR.
 *
 * ⚠️ HOME IS SET BEFORE THE MODULES ARE IMPORTED. `config.ts` resolves
 * `~/.nexus-mcp/config.json` once, at load, so a static import would bind this
 * suite to whatever profiles the machine happens to have.
 */

type WhoamiModule = typeof import("./whoami");

let whoami: WhoamiModule;
let home: string;
let configFile: string;

/** An org-SCOPED key: it reaches exactly one organization by construction. */
const SCOPED_KEY = "nxs_k_scoped_example";
/** A cross-org key: it belongs to no organization, so a selection is required. */
const CROSS_ORG_KEY = "nxs_p_personal_example";

beforeAll(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-mcp-whoami-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  configFile = path.join(home, ".nexus-mcp", "config.json");
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  whoami = await import("./whoami");
});

beforeEach(() => {
  delete process.env.NEXUS_PROFILE;
  delete process.env.NEXUS_API_KEY;
  delete process.env.NEXUS_BASE_URL;
  delete process.env.NEXUS_ENV;
  delete process.env.NEXUS_ORGANIZATION_ID;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.NEXUS_PROFILE;
  delete process.env.NEXUS_API_KEY;
  delete process.env.NEXUS_ORGANIZATION_ID;
});

function writeProfile(entry: Record<string, unknown>): void {
  fs.writeFileSync(
    configFile,
    JSON.stringify({ activeProfile: "a", profiles: { a: entry } }, null, 2)
  );
}

/** Run the command and return the `Org:` line it printed. */
async function orgLine(): Promise<string> {
  const printed: string[] = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    printed.push(String(line));
  });
  await whoami.whoamiCommand();

  const line = printed.find((l) => l.includes("Org:"));
  // A missing line means the command's output shape moved, which every
  // assertion below would otherwise absorb as an empty string.
  expect(line, `no Org: line in ${JSON.stringify(printed)}`).toBeDefined();
  return (line ?? "").trim();
}

describe("whoami's organization line", () => {
  it("prints the profile's organization, and says the profile chose it", async () => {
    writeProfile({ apiKey: SCOPED_KEY, orgId: "org_profile" });

    const line = await orgLine();

    expect(line).toContain("org_profile");
    expect(line).toContain("profile (nexus auth use-org)");
  });

  it("prints the env override, and says the env var chose it", async () => {
    writeProfile({ apiKey: CROSS_ORG_KEY, orgId: "org_profile" });
    process.env.NEXUS_ORGANIZATION_ID = "org_env";

    const line = await orgLine();

    expect(line).toContain("org_env");
    expect(line).not.toContain("org_profile");
    expect(line).toContain("NEXUS_ORGANIZATION_ID env");
  });

  it("names no selector at all when nothing selected an organization", async () => {
    writeProfile({ apiKey: SCOPED_KEY });

    const line = await orgLine();

    // Both halves: the fallback text is present AND no selector is claimed.
    // Printing a source beside "(none)" would name a selector that answered
    // nothing.
    expect(line).toContain("the key's own organization decides");
    expect(line).not.toContain("NEXUS_ORGANIZATION_ID env");
    expect(line).not.toContain("profile (nexus auth use-org)");
  });

  it("says the SERVER will pick when the key is org-unbound and nothing is selected", async () => {
    writeProfile({ apiKey: CROSS_ORG_KEY });

    const line = await orgLine();

    // A cross-org key with no selection is the wrong-tenant case; saying "the
    // key's own organization decides" for it would hide exactly that.
    expect(line).toContain("NONE SELECTED");
  });

  it("the selector it NAMES is the selector that produced the id it PRINTS", async () => {
    // ⚠️ THE REPAIR'S OWN CASE, AND IT IS DELIBERATELY NOT A PRECEDENCE CASE.
    // The expected label is derived FROM THE PRINTED ID, never from a literal,
    // which is the only thing that separates the two spellings: break the
    // resolver's precedence and a label read from the resolution moves with the
    // value and stays consistent, while a label read from the environment keeps
    // naming a selector that did not answer. A case asserting "the env id wins"
    // reds under that mutant in BOTH spellings and therefore discriminates
    // nothing — that pin lives in its own case above.
    const LABELS = {
      org_from_env: "NEXUS_ORGANIZATION_ID env",
      org_from_profile: "profile (nexus auth use-org)"
    } as const;

    writeProfile({ apiKey: CROSS_ORG_KEY, orgId: "org_from_profile" });
    const fromProfile = await orgLine();

    process.env.NEXUS_ORGANIZATION_ID = "org_from_env";
    const fromEnv = await orgLine();

    for (const line of [fromProfile, fromEnv]) {
      const printed = (Object.keys(LABELS) as (keyof typeof LABELS)[]).filter((id) =>
        line.includes(id)
      );
      // Exactly one, or the line names no organization at all and every
      // assertion below would be satisfied by an empty answer.
      expect(printed, `line names ${printed.length} of the two ids: ${line}`).toHaveLength(1);
      expect(line).toContain(LABELS[printed[0]]);
    }
  });
});
