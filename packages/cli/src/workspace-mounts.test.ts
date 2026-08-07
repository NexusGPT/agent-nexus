import { describe, expect, it } from "vitest";

import {
  claimMountPoint,
  describeOwner,
  describeScope,
  findMount,
  findMountsByPath,
  findMountsBySlug,
  isLegacyKey,
  mountKey,
  type MountRecord,
  type MountScope,
  mountScopeId,
  scopeCandidateKeys
} from "./workspace-mounts";

function rec(over: Partial<MountRecord> & { slug: string }): MountRecord {
  return {
    engine: "webdav",
    mountPath: `/Users/me/nexus/${over.slug}`,
    baseUrl: "https://api.nexusgpt.io",
    mountedAt: "2026-06-21T00:00:00.000Z",
    ...over
  };
}

const orgA: MountScope = {
  profile: "org-a",
  orgId: "org_aaa",
  orgName: "Acme",
  baseUrl: "https://api.nexusgpt.io"
};
const orgB: MountScope = {
  profile: "org-b",
  orgId: "org_bbb",
  orgName: "Globex",
  baseUrl: "https://api.nexusgpt.io"
};

describe("mountScopeId", () => {
  it("prefers orgId", () => {
    expect(mountScopeId(orgA)).toBe("org:org_aaa");
  });
  it("falls back to profile when orgId is absent", () => {
    expect(mountScopeId({ profile: "org-a", baseUrl: "https://x" })).toBe("profile:org-a");
  });
  it("falls back to baseUrl when orgId and profile are absent (override mode)", () => {
    expect(mountScopeId({ baseUrl: "https://api.nexusgpt.io" })).toBe(
      "url:https://api.nexusgpt.io"
    );
  });
});

describe("mountKey", () => {
  it("namespaces the slug by scope so two orgs get distinct keys", () => {
    expect(mountKey(orgA, "general-context")).toBe("org:org_aaa|general-context");
    expect(mountKey(orgB, "general-context")).toBe("org:org_bbb|general-context");
    expect(mountKey(orgA, "general-context")).not.toBe(mountKey(orgB, "general-context"));
  });

  it("keeps org ids and profile names in disjoint key spaces", () => {
    // Profile names are `^[a-z0-9][a-z0-9_-]{0,31}$` (config.ts), which an org id
    // satisfies — so a profile CAN be named exactly like some org's id. Untagged
    // `${id}|${slug}` keys would put both in one flat space and let the profile
    // address that org's rows.
    const impostor: MountScope = { profile: "org_aaa", baseUrl: "https://api.nexusgpt.io" };
    expect(mountKey(impostor, "general-context")).not.toBe(mountKey(orgA, "general-context"));
    expect(mountKey(impostor, "general-context")).toBe("profile:org_aaa|general-context");
  });
});

describe("isLegacyKey", () => {
  it("treats a bare slug as legacy and a composite key as not", () => {
    expect(isLegacyKey("general-context")).toBe(true);
    expect(isLegacyKey("org:org_aaa|general-context")).toBe(false);
  });
});

describe("scopeCandidateKeys", () => {
  it("lists orgId, profile, then the baseUrl fallback when identifiers exist", () => {
    // The baseUrl key is included last so an api-key-created mount (keyed by
    // baseUrl) is still findable; it is ranked below the 1:1 orgId/profile keys.
    // Each candidate carries its own kind tag, so the profile candidate can
    // never collide with an org candidate.
    expect(scopeCandidateKeys(orgA, "general-context")).toEqual([
      "org:org_aaa|general-context",
      "profile:org-a|general-context",
      "url:https://api.nexusgpt.io|general-context"
    ]);
  });
  it("uses only the baseUrl key when neither orgId nor profile is set", () => {
    expect(scopeCandidateKeys({ baseUrl: "https://api.nexusgpt.io" }, "general-context")).toEqual([
      "url:https://api.nexusgpt.io|general-context"
    ]);
  });
  it("never generates an org-kind key for a profile named like an org id", () => {
    const impostor: MountScope = { profile: "org_aaa", baseUrl: "https://api.nexusgpt.io" };
    expect(scopeCandidateKeys(impostor, "general-context")).not.toContain(
      mountKey(orgA, "general-context")
    );
  });
});

