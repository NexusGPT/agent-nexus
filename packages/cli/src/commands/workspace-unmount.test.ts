import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedProfile } from "../config";
import { setJsonMode } from "../output";
import { mountKey } from "../workspace-mounts";

/**
 * NEX-2360: `unmount` disambiguates by the org recorded at mount time.
 *   - A scoped unmount detaches only the acting org's mount of the slug —
 *     never another org's mount of the same slug.
 *   - When the acting org has no mount but other orgs do, the error lists the
 *     candidates instead of a misleading "No mount recorded".
 *   - When the scope is unknowable and several orgs have the slug mounted, the
 *     error lists the candidates and asks the user to pick.
 */

// Hermetic error taxonomy: `handleError` narrows over the SDK's error classes,
// which is all this suite needs from @agent-nexus/sdk.
vi.mock("@agent-nexus/sdk", () => {
  class NexusError extends Error {}
  class NexusApiError extends NexusError {}
  class NexusAuthenticationError extends NexusApiError {}
  class NexusConnectionError extends NexusError {}
  class NexusTimeoutError extends NexusConnectionError {
    timeoutMs = 0;
  }
  class NexusClient {}
  return {
    NexusClient,
    NexusError,
    NexusApiError,
    NexusAuthenticationError,
    NexusConnectionError,
    NexusTimeoutError
  };
});

// Never touch the real OS mount table / umount.
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(() => ""),
  execSync: vi.fn(() => ""),
  spawn: vi.fn()
}));

// Control auth resolution (the unmount scope) per test.
const resolveProfile = vi.fn();
vi.mock("../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config")>();
  return { ...actual, resolveProfile: (...args: unknown[]) => resolveProfile(...args) };
});

// Drive the registry off memory instead of ~/.nexus-mcp — reads AND writes.
let registry: Record<string, unknown> = {};
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: vi.fn((p: string, ...rest: unknown[]) => {
        if (String(p).endsWith("workspace-mounts.json")) return JSON.stringify(registry);
        return (actual.readFileSync as unknown as (...a: unknown[]) => unknown)(p, ...rest);
      }),
      writeFileSync: vi.fn((p: string, data: unknown, ...rest: unknown[]) => {
        if (String(p).endsWith("workspace-mounts.json")) {
          registry = JSON.parse(String(data)) as Record<string, unknown>;
          return;
        }
        (actual.writeFileSync as unknown as (...a: unknown[]) => unknown)(p, data, ...rest);
      }),
      mkdirSync: vi.fn(() => undefined)
    }
  };
});

import { registerWorkspaceCommands } from "./workspace";

const ORG_A_PROFILE: ResolvedProfile = {
  name: "org-a",
  source: "active",
  profile: {
    apiKey: "nxs_a",
    baseUrl: "https://api.nexusgpt.io",
    orgId: "org_aaa",
    orgName: "Acme"
  }
};

function mountRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    engine: "webdav",
    baseUrl: "https://api.nexusgpt.io",
    mountedAt: "2026-06-24T00:00:00.000Z",
    ...over
  };
}

async function runUnmount(slug: string): Promise<unknown> {
  const program = new Command();
  program.name("nexus").option("--json", "Output as JSON").exitOverride();
  registerWorkspaceCommands(program);

  setJsonMode(true);
  const chunks: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    chunks.push(args.map((a) => String(a)).join(" "));
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    await program.parseAsync(["node", "nexus", "--json", "workspace", "unmount", slug]);
  } finally {
    spy.mockRestore();
    errSpy.mockRestore();
    setJsonMode(false);
  }
  return JSON.parse(chunks.join("\n"));
}

