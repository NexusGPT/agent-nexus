import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedProfile } from "../config";
import { setJsonMode } from "../output";

/**
 * NEX-3872: a CODE workspace mounted READ-WRITE, then refused on every write.
 *
 * `WorkspaceKind` is `DRIVE | CODE`, and CODE is a read-only projection of a
 * git project — the WebDAV gateway answers 403 to every PUT, DELETE, MKCOL and
 * MOVE against one (`KIND_IS_READ_ONLY`, `workspace.entity.ts`). The mount path
 * never read that field: `resolveMountTarget` annotated the list rows
 * `{ id, slug, isShared }`, and the SDK's own `Workspace` interface omitted
 * `kind` too, so the field was on the wire and invisible to every compiler
 * between it and the user.
 *
 * What that cost: the mount succeeded, `workspace status` printed `Mode rw`,
 * and the first save came back as a bare "Permission denied" naming no
 * workspace and no reason. Under rclone it is worse than a refusal —
 * `--vfs-cache-mode writes` buffers the write locally and fails on flush, so
 * the editor reports a SUCCESSFUL save and the bytes are dropped.
 *
 * ## What each test here would have caught, and what none of them can
 *
 * These drive the real `mount` action and the real `status` action over an
 * in-memory registry, so they cover mount mode → registry row → `Mode` column
 * as ONE chain. They do NOT reach the gateway: that the server actually
 * refuses a CODE write is pinned backend-side in
 * `webdav-gateway.service.spec.ts` and `webdav-gateway.role-narrowing.spec.ts`,
 * and this file deliberately does not restate it — a second copy of that claim
 * would be a second thing to drift.
 */

// Hermetic error taxonomy: `handleError` narrows over the SDK's error classes.
// `WorkspaceKind` is a TYPE, so it is erased and needs no factory here.
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

/** The workspace list the mount resolves its target from — set per test. */
let listed: { id: string; slug: string; isShared: boolean; kind: string }[] = [];
let listFails = false;
vi.mock("../client", () => ({
  createClient: vi.fn(() => ({
    workspaces: {
      list: vi.fn(async () => {
        if (listFails) throw new Error("offline");
        return { workspaces: listed };
      })
    }
  }))
}));

// Never shell out. An empty `mount` table makes every webdav record read as NOT
// live; `rclone version` succeeding makes the rclone engine available.
const spawn = vi.fn();
const execFileSync = vi.fn(() => "");
vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => execFileSync(...(args as [])),
  execSync: vi.fn(() => ""),
  spawn: (...args: unknown[]) => spawn(...args)
}));

// Drive the registry off memory instead of ~/.nexus-mcp — reads AND writes, so
// `status` below reads exactly what `mount` wrote.
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
      readdirSync: vi.fn(() => [] as string[]),
      openSync: vi.fn(() => 1)
    }
  };
});

const resolveProfile = vi.fn();
vi.mock("../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config")>();
  return { ...actual, resolveProfile: (...args: unknown[]) => resolveProfile(...args) };
});

import { registerWorkspaceCommands } from "./workspace";

const PROFILE: ResolvedProfile = {
  name: "org-a",
  source: "active",
  profile: {
    apiKey: "nxs_a",
    baseUrl: "https://api.nexusgpt.io",
    orgId: "org_aaa",
    orgName: "Acme"
  }
};

async function run(...argv: string[]): Promise<{ out: unknown; lines: string }> {
  const program = new Command();
  program.name("nexus").option("--json", "Output as JSON").exitOverride();
  registerWorkspaceCommands(program);

  setJsonMode(true);
  const chunks: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    chunks.push(a.map(String).join(" "));
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    await program.parseAsync(["node", "nexus", "--json", "workspace", ...argv]);
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    stderrSpy.mockRestore();
    setJsonMode(false);
  }
  const text = chunks.join("\n");
  return { out: JSON.parse(text), lines: text };
}

/** The argv rclone was actually spawned with — the only proof of the mount mode. */
function rcloneArgs(): string[] {
  expect(spawn).toHaveBeenCalledTimes(1);
  return spawn.mock.calls[0][1] as string[];
}

