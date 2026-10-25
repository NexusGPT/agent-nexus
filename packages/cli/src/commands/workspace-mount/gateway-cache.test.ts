import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The state directory is resolved from HOME when `../../mount-registry` loads,
 * so the sandbox is set BEFORE any import: every folder below is real, and
 * none of it may reach the developer's own `~/.nexus-mcp`.
 */
const SANDBOX = vi.hoisted(() => {
  // Joined by the host's own `path` (no import exists this early): one separator on Windows too.
  const dir = process
    .getBuiltinModule("node:path")
    .join(process.env.TMPDIR ?? "/tmp", `nexus-gateway-cache-${process.pid}`);
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import type { MountRecord } from "../../mount-registry";
import { mountIdFor } from "../../workspace-direct-mount/mount-id";
import { PENDING_UPLOADS_UNKNOWN } from "../../workspace-direct-mount/pending-uploads-unknown";
import {
  type GatewayCache,
  gatewayCacheDirFor,
  gatewayMountIdOfRow,
  gatewayPendingUploads,
  removeGatewayCache,
  retireDeadGatewayRow
} from "./gateway-cache";

const KEY = "org:org_aaa|tools";
const MOUNT_ID = mountIdFor(KEY);
const OWN: GatewayCache = { mountId: MOUNT_ID, shared: false };
const CACHE_DIR = gatewayCacheDirFor(OWN);

function rcloneRow(over: Partial<MountRecord> = {}): MountRecord {
  return {
    slug: "tools",
    engine: "rclone",
    mountPath: "/home/u/nexus/acme/tools",
    baseUrl: "https://api.nexusgpt.io",
    mountId: MOUNT_ID,
    shared: false,
    orgName: "Acme",
    profile: "org-a",
    mountedAt: "2026-09-29T12:00:00.000Z",
    ...over
  };
}

/** One cache item, as rclone writes it: its data under `vfs`, its metadata under `vfsMeta`. */
function leaveItem(name: string, dirty: boolean, cacheDir = CACHE_DIR): void {
  // rclone's own folder name, less its leading colon: NTFS refuses one in a file name.
  const folder = ["webdav{abcde}", "tools"];
  fs.mkdirSync(path.join(cacheDir, "vfs", ...folder), { recursive: true });
  fs.mkdirSync(path.join(cacheDir, "vfsMeta", ...folder), { recursive: true });
  fs.writeFileSync(path.join(cacheDir, "vfs", ...folder, name), "bytes");
  fs.writeFileSync(
    path.join(cacheDir, "vfsMeta", ...folder, name),
    JSON.stringify({ Dirty: dirty })
  );
}

/** What the warnings said on stderr during `run`. */
function warned(run: () => unknown): string {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  try {
    run();
  } finally {
    spy.mockRestore();
  }
  return lines.join("");
}

beforeEach(() => {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
});
afterEach(() => vi.restoreAllMocks());

describe("gatewayCacheDirFor", () => {
  it("names one folder per mount id AND copy under the state tree: the two copies never share one", () => {
    expect(CACHE_DIR).toBe(path.join(SANDBOX, ".nexus-mcp", "gateway-cache", MOUNT_ID));
    expect(gatewayCacheDirFor({ mountId: MOUNT_ID, shared: true })).toBe(`${CACHE_DIR}-shared`);
  });
});

describe("gatewayMountIdOfRow — the id a remount runs on", () => {
  it("keeps the row's own id, takes the key's for a row with no mount id, and refuses a corrupt one naming unmount", () => {
    const other = mountIdFor("org:org_aaa|elsewhere");
    expect(gatewayMountIdOfRow(rcloneRow({ mountId: other }), KEY)).toBe(other);

    let id = "";
    const said = warned(() => (id = gatewayMountIdOfRow(rcloneRow({ mountId: undefined }), KEY)));
    expect(id).toBe(MOUNT_ID);
    expect(said).toContain("rclone's default cache folder");
    expect(said).toContain("this mount does not upload them");

    expect(() => gatewayMountIdOfRow(rcloneRow({ mountId: "../../escape" }), KEY)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('its mount id "../../escape" is not 16 hex digits'),
        hint: "Run: nexus workspace unmount tools, then mount it again."
      })
    );
  });
});