describe("findMount — NEX-2360 org scoping", () => {
  it("lets the same slug coexist for two orgs and resolves each scope to its own", () => {
    const mounts = {
      [mountKey(orgA, "general-context")]: rec({
        slug: "general-context",
        orgId: "org_aaa",
        mountPath: "/a"
      }),
      [mountKey(orgB, "general-context")]: rec({
        slug: "general-context",
        orgId: "org_bbb",
        mountPath: "/b"
      })
    };
    expect(findMount(mounts, "general-context", orgA)?.record.mountPath).toBe("/a");
    expect(findMount(mounts, "general-context", orgB)?.record.mountPath).toBe("/b");
  });

  it("finds a profile-keyed mount after a later login fills in orgId (key drift)", () => {
    // Mounted while the profile had no orgId → keyed by profile name. A re-login
    // now supplies orgId, so the canonical key would be orgId-based and miss.
    const mounts = {
      "profile:org-a|general-context": rec({ slug: "general-context", profile: "org-a" })
    };
    const found = findMount(mounts, "general-context", orgA);
    expect(found?.key).toBe("profile:org-a|general-context");
  });

  it("does not retarget an existing mount after `auth use-org` switches the org", () => {
    // Mounted while the profile acted as org A → keyed/pinned to org_aaa. After
    // `nexus auth use-org` moves the SAME profile to org B, the scope's keys are
    // [org:org_bbb|slug, profile:org-a|slug, url:baseUrl|slug] — none of which is
    // org A's row — so the old mount is NOT claimed by the new org (it stays
    // pinned to org A).
    const afterSwitch: MountScope = { ...orgA, orgId: "org_bbb", orgName: "Globex" };
    const mounts = {
      [mountKey(orgA, "general-context")]: rec({
        slug: "general-context",
        orgId: "org_aaa",
        orgName: "Acme",
        profile: "org-a"
      })
    };
    expect(findMount(mounts, "general-context", afterSwitch)).toBeUndefined();
  });

  it("falls back to a legacy bare-slug entry when no scoped key exists", () => {
    const mounts = { "general-context": rec({ slug: "general-context" }) };
    const found = findMount(mounts, "general-context", orgA);
    expect(found?.key).toBe("general-context");
  });

  it("prefers the scoped entry over a legacy entry of the same slug", () => {
    const mounts = {
      "general-context": rec({ slug: "general-context", mountPath: "/legacy" }),
      [mountKey(orgA, "general-context")]: rec({ slug: "general-context", mountPath: "/scoped" })
    };
    expect(findMount(mounts, "general-context", orgA)?.record.mountPath).toBe("/scoped");
  });

  it("never detaches another org's mount when the active scope has no entry", () => {
    // unmount on org A while only org B has this slug mounted: must report no
    // mount, not fall through to org B's record (the org-blindness NEX-2360 fixes).
    const mounts = {
      [mountKey(orgB, "general-context")]: rec({ slug: "general-context", orgId: "org_bbb" })
    };
    expect(findMount(mounts, "general-context", orgA)).toBeUndefined();
  });

  it("matches a unique slug when scope is unknown", () => {
    const mounts = { [mountKey(orgA, "general-context")]: rec({ slug: "general-context" }) };
    expect(findMount(mounts, "general-context", undefined)?.record.slug).toBe("general-context");
  });

  it("refuses to guess between two orgs' mounts when scope is unknown", () => {
    const mounts = {
      [mountKey(orgA, "general-context")]: rec({ slug: "general-context", orgId: "org_aaa" }),
      [mountKey(orgB, "general-context")]: rec({ slug: "general-context", orgId: "org_bbb" })
    };
    expect(findMount(mounts, "general-context", undefined)).toBeUndefined();
  });

  it("returns undefined for an unmounted slug", () => {
    expect(findMount({}, "general-context", orgA)).toBeUndefined();
  });

  it("finds an api-key mount (baseUrl-keyed, no org/profile) under a profile scope", () => {
    // Created via --api-key/NEXUS_API_KEY with no resolvable org → keyed by
    // baseUrl, record carries no orgId/profile. A later profile-scoped unmount
    // must still locate it so the live mount + registry row don't leak.
    const mounts = {
      "url:https://api.nexusgpt.io|general-context": rec({ slug: "general-context" })
    };
    const found = findMount(mounts, "general-context", orgA);
    expect(found?.key).toBe("url:https://api.nexusgpt.io|general-context");
  });

  it("does not claim a baseUrl-keyed mount owned by a different org", () => {
    // A baseUrl-keyed record that nonetheless names org B must not be returned to
    // an org-A scope — the base URL is shared across orgs on the host.
    const mounts = {
      "url:https://api.nexusgpt.io|general-context": rec({
        slug: "general-context",
        orgId: "org_bbb"
      })
    };
    expect(findMount(mounts, "general-context", orgA)).toBeUndefined();
  });
});

