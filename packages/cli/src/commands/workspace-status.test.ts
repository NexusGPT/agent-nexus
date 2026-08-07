import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * NEX-2372: `workspace status` + the mounts registry must expose the mount MODE
 * (ro/rw) and the ORG/profile pinned at mount time — both were unobservable
 * before (ro discovered only by a failed write; the registry was org-blind).
 * NEX-2360: the registry is org-scoped, so two orgs' mounts of the SAME slug
 * coexist and each row shows which org it serves.
 */

// The mount table / liveness probes shell out; stub them so status is
// deterministic and never touches the real OS mount table.
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(() => ""),
  execSync: vi.fn(() => ""),
  spawn: vi.fn()
}));

// Drive `readMounts()` off an in-memory registry instead of ~/.nexus-mcp.
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
      })
    }
  };
});

import { registerWorkspaceCommands } from "./workspace";

async function runStatus(): Promise<unknown> {
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
    await program.parseAsync(["node", "nexus", "--json", "workspace", "status"]);
  } finally {
    spy.mockRestore();
    errSpy.mockRestore();
    setJsonMode(false);
  }
  return JSON.parse(chunks.join("\n"));
}

describe("nexus workspace status (NEX-2360/NEX-2372 columns)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registry = {};
  });
  afterEach(() => setJsonMode(false));

  it("surfaces mode + org + profile for a read-only mount", async () => {
    registry = {
      "org:org_abc|general-context": {
        slug: "general-context",
        engine: "rclone",
        mountPath: "/home/u/nexus/general-context",
        baseUrl: "https://api.nexusgpt.io",
        readOnly: true,
        profile: "orange",
        orgName: "Acme",
        orgId: "org_abc",
        pid: 999999999, // not alive → live: "no" without touching the OS
        mountedAt: "2026-06-24T00:00:00.000Z"
      }
    };
    const rows = (await runStatus()) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      slug: "general-context",
      mode: "ro",
      orgId: "org_abc",
      orgName: "Acme",
      profile: "orange"
    });
  });

  it("reports rw for a read-write mount", async () => {
    registry = {
      "profile:blue|tools": {
        slug: "tools",
        engine: "rclone",
        mountPath: "/home/u/nexus/tools",
        baseUrl: "https://api.nexusgpt.io",
        readOnly: false,
        profile: "blue",
        pid: 999999999,
        mountedAt: "2026-06-24T00:00:00.000Z"
      }
    };
    const rows = (await runStatus()) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ mode: "rw", profile: "blue", orgId: null });
  });

  it("shows both orgs' mounts when the same slug is mounted for two orgs", async () => {
    const base = {
      slug: "general-context",
      engine: "rclone",
      baseUrl: "https://api.nexusgpt.io",
      readOnly: false,
      pid: 999999999,
      mountedAt: "2026-06-24T00:00:00.000Z"
    };
    registry = {
      "org:org_aaa|general-context": {
        ...base,
        mountPath: "/home/u/nexus/acme/general-context",
        orgId: "org_aaa",
        orgName: "Acme",
        profile: "org-a"
      },
      "org:org_bbb|general-context": {
        ...base,
        mountPath: "/home/u/nexus/globex/general-context",
        orgId: "org_bbb",
        orgName: "Globex",
        profile: "org-b"
      }
    };
    const rows = (await runStatus()) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.orgName).sort()).toEqual(["Acme", "Globex"]);
    expect(new Set(rows.map((r) => r.slug))).toEqual(new Set(["general-context"]));
  });

  it("shows unknowns for legacy records that predate the mode/org/profile fields", async () => {
    registry = {
      legacy: {
        slug: "legacy",
        engine: "rclone",
        mountPath: "/home/u/nexus/legacy",
        baseUrl: "https://api.nexusgpt.io",
        pid: 999999999,
        mountedAt: "2026-06-24T00:00:00.000Z"
      }
    };
    const rows = (await runStatus()) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      mode: null,
      orgId: null,
      orgName: null,
      profile: null
    });
  });
});
