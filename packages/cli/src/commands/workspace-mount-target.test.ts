import { describe, expect, it, vi } from "vitest";

import type { createClient } from "../client";
import { resolveMountTarget } from "./workspace";

/**
 * NEX-2362: the mount must learn whether a slug is org-owned, admin-shared, or
 * BOTH so it can warn on ambiguity and pick the right copy. These cover the
 * resolution logic without spawning a real mount.
 */
function clientWith(
  workspaces: { id: string; slug: string; isShared: boolean }[]
): ReturnType<typeof createClient> {
  return {
    workspaces: { list: vi.fn(async () => ({ workspaces })) }
  } as unknown as ReturnType<typeof createClient>;
}

describe("resolveMountTarget", () => {
  it("flags an org-owned + shared collision and picks the org-owned copy by default", async () => {
    const client = clientWith([
      { id: "org-id", slug: "tools", isShared: false },
      { id: "shared-id", slug: "tools", isShared: true }
    ]);

    const target = await resolveMountTarget(client, "tools", false);

    expect(target).toEqual({ shared: true, orgOwned: true, workspaceId: "org-id" });
  });

  it("picks the shared copy when --shared is requested on a collision", async () => {
    const client = clientWith([
      { id: "org-id", slug: "tools", isShared: false },
      { id: "shared-id", slug: "tools", isShared: true }
    ]);

    const target = await resolveMountTarget(client, "tools", true);

    expect(target).toEqual({ shared: true, orgOwned: true, workspaceId: "shared-id" });
  });

  it("reports no shared copy when only an org-owned workspace exists", async () => {
    const client = clientWith([{ id: "org-id", slug: "tools", isShared: false }]);

    const target = await resolveMountTarget(client, "tools", true);

    expect(target).toEqual({ shared: false, orgOwned: true, workspaceId: undefined });
  });

  it("resolves a shared-only slug to the shared copy with no ambiguity", async () => {
    const client = clientWith([{ id: "shared-id", slug: "community", isShared: true }]);

    const target = await resolveMountTarget(client, "community", false);

    expect(target).toEqual({ shared: true, orgOwned: false, workspaceId: "shared-id" });
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
});