describe("gatewayPendingUploads — status's count", () => {
  it("counts only dirty items in the row's own copy, and null where no folder of ours exists", () => {
    leaveItem("draft.md", true);
    leaveItem("done.md", false);
    // Two in the other copy's folder, one here: a count of the wrong folder shows.
    leaveItem("other-copy.md", true, `${CACHE_DIR}-shared`);
    leaveItem("other-copy-2.md", true, `${CACHE_DIR}-shared`);
    expect(gatewayPendingUploads(rcloneRow())).toBe(1);
    expect(gatewayPendingUploads(rcloneRow({ shared: true }))).toBe(2);
    expect(gatewayPendingUploads(rcloneRow({ engine: "webdav" }))).toBeNull();
    expect(gatewayPendingUploads(rcloneRow({ engine: "direct" }))).toBeNull();
    expect(gatewayPendingUploads(rcloneRow({ mountId: undefined }))).toBeNull();
  });

  it("reads a corrupt id as UNKNOWN, never 0: it could not look", () => {
    expect(gatewayPendingUploads(rcloneRow({ mountId: "../../escape" }))).toBe(
      PENDING_UPLOADS_UNKNOWN
    );
    // A hand-edited row can carry a NUMBER of 16 digits: not an id, and never a path.
    const numeric = { ...rcloneRow(), mountId: 1234567890123456 } as unknown as MountRecord;
    expect(gatewayPendingUploads(numeric)).toBe(PENDING_UPLOADS_UNKNOWN);
  });
});

describe("removeGatewayCache — unmount's cleanup", () => {
  it("deletes an empty folder, keeps one holding anything — a dirty save, or a clean item", () => {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    expect(removeGatewayCache(rcloneRow())).toBe(0);
    expect(fs.existsSync(CACHE_DIR)).toBe(false);

    leaveItem("draft.md", true);
    expect(removeGatewayCache(rcloneRow())).toBe(1);
    expect(fs.existsSync(CACHE_DIR)).toBe(true);

    fs.rmSync(CACHE_DIR, { recursive: true, force: true });
    leaveItem("done.md", false);
    expect(removeGatewayCache(rcloneRow())).toBe(0);
    expect(fs.existsSync(CACHE_DIR)).toBe(true);
  });

  it("never deletes on a corrupt id, and counts it unknown", () => {
    // The empty folder the corrupt id would resolve to: two levels above the cache tree.
    const aimed = path.join(path.dirname(CACHE_DIR), "../../escape");
    fs.mkdirSync(aimed, { recursive: true });
    expect(removeGatewayCache(rcloneRow({ mountId: "../../escape" }))).toBe(
      PENDING_UPLOADS_UNKNOWN
    );
    expect(fs.existsSync(aimed)).toBe(true);
  });
});

describe("retireDeadGatewayRow — a dead row replaced by a new mount", () => {
  it("lets the SAME folder through untouched: that mount drains it", () => {
    leaveItem("draft.md", true);
    expect(() => retireDeadGatewayRow(rcloneRow(), OWN)).not.toThrow();
    expect(fs.existsSync(CACHE_DIR)).toBe(true);
  });

  it("refuses any other replacement while a save waits — another id, the other copy, another engine", () => {
    leaveItem("draft.md", true);
    const others: Array<GatewayCache | null> = [
      { mountId: mountIdFor("org:org_bbb|tools"), shared: false },
      { mountId: MOUNT_ID, shared: true },
      null
    ];
    for (const replacement of others) {
      expect(() => retireDeadGatewayRow(rcloneRow(), replacement)).toThrow(
        /1 file\(s\) saved to "tools" by org "Acme" \(profile "org-a"\)'s previous rclone mount have not uploaded yet/
      );
    }
    expect(fs.existsSync(CACHE_DIR)).toBe(true);
  });

  it("deletes the empty folder of a replaced row, warns for a row with no mount id, refuses a corrupt one", () => {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    retireDeadGatewayRow(rcloneRow(), null);
    expect(fs.existsSync(CACHE_DIR)).toBe(false);

    leaveItem("draft.md", true);
    expect(() => retireDeadGatewayRow(rcloneRow({ engine: "direct" }), null)).not.toThrow();
    expect(warned(() => retireDeadGatewayRow(rcloneRow({ mountId: undefined }), null))).toContain(
      "this mount does not upload them"
    );
    expect(() => retireDeadGatewayRow(rcloneRow({ mountId: "zz" }), null)).toThrow(
      'its mount id "zz" is not 16 hex digits'
    );
  });
});
