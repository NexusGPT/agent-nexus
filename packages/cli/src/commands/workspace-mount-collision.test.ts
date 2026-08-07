import os from "node:os";
import path from "node:path";

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedProfile } from "../config";
import { setJsonMode } from "../output";

/**
 * NEX-2360 follow-up: org-scoping the registry KEY does not scope the mount
 * POINT. `defaultMountPath` is `~/nexus/<slug>` for every org, so two orgs
 * mounting the same slug on one machine aim at the same directory while their
 * scoped registry lookups see nothing of each other.
 *
 * Left unguarded that lets the registry hold TWO rows naming one mount point,
 * which is corrupting: every OS-level action keys off `mountPath`, so
 * `unmount` under org A detaches whatever is mounted there — org B's live
 * drive. These cover the guard that keeps one row per mount point:
 *   - a LIVE row on the path refuses the mount, naming its owner and --at;
 *   - a DEAD row on the path is reclaimed (dropped) as the new mount takes it.
 */

// Hermetic error taxonomy: `handleError` narrows over the SDK's error classes.
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

// The workspace list is irrelevant here — a failing list degrades to the plain
// bare-slug mount (resolveMountTarget → null), which is what we want to test.
vi.mock("../client", () => ({
  createClient: vi.fn(() => ({
    workspaces: {
      list: vi.fn(async () => {
        throw new Error("offline");
      })
    }
  }))
}));

// Never shell out: `execFileSync("mount")` returning an empty table makes every
// webdav record read as NOT live, and `rclone version` succeeding makes the
// rclone engine available.
const spawn = vi.fn();
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(() => ""),
  execSync: vi.fn(() => ""),
  spawn: (...args: unknown[]) => spawn(...args)
}));

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
      mkdirSync: vi.fn(() => undefined),
      // The mount point is always empty, so `ensureEmptyMountDir` never blocks —
      // the collision must be caught by the registry guard, not by the OS.
      readdirSync: vi.fn(() => [] as string[]),
      openSync: vi.fn(() => 1)
    }
  };
});

// Control auth resolution (the acting org) per test.
const resolveProfile = vi.fn();
vi.mock("../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config")>();
  return { ...actual, resolveProfile: (...args: unknown[]) => resolveProfile(...args) };
});

import { registerWorkspaceCommands } from "./workspace";

const SLUG = "general-context";
const DEFAULT_PATH = path.join(os.homedir(), "nexus", SLUG);

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

/** A registry row owned by org B (Globex), at the shared default mount point. */
function orgBRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    slug: SLUG,
    mountPath: DEFAULT_PATH,
    baseUrl: "https://api.nexusgpt.io",
    mountedAt: "2026-06-24T00:00:00.000Z",
    orgId: "org_bbb",
    orgName: "Globex",
    profile: "org-b",
    ...over
  };
}

async function runMount(...args: string[]): Promise<{ out: unknown; warnings: string }> {
  const program = new Command();
  program.name("nexus").option("--json", "Output as JSON").exitOverride();
  registerWorkspaceCommands(program);

  setJsonMode(true);
  const chunks: string[] = [];
  const warnings: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    chunks.push(a.map(String).join(" "));
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    warnings.push(String(chunk));
    return true;
  });
  try {
    await program.parseAsync(["node", "nexus", "--json", "workspace", "mount", ...args]);
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    stderrSpy.mockRestore();
    setJsonMode(false);
  }
  return { out: JSON.parse(chunks.join("\n")), warnings: warnings.join("") };
}

describe("nexus workspace mount — cross-org mount-point collision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveProfile.mockReturnValue(ORG_A_PROFILE);
    delete process.env.NEXUS_ORGANIZATION_ID;
    delete process.env.NEXUS_BASE_URL;
    registry = {};
    process.exitCode = undefined;
    // A live rclone mount is one whose recorded pid is alive; this process is.
    spawn.mockReturnValue({ pid: 4242, once: vi.fn(), unref: vi.fn() });
  });
  afterEach(() => {
    setJsonMode(false);
    process.exitCode = undefined;
  });

  it("refuses to mount onto another org's LIVE mount point and points at --at", async () => {
    // Org B already occupies ~/nexus/general-context. Org A's scoped lookup
    // finds nothing (different registry key), so only the mount-point check can
    // stop this — and it must, or two rows end up naming one directory.
    registry = {
      "org:org_bbb|general-context": orgBRow({ engine: "rclone", pid: process.pid })
    };

    const { out } = (await runMount(SLUG)) as { out: { error?: { message?: string } } };

    const message = out.error?.message ?? "";
    expect(message).toContain(DEFAULT_PATH);
    expect(message).toContain('org "Globex"'); // names who is in the way
    expect(message).toContain("--at"); // and how to coexist
    expect(process.exitCode).toBe(1);
    // Nothing mounted, nothing recorded, org B's row untouched.
    expect(spawn).not.toHaveBeenCalled();
    expect(Object.keys(registry)).toEqual(["org:org_bbb|general-context"]);
  });

  it("reclaims a DEAD row on the mount point instead of leaving two rows on it", async () => {
    // Org B's mount is gone (reboot / manual umount) but its row survives. Left
    // in place it would describe org A's new drive, and `unmount` as org B
    // would detach a mount it never made.
    registry = {
      "org:org_bbb|general-context": orgBRow({ engine: "webdav" })
    };

    const { out, warnings } = (await runMount(SLUG, "--engine", "rclone")) as {
      out: Record<string, unknown>;
      warnings: string;
    };

    expect(out).toMatchObject({ mounted: true, slug: SLUG, mountPath: DEFAULT_PATH });
    expect(warnings).toContain("Reclaiming");
    expect(warnings).toContain('org "Globex"');
    // Exactly one row, org A's, naming the mount point.
    expect(Object.keys(registry)).toEqual(["org:org_aaa|general-context"]);
    expect(registry["org:org_aaa|general-context"]).toMatchObject({
      mountPath: DEFAULT_PATH,
      orgId: "org_aaa"
    });
  });

  it("lets a second org mount the same slug at a different path", async () => {
    // The PR's core promise: org-scoped keys let both orgs keep a mount of the
    // slug, as long as the mount POINTS differ.
    registry = {
      "org:org_bbb|general-context": orgBRow({ engine: "rclone", pid: process.pid })
    };
    const other = path.join(os.homedir(), "nexus", "acme-general-context");

    const { out } = (await runMount(SLUG, "--engine", "rclone", "--at", other)) as {
      out: Record<string, unknown>;
    };

    expect(out).toMatchObject({ mounted: true, mountPath: other });
    expect(Object.keys(registry).sort()).toEqual([
      "org:org_aaa|general-context",
      "org:org_bbb|general-context"
    ]);
  });
});