describe("nexus workspace mount — a CODE workspace is mounted read-only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveProfile.mockReturnValue(PROFILE);
    delete process.env.NEXUS_ORGANIZATION_ID;
    delete process.env.NEXUS_BASE_URL;
    registry = {};
    listed = [];
    listFails = false;
    process.exitCode = undefined;
    spawn.mockReturnValue({ pid: 4242, once: vi.fn(), unref: vi.fn() });
    execFileSync.mockReturnValue("");
  });
  afterEach(() => {
    setJsonMode(false);
    process.exitCode = undefined;
  });

  it("passes --read-only to rclone for a CODE workspace, with no flag from the user", async () => {
    listed = [{ id: "code-id", slug: "app-src", isShared: false, kind: "CODE" }];

    const { out } = await run("mount", "app-src", "--engine", "rclone");

    // The argv is the mount. Everything else this test asserts is bookkeeping
    // ABOUT the mount; this is the mount itself.
    expect(rcloneArgs()).toContain("--read-only");
    expect(out).toMatchObject({
      mounted: true,
      readOnly: true,
      readOnlyReason: "kind",
      storageKind: "CODE"
    });
  });

  it("does NOT pass --read-only for a DRIVE workspace — the control", async () => {
    // Without this arm every assertion above is satisfied by a mount that is
    // read-only unconditionally, which would be a different bug of the same size.
    listed = [{ id: "drive-id", slug: "docs", isShared: false, kind: "DRIVE" }];

    const { out } = await run("mount", "docs", "--engine", "rclone");

    expect(rcloneArgs()).not.toContain("--read-only");
    expect(out).toMatchObject({
      mounted: true,
      readOnly: false,
      readOnlyReason: null,
      storageKind: "DRIVE"
    });
  });

  it("records the EFFECTIVE mode, so `workspace status` prints Mode ro", async () => {
    // The whole chain in one test: `status` reads the registry and nothing else,
    // so recording the user's FLAG rather than the effective mode is exactly
    // what made it print `Mode rw` over a drive that refuses every write.
    listed = [{ id: "code-id", slug: "app-src", isShared: false, kind: "CODE" }];
    await run("mount", "app-src", "--engine", "rclone");

    const { out } = await run("status");
    const rows = out as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slug: "app-src", mode: "ro" });
  });

  it("still prints Mode rw for a DRIVE workspace — the status control", async () => {
    listed = [{ id: "drive-id", slug: "docs", isShared: false, kind: "DRIVE" }];
    await run("mount", "docs", "--engine", "rclone");

    const rows = (await run("status")).out as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ slug: "docs", mode: "rw" });
  });

  it("keeps --read-only working on a DRIVE workspace, reported as requested", async () => {
    listed = [{ id: "drive-id", slug: "docs", isShared: false, kind: "DRIVE" }];

    const { out } = await run("mount", "docs", "--engine", "rclone", "--read-only");

    expect(rcloneArgs()).toContain("--read-only");
    expect(out).toMatchObject({ readOnly: true, readOnlyReason: "requested" });
  });

  it("reports the kind as the reason when BOTH apply, because kind cannot be waived", async () => {
    // `--read-only` on a CODE workspace is redundant, not wrong. The reason
    // reported is the one the user cannot turn off, so a script reading it
    // learns the mode is not theirs to change.
    listed = [{ id: "code-id", slug: "app-src", isShared: false, kind: "CODE" }];

    const { out } = await run("mount", "app-src", "--engine", "rclone", "--read-only");

    expect(out).toMatchObject({ readOnly: true, readOnlyReason: "kind" });
  });

  it("mounts the CHOSEN copy's kind on a slug collision, not the other copy's", async () => {
    // Same slug, different kinds: the bare slug takes the org-owned CODE copy,
    // `--shared` takes the admin-shared DRIVE one. Reading the kind off the
    // wrong copy passes every single-copy test above.
    listed = [
      { id: "org-code", slug: "tools", isShared: false, kind: "CODE" },
      { id: "shared-drive", slug: "tools", isShared: true, kind: "DRIVE" }
    ];

    const bare = await run("mount", "tools", "--engine", "rclone");
    expect(rcloneArgs()).toContain("--read-only");
    expect(bare.out).toMatchObject({ readOnly: true, storageKind: "CODE" });

    vi.clearAllMocks();
    spawn.mockReturnValue({ pid: 4242, once: vi.fn(), unref: vi.fn() });
    execFileSync.mockReturnValue("");
    registry = {};

    const shared = await run("mount", "tools", "--engine", "rclone", "--shared", "--at", "/tmp/x");
    expect(rcloneArgs()).not.toContain("--read-only");
    expect(shared.out).toMatchObject({ readOnly: false, storageKind: "DRIVE" });
  });

  it("falls back to read-write when the list cannot be fetched, and says the kind is unknown", async () => {
    // ⚠️ UNKNOWN IS NOT WRITABLE. The server still refuses the writes; all that
    // is lost is the warning. Asserting the degraded shape here is what stops
    // someone "simplifying" the absent case into a read-only default, which
    // would make every DRIVE mount read-only the moment the API blips.
    listFails = true;

    const { out } = await run("mount", "app-src", "--engine", "rclone");

    expect(rcloneArgs()).not.toContain("--read-only");
    expect(out).toMatchObject({ readOnly: false, readOnlyReason: null, storageKind: null });
  });
});