describe("findMount — a profile must never impersonate an org", () => {
  // The registry namespaces mounts by "the acting org, else the profile, else the
  // base URL". Profile names and org ids are drawn from overlapping alphabets
  // (`^[a-z0-9][a-z0-9_-]{0,31}$` covers `org_aaa`), so in a FLAT `${id}|${slug}`
  // key space a profile named after an org id produces that org's exact key —
  // and `findMount` would hand its live row to `unmount` (detach + delete), to
  // the mount guard (block), or to `mount` (overwrite the row). That is one org
  // acting on another org's mount: precisely what NEX-2360 scoping exists to stop.
  const impostor: MountScope = { profile: "org_aaa", baseUrl: "https://api.nexusgpt.io" };

  it("does not resolve org A's mount for a profile literally named `org_aaa`", () => {
    const mounts = {
      [mountKey(orgA, "general-context")]: rec({
        slug: "general-context",
        orgId: "org_aaa",
        orgName: "Acme",
        profile: "acme-admin",
        mountPath: "/a"
      })
    };
    expect(findMount(mounts, "general-context", impostor)).toBeUndefined();
  });

  it("holds even when org A's row names no profile (env-override mount)", () => {
    // NEXUS_ORGANIZATION_ID mounts record an orgId and no profile, so an
    // owner-check on the profile field alone cannot see the mismatch — only the
    // disjoint key space stops it.
    const mounts = {
      [mountKey(orgA, "general-context")]: rec({ slug: "general-context", orgId: "org_aaa" })
    };
    expect(findMount(mounts, "general-context", impostor)).toBeUndefined();
  });

  it("does not let org A resolve the same-named profile's mount either", () => {
    // The mirror image: org_aaa acting must not reach profile `org_aaa`'s row.
    const mounts = {
      [mountKey(impostor, "general-context")]: rec({
        slug: "general-context",
        profile: "org_aaa",
        mountPath: "/impostor"
      })
    };
    expect(findMount(mounts, "general-context", orgA)).toBeUndefined();
  });

  it("checks the recorded owner on every candidate key, not just the baseUrl one", () => {
    // Key drift can park a record under the profile candidate; if that record
    // pins a DIFFERENT org than the one acting now, it is not ours to touch.
    const mounts = {
      [mountKey({ profile: "org-a", baseUrl: "https://api.nexusgpt.io" }, "general-context")]: rec({
        slug: "general-context",
        orgId: "org_bbb",
        orgName: "Globex",
        profile: "org-a"
      })
    };
    expect(findMount(mounts, "general-context", orgA)).toBeUndefined();
  });

  it("still shares one org's mount between two profiles on that org", () => {
    // The owner check must not over-fire: the registry is scoped by ORG, so a
    // second profile signed into org A resolves org A's mount.
    const mounts = {
      [mountKey(orgA, "general-context")]: rec({
        slug: "general-context",
        orgId: "org_aaa",
        orgName: "Acme",
        profile: "org-a",
        mountPath: "/a"
      })
    };
    const secondProfile: MountScope = { ...orgA, profile: "acme-admin" };
    expect(findMount(mounts, "general-context", secondProfile)?.record.mountPath).toBe("/a");
  });

  it("does not hand a legacy bare-slug row to a scope it names a different org than", () => {
    // Legacy rows normally name no owner and stay claimable by anyone. One that
    // was hand-edited to name org B is not org A's to unmount.
    const mounts = {
      "general-context": rec({ slug: "general-context", orgId: "org_bbb", orgName: "Globex" })
    };
    expect(findMount(mounts, "general-context", orgA)).toBeUndefined();
  });
});