describe("nexus workspace unmount (NEX-2360 org scoping)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXUS_ORGANIZATION_ID;
    delete process.env.NEXUS_BASE_URL;
    registry = {};
    process.exitCode = undefined;
  });
  afterEach(() => {
    setJsonMode(false);
    process.exitCode = undefined;
  });

  it("detaches only the acting org's mount when two orgs mounted the same slug", async () => {
    resolveProfile.mockReturnValue(ORG_A_PROFILE);
    registry = {
      "org:org_aaa|general-context": mountRow({
        slug: "general-context",
        mountPath: "/a/general-context",
        orgId: "org_aaa",
        orgName: "Acme",
        profile: "org-a"
      }),
      "org:org_bbb|general-context": mountRow({
        slug: "general-context",
        mountPath: "/b/general-context",
        orgId: "org_bbb",
        orgName: "Globex",
        profile: "org-b"
      })
    };
    const out = (await runUnmount("general-context")) as Record<string, unknown>;
    expect(out).toMatchObject({ unmounted: true, slug: "general-context" });
    // Org B's mount of the same slug must survive untouched.
    expect(Object.keys(registry)).toEqual(["org:org_bbb|general-context"]);
  });

  it("lists the owning orgs when the acting org has no mount of the slug", async () => {
    resolveProfile.mockReturnValue(ORG_A_PROFILE);
    registry = {
      "org:org_bbb|general-context": mountRow({
        slug: "general-context",
        mountPath: "/b/general-context",
        orgId: "org_bbb",
        orgName: "Globex",
        profile: "org-b"
      })
    };
    const out = (await runUnmount("general-context")) as {
      error?: { message?: string };
    };
    const message = out.error?.message ?? "";
    expect(message).toContain('org "Acme"'); // names the acting org that has no mount
    expect(message).toContain('org "Globex"'); // lists the actual owner
    expect(message).toContain("/b/general-context");
    expect(process.exitCode).toBe(1);
    // Nothing was detached or forgotten.
    expect(Object.keys(registry)).toEqual(["org:org_bbb|general-context"]);
  });

  it("lists all candidates instead of guessing when the scope is unknown and ambiguous", async () => {
    // No resolvable auth at all → unknown scope.
    resolveProfile.mockImplementation(() => {
      throw new Error("No profiles configured.");
    });
    registry = {
      "org:org_aaa|general-context": mountRow({
        slug: "general-context",
        mountPath: "/a/general-context",
        orgId: "org_aaa",
        orgName: "Acme",
        profile: "org-a"
      }),
      "org:org_bbb|general-context": mountRow({
        slug: "general-context",
        mountPath: "/b/general-context",
        orgId: "org_bbb",
        orgName: "Globex",
        profile: "org-b"
      })
    };
    const out = (await runUnmount("general-context")) as {
      error?: { message?: string };
    };
    const message = out.error?.message ?? "";
    expect(message).toContain("more than one org");
    expect(message).toContain('org "Acme"');
    expect(message).toContain('org "Globex"');
    expect(process.exitCode).toBe(1);
    expect(Object.keys(registry).sort()).toEqual([
      "org:org_aaa|general-context",
      "org:org_bbb|general-context"
    ]);
  });

  it("unmounts a unique slug match when the scope is unknown", async () => {
    resolveProfile.mockImplementation(() => {
      throw new Error("No profiles configured.");
    });
    registry = {
      "org:org_aaa|general-context": mountRow({
        slug: "general-context",
        mountPath: "/a/general-context",
        orgId: "org_aaa",
        profile: "org-a"
      })
    };
    const out = (await runUnmount("general-context")) as Record<string, unknown>;
    expect(out).toMatchObject({ unmounted: true, slug: "general-context" });
    expect(registry).toEqual({});
  });

  it("removes a legacy bare-slug record (migrate-on-first-touch)", async () => {
    resolveProfile.mockReturnValue(ORG_A_PROFILE);
    registry = {
      "general-context": mountRow({
        slug: "general-context",
        mountPath: "/legacy/general-context"
      })
    };
    const out = (await runUnmount("general-context")) as Record<string, unknown>;
    expect(out).toMatchObject({ unmounted: true });
    expect(registry).toEqual({});
  });

  it("refuses to detach an org's mount for a profile named after that org's id", async () => {
    // Profile names allow `org_aaa` (config.ts: ^[a-z0-9][a-z0-9_-]{0,31}$), and
    // a profile with no selected org is keyed by its NAME. In a flat key space
    // that name IS org A's registry key, so this unmount would detach org A's
    // live drive and delete its row. The kind tag keeps the two spaces disjoint:
    // this profile addresses `profile:org_aaa|…`, never `org:org_aaa|…`.
    resolveProfile.mockReturnValue({
      name: "org_aaa",
      source: "active",
      profile: { apiKey: "nxs_impostor", baseUrl: "https://api.nexusgpt.io" }
    } as ResolvedProfile);
    // Keyed through `mountKey` rather than a literal, so this stays a real test
    // of the KEY SPACE: it fails the moment org ids and profile names share one.
    const orgAKey = mountKey(
      {
        profile: "org-a",
        orgId: "org_aaa",
        orgName: "Acme",
        baseUrl: "https://api.nexusgpt.io"
      },
      "general-context"
    );
    registry = {
      [orgAKey]: mountRow({
        slug: "general-context",
        mountPath: "/a/general-context",
        orgId: "org_aaa",
        orgName: "Acme",
        profile: "org-a"
      })
    };
    const out = (await runUnmount("general-context")) as { error?: { message?: string } };
    expect(out.error?.message).toContain('org "Acme"');
    expect(process.exitCode).toBe(1);
    // Org A's mount is still recorded — nothing was detached on its behalf.
    expect(Object.keys(registry)).toEqual([orgAKey]);
  });

  it("still reports a plain no-mount error when the slug is not mounted anywhere", async () => {
    resolveProfile.mockReturnValue(ORG_A_PROFILE);
    const out = (await runUnmount("ghost")) as { error?: { message?: string } };
    expect(out.error?.message).toContain('No mount recorded for "ghost"');
    expect(process.exitCode).toBe(1);
  });
});
