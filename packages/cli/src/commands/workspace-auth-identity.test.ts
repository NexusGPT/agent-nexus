import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedProfile } from "../config";

/**
 * NEX-2360/NEX-2372: a mount pins the ACTING ORG at mount time, resolved
 * exactly the way `createClient` resolves the organization-id for API calls —
 * `NEXUS_ORGANIZATION_ID` env override first, then the profile's selected org
 * (NEX-2474). Post NEX-3175 a mismatched override 403s server-side instead of
 * silently answering from another org, so this resolution is deterministic:
 * what the registry records is what the server will serve. When no org is
 * resolvable at all (raw --api-key, no env), the mount is recorded org-less in
 * the base-URL fallback bucket with a loud warning.
 */

const resolveProfile = vi.fn();
vi.mock("../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config")>();
  return { ...actual, resolveProfile: (...args: unknown[]) => resolveProfile(...args) };
});

import { resolveAuth } from "./workspace";

const PROFILE: ResolvedProfile = {
  name: "orange",
  source: "flag",
  profile: {
    apiKey: "nxs_test",
    baseUrl: "https://api.nexusgpt.io",
    orgId: "org_profile",
    orgName: "Profile Org"
  }
};

describe("resolveAuth acting-org identity (NEX-2360/NEX-2372)", () => {
  let warnings: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXUS_ORGANIZATION_ID;
    delete process.env.NEXUS_BASE_URL;
    warnings = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      warnings.push(String(chunk));
      return true;
    });
  });
  afterEach(() => {
    delete process.env.NEXUS_ORGANIZATION_ID;
    vi.restoreAllMocks();
  });

  it("records the profile name + the profile's org when no env override is set", () => {
    resolveProfile.mockReturnValue(PROFILE);
    const { scope } = resolveAuth({});
    expect(scope).toMatchObject({
      profile: "orange",
      orgId: "org_profile",
      orgName: "Profile Org",
      baseUrl: "https://api.nexusgpt.io"
    });
    expect(warnings).toHaveLength(0);
  });

  it("keeps the org name when the env override names the profile's own org", () => {
    process.env.NEXUS_ORGANIZATION_ID = "org_profile";
    resolveProfile.mockReturnValue(PROFILE);
    const { scope } = resolveAuth({});
    expect(scope).toMatchObject({ orgId: "org_profile", orgName: "Profile Org" });
    expect(warnings).toHaveLength(0);
  });

  it("pins the env-override org as the acting org (createClient precedence)", () => {
    // Same precedence as createClient: env override wins over the profile org.
    // Post NEX-3175 a mismatched override 403s at the server rather than being
    // silently ignored, so recording it is recording what the server serves.
    // The override org's NAME is unknown client-side, so none is recorded.
    process.env.NEXUS_ORGANIZATION_ID = "org_env";
    resolveProfile.mockReturnValue(PROFILE);
    const { scope } = resolveAuth({});
    expect(scope.orgId).toBe("org_env");
    expect(scope.orgName).toBeUndefined();
    expect(scope.profile).toBe("orange");
  });

  it("records the env org for an --api-key override (no profile identity)", () => {
    process.env.NEXUS_ORGANIZATION_ID = "org_env";
    resolveProfile.mockReturnValue({
      name: "override",
      source: "override",
      profile: { apiKey: "nxs_override", baseUrl: "https://api.nexusgpt.io" }
    } satisfies ResolvedProfile);
    const { scope } = resolveAuth({ apiKey: "nxs_override" });
    expect(scope.orgId).toBe("org_env");
    expect(scope.profile).toBeUndefined();
    expect(warnings).toHaveLength(0);
  });

  it("records an unknown org (base-URL bucket) and warns loudly for a raw --api-key", () => {
    resolveProfile.mockReturnValue({
      name: "override",
      source: "override",
      profile: { apiKey: "nxs_override", baseUrl: "https://api.nexusgpt.io" }
    } satisfies ResolvedProfile);
    const { scope } = resolveAuth({ apiKey: "nxs_override" });
    expect(scope.orgId).toBeUndefined();
    expect(scope.profile).toBeUndefined();
    expect(scope.baseUrl).toBe("https://api.nexusgpt.io");
    const text = warnings.join("");
    expect(text).toContain("Cannot determine the organization");
    expect(text).toContain("base URL");
  });
});