describe("findMountsBySlug", () => {
  it("lists every org's mount of the slug (for disambiguation errors)", () => {
    const mounts = {
      [mountKey(orgA, "general-context")]: rec({ slug: "general-context", orgId: "org_aaa" }),
      [mountKey(orgB, "general-context")]: rec({ slug: "general-context", orgId: "org_bbb" }),
      [mountKey(orgA, "other")]: rec({ slug: "other", orgId: "org_aaa" })
    };
    const found = findMountsBySlug(mounts, "general-context");
    expect(found.map((f) => f.record.orgId).sort()).toEqual(["org_aaa", "org_bbb"]);
  });

  it("includes legacy bare-slug entries", () => {
    const mounts = { "general-context": rec({ slug: "general-context" }) };
    expect(findMountsBySlug(mounts, "general-context")).toHaveLength(1);
  });

  it("returns an empty list for an unmounted slug", () => {
    expect(findMountsBySlug({}, "general-context")).toEqual([]);
  });
});

describe("findMountsByPath — the collision the org-scoped KEY cannot see", () => {
  // `rec()` defaults to /Users/me/nexus/<slug>, i.e. exactly what
  // `defaultMountPath` produces: the same directory for every org, because the
  // default mount point has no org segment.
  const DEFAULT_PATH = "/Users/me/nexus/general-context";

  it("finds another org's row on the path that a scoped findMount misses", () => {
    const mounts = {
      [mountKey(orgA, "general-context")]: rec({ slug: "general-context", orgId: "org_aaa" })
    };
    // Org B has no row of its own, so the org-scoped guard sees nothing …
    expect(findMount(mounts, "general-context", orgB)).toBeUndefined();
    // … while the mount POINT is already taken by org A's mount.
    expect(findMountsByPath(mounts, DEFAULT_PATH).map((h) => h.key)).toEqual([
      "org:org_aaa|general-context"
    ]);
  });

  it("excludes the caller's own row", () => {
    const key = mountKey(orgA, "general-context");
    const mounts = { [key]: rec({ slug: "general-context" }) };
    expect(findMountsByPath(mounts, DEFAULT_PATH, key)).toEqual([]);
  });

  it("matches a different slug parked on the same path (--at collisions)", () => {
    const mounts = {
      [mountKey(orgA, "other")]: rec({ slug: "other", mountPath: DEFAULT_PATH })
    };
    expect(findMountsByPath(mounts, DEFAULT_PATH)).toHaveLength(1);
  });

  it("normalises trailing slashes and redundant segments", () => {
    const mounts = {
      [mountKey(orgA, "general-context")]: rec({ slug: "general-context" })
    };
    expect(findMountsByPath(mounts, `${DEFAULT_PATH}/`)).toHaveLength(1);
    expect(findMountsByPath(mounts, "/Users/me/nexus/./general-context")).toHaveLength(1);
  });

  it("ignores rows with no usable mountPath instead of throwing", () => {
    const mounts = {
      broken: { slug: "general-context" } as unknown as MountRecord,
      [mountKey(orgA, "general-context")]: rec({ slug: "general-context" })
    };
    expect(findMountsByPath(mounts, DEFAULT_PATH).map((h) => h.key)).toEqual([
      "org:org_aaa|general-context"
    ]);
  });

  it("returns nothing for a free path", () => {
    expect(findMountsByPath({}, DEFAULT_PATH)).toEqual([]);
  });
});

