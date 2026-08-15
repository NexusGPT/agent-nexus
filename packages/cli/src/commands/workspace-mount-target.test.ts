import type { WorkspaceKind } from "@agent-nexus/sdk";
import { describe, expect, it, vi } from "vitest";

import type { createClient } from "../client";
import { resolveMountTarget } from "./workspace";

/**
 * NEX-2362: the mount must learn whether a slug is org-owned, admin-shared, or
 * BOTH so it can warn on ambiguity and pick the right copy.
 *
 * NEX-3872 added the second thing it must learn: the chosen copy's storage
 * KIND. A CODE workspace is a read-only projection of a git project and the
 * server refuses every write to it, so a mount that cannot see `kind` mounts
 * read-write and hands the user a bare "Permission denied" on first save. The
 * field was on the wire the whole time — it was dropped by this function's own
 * annotation and by the SDK's `Workspace` interface, so no compiler could say
 * so.
 *
 * These cover the resolution logic without spawning a real mount.
 *
 * 🚨 THE FIXTURES CARRY `kind` DELIBERATELY, AND `toEqual` IS WHY. It ignores
 * `undefined` properties, so a fixture that omitted `kind` would produce
 * `kind: undefined` and every assertion below would pass while proving nothing
 * about the field this file exists to check. The kind assertions are written
 * against real values for that reason.
 */
function clientWith(
  workspaces: { id: string; slug: string; isShared: boolean; kind: WorkspaceKind }[]
): ReturnType<typeof createClient> {
  return {
    workspaces: { list: vi.fn(async () => ({ workspaces })) }
  } as unknown as ReturnType<typeof createClient>;
}

describe("resolveMountTarget", () => {
  it("flags an org-owned + shared collision and picks the org-owned copy by default", async () => {
    const client = clientWith([
      { id: "org-id", slug: "tools", isShared: false, kind: "DRIVE" },
      { id: "shared-id", slug: "tools", isShared: true, kind: "DRIVE" }
    ]);

    const target = await resolveMountTarget(client, "tools", false);

    expect(target).toEqual({
      shared: true,
      orgOwned: true,
      workspaceId: "org-id",
      kind: "DRIVE"
    });
  });

  it("picks the shared copy when --shared is requested on a collision", async () => {
    const client = clientWith([
      { id: "org-id", slug: "tools", isShared: false, kind: "DRIVE" },
      { id: "shared-id", slug: "tools", isShared: true, kind: "DRIVE" }
    ]);

    const target = await resolveMountTarget(client, "tools", true);

    expect(target).toEqual({
      shared: true,
      orgOwned: true,
      workspaceId: "shared-id",
      kind: "DRIVE"
    });
  });

  it("reports no shared copy when only an org-owned workspace exists", async () => {
    const client = clientWith([{ id: "org-id", slug: "tools", isShared: false, kind: "DRIVE" }]);

    const target = await resolveMountTarget(client, "tools", true);

    expect(target).toEqual({
      shared: false,
      orgOwned: true,
      workspaceId: undefined,
      kind: undefined
    });
  });

  it("resolves a shared-only slug to the shared copy with no ambiguity", async () => {
    const client = clientWith([
      { id: "shared-id", slug: "community", isShared: true, kind: "DRIVE" }
    ]);

    const target = await resolveMountTarget(client, "community", false);

    expect(target).toEqual({
      shared: true,
      orgOwned: false,
      workspaceId: "shared-id",
      kind: "DRIVE"
    });
  });

  it("degrades to null (legacy bare-slug mount) when the list call fails", async () => {
    const client = {
      workspaces: {
        list: vi.fn(async () => {
          throw new Error("network down");
        })
      }
    } as unknown as ReturnType<typeof createClient>;

    expect(await resolveMountTarget(client, "tools", false)).toBeNull();
  });

  // ── the storage kind (NEX-3872) ───────────────────────────────────────────

  it("reports the CODE kind of the copy it chose, so the mount can go read-only", async () => {
    const client = clientWith([{ id: "code-id", slug: "app-src", isShared: false, kind: "CODE" }]);

    const target = await resolveMountTarget(client, "app-src", false);

    expect(target).toEqual({
      shared: false,
      orgOwned: true,
      workspaceId: "code-id",
      kind: "CODE"
    });
  });

  it("reports the CHOSEN copy's kind, not the other copy's, on a slug collision", async () => {
    // The discriminating case: same slug, different kinds. Reading the kind off
    // `matches[0]`, or off whichever copy happened to be listed first, passes
    // every other test in this file and is wrong exactly here — the mount would
    // be made read-only from the copy it is NOT mounting.
    const client = clientWith([
      { id: "org-code", slug: "tools", isShared: false, kind: "CODE" },
      { id: "shared-drive", slug: "tools", isShared: true, kind: "DRIVE" }
    ]);

    expect(await resolveMountTarget(client, "tools", false)).toMatchObject({
      workspaceId: "org-code",
      kind: "CODE"
    });
    expect(await resolveMountTarget(client, "tools", true)).toMatchObject({
      workspaceId: "shared-drive",
      kind: "DRIVE"
    });
  });

  it("leaves kind undefined when no copy matches the slug — absent is not writable", async () => {
    // The degraded arm's shape. `kind: undefined` must not be read as DRIVE by
    // the caller; it means nobody asked the server, and the mount falls back to
    // read-write with the warning lost rather than the refusal lost.
    const client = clientWith([{ id: "other", slug: "elsewhere", isShared: false, kind: "CODE" }]);

    expect(await resolveMountTarget(client, "tools", false)).toEqual({
      shared: false,
      orgOwned: false,
      workspaceId: undefined,
      kind: undefined
    });
  });
});