describe("claimMountPoint — one registry row per mount point", () => {
  const DEFAULT_PATH = "/Users/me/nexus/general-context";
  const live = () => true;
  const dead = () => false;

  it("blocks a second org from mounting onto the first org's LIVE mount point", () => {
    // Both orgs default to ~/nexus/general-context. Without this, org B stacks
    // a mount on org A's directory and the registry ends up with two rows on
    // one path — then `unmount` under either org detaches the other's drive.
    const mounts = {
      [mountKey(orgA, "general-context")]: rec({
        slug: "general-context",
        orgId: "org_aaa",
        orgName: "Acme"
      })
    };
    const claim = claimMountPoint(mounts, DEFAULT_PATH, { isLive: live });
    const blocked = claim.blockedBy;
    expect(blocked?.key).toBe("org:org_aaa|general-context");
    // The error the CLI builds names the owner, so the user knows whose mount
    // is in the way rather than getting a bare "directory is not empty".
    expect(blocked && describeOwner(blocked.record)).toBe('org "Acme"');
    expect(claim.stale).toEqual([]);
  });

  it("reports another org's DEAD row on the path as reclaimable", () => {
    // The corrupting case Bugbot flagged: org A's mount died (reboot, manual
    // umount) but its row survives. Org B mounts at the same default path; if
    // A's row is kept it now describes B's drive, and `unmount` as org A
    // detaches org B's live mount.
    const mounts = {
      [mountKey(orgA, "general-context")]: rec({ slug: "general-context", orgId: "org_aaa" })
    };
    const claim = claimMountPoint(mounts, DEFAULT_PATH, { isLive: dead });
    expect(claim.blockedBy).toBeUndefined();
    expect(claim.stale.map((s) => s.key)).toEqual(["org:org_aaa|general-context"]);
  });

  it("blocks — and reclaims nothing — when a live row sits alongside a dead one", () => {
    const mounts = {
      [mountKey(orgA, "general-context")]: rec({ slug: "general-context", orgId: "org_aaa" }),
      [mountKey(orgB, "general-context")]: rec({ slug: "general-context", orgId: "org_bbb" })
    };
    const claim = claimMountPoint(mounts, DEFAULT_PATH, {
      isLive: (r) => r.orgId === "org_bbb"
    });
    expect(claim.blockedBy?.record.orgId).toBe("org_bbb");
    // Nothing is offered for deletion on a blocked path.
    expect(claim.stale).toEqual([]);
  });

  it("ignores the caller's own row, live or not (remount in place)", () => {
    const key = mountKey(orgA, "general-context");
    const mounts = { [key]: rec({ slug: "general-context" }) };
    expect(claimMountPoint(mounts, DEFAULT_PATH, { exceptKey: key, isLive: live })).toEqual({
      stale: []
    });
  });

  it("leaves other orgs' mounts at OTHER paths alone (two orgs, --at, coexisting)", () => {
    // The PR's core promise: two orgs mounting the same slug at distinct paths
    // must both succeed.
    const mounts = {
      [mountKey(orgA, "general-context")]: rec({
        slug: "general-context",
        orgId: "org_aaa",
        mountPath: "/Users/me/nexus/acme-general-context"
      })
    };
    expect(claimMountPoint(mounts, DEFAULT_PATH, { isLive: live })).toEqual({ stale: [] });
  });
});

describe("describeOwner", () => {
  it("names org and profile when both are present", () => {
    expect(describeOwner(rec({ slug: "s", orgName: "Acme", profile: "org-a" }))).toBe(
      'org "Acme" (profile "org-a")'
    );
  });
  it("names orgId and profile when the name is unknown (env-override org)", () => {
    expect(describeOwner(rec({ slug: "s", orgId: "org_aaa", profile: "org-a" }))).toBe(
      'org org_aaa (profile "org-a")'
    );
  });
  it("falls back through orgName, orgId, profile, then baseUrl", () => {
    expect(describeOwner(rec({ slug: "s", orgName: "Acme" }))).toBe('org "Acme"');
    expect(describeOwner(rec({ slug: "s", orgId: "org_aaa" }))).toBe("org org_aaa");
    expect(describeOwner(rec({ slug: "s", profile: "org-a" }))).toBe('profile "org-a"');
    expect(describeOwner(rec({ slug: "s", baseUrl: "https://x" }))).toBe("base URL https://x");
  });
});

describe("describeScope", () => {
  it("falls back through orgName, orgId, profile, then baseUrl", () => {
    expect(describeScope(orgA)).toBe('org "Acme"');
    expect(describeScope({ orgId: "org_aaa", baseUrl: "https://x" })).toBe("org org_aaa");
    expect(describeScope({ profile: "org-a", baseUrl: "https://x" })).toBe('profile "org-a"');
    expect(describeScope({ baseUrl: "https://x" })).toBe("base URL https://x");
  });
});
