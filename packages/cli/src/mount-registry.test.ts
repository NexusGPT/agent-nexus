import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusTimeoutError
} from "@agent-nexus/sdk";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

/**
 * The state directory is resolved from HOME when `./mount-registry` loads,
 * so the sandbox is set BEFORE any import — `vi.hoisted` runs ahead of them
 * wherever it sits in the file. The health cases below write real session and
 * cache files under it; nothing here may reach the developer's own
 * `~/.nexus-mcp`.
 */
const SANDBOX = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/nexus-workspace-mounts-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import {
  claimMountPoint,
  defaultMountPath,
  describeOwner,
  describeScope,
  ENGINE_LIVENESS,
  findMount,
  findMountsByPath,
  findMountsBySlug,
  isLegacyKey,
  mountKey,
  mountPathOrgSegment,
  type MountRecord,
  type MountScope,
  mountScopeId,
  scopeCandidateKeys,
  unmountMissMessage
} from "./mount-registry";
import { awsConfigFor } from "./workspace-direct-mount/aws-config";
import { cacheHoldsEntries } from "./workspace-direct-mount/cache-holds-entries";
import { writeCacheOwner } from "./workspace-direct-mount/cache-owner";
import { cacheProvenanceRefusal } from "./workspace-direct-mount/cache-provenance-refusal";
import { checkRefreshPath } from "./workspace-direct-mount/check-refresh-path";
import { countPendingUploads } from "./workspace-direct-mount/count-pending-uploads";
import { describeRefresh } from "./workspace-direct-mount/describe-refresh";
import { DIRECT_REMOTE, directMountArgv } from "./workspace-direct-mount/direct-mount-argv";
import { directMountHealth } from "./workspace-direct-mount/direct-mount-health";
import { formatAgo } from "./workspace-direct-mount/format-ago";
import { formatExpiry } from "./workspace-direct-mount/format-expiry";
import { isMountSession } from "./workspace-direct-mount/is-mount-session";
import { accessIsLower } from "./workspace-direct-mount/mount-access";
import { mountIdFor } from "./workspace-direct-mount/mount-id";
import type { MountSession } from "./workspace-direct-mount/mount-session";
import { notificationArgv } from "./workspace-direct-mount/notification-argv";
import { parseAwsConfig } from "./workspace-direct-mount/parse-aws-config";
import {
  describePendingUploads,
  PENDING_UPLOADS_UNKNOWN
} from "./workspace-direct-mount/pending-uploads-unknown";
import {
  EXPIRATION_LEAD_MS,
  processCredentialsDocument
} from "./workspace-direct-mount/process-credentials-document";
import { rcloneBuildVerdict } from "./workspace-direct-mount/rclone-build-verdict";
import { rcloneEnvFor } from "./workspace-direct-mount/rclone-env";
import { rcloneInstallHint } from "./workspace-direct-mount/rclone-install-hint";
import { preflightProblemMessage } from "./workspace-direct-mount/rclone-preflight-problem";
import { redactBucketNames } from "./workspace-direct-mount/redact-bucket-names";
import {
  REFRESH_COOLDOWN_MS,
  refreshCooldownFailure
} from "./workspace-direct-mount/refresh-cooldown";
import { REFRESH_EXIT_CAUSE } from "./workspace-direct-mount/refresh-exit-cause";
import { refreshFailureReasonFor } from "./workspace-direct-mount/refresh-failure-reason";
import { REFRESH_FAILURE_TABLE } from "./workspace-direct-mount/refresh-failure-table";
import { refreshJson } from "./workspace-direct-mount/refresh-json";
import {
  REFRESH_ATTEMPTS,
  REFRESH_BUDGET_MS,
  REFRESH_RETRY_DELAY_MS,
  refreshMayRetry
} from "./workspace-direct-mount/refresh-retry-budget";
import { refreshVerdictIsUnhealthy } from "./workspace-direct-mount/refresh-verdict-is-unhealthy";
import {
  MOUNT_CACHE_DIR,
  MOUNT_CREDENTIALS_DIR,
  sessionPathsFor
} from "./workspace-direct-mount/session-paths";
import {
  announced,
  NOTIFICATION_DEBOUNCE_MS,
  shouldNotify
} from "./workspace-direct-mount/should-notify";
import { stableNodePath } from "./workspace-direct-mount/stable-node-path";
import { toVolumeName, VOLUME_NAME_MAX_CHARS } from "./workspace-direct-mount/volume-name";
import { writeSession } from "./workspace-direct-mount/write-session";

afterAll(() => {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
});

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

  it("does not let a `|` in the base URL forge a second separator", () => {
    // The key shape is `<kind>:<id>|<slug>` and org ids / profile names cannot
    // contain `|`. `scope.baseUrl` can: it is --base-url / NEXUS_BASE_URL /
    // profile config with only a trailing slash stripped, and nothing validates
    // it as a URL. "`|` is illegal in a URL" is a fact about well-formed URLs,
    // not about a string a user typed — so the separator is ENCODED, making the
    // one-separator invariant enforced rather than asserted.
    const odd: MountScope = { baseUrl: "https://host|general-context" };
    const key = mountKey(odd, "other");
    expect(key).toBe("url:https://host%7Cgeneral-context|other");
    // Exactly one separator survives, so the key still splits where this module
    // put the split — and a forged tail cannot impersonate another row's key.
    expect(key.split("|")).toHaveLength(2);
    expect(key).not.toBe(mountKey({ baseUrl: "https://host" }, "general-context"));
  });

  it("leaves ordinary ids untouched by the separator encoding", () => {
    // The encoding is identity for every id the CLI actually produces; it exists
    // only for the one unvalidated source. Pinning that keeps a future tweak from
    // silently rewriting live registry keys.
    expect(mountKey(orgA, "general-context")).toBe("org:org_aaa|general-context");
    expect(mountKey({ baseUrl: "https://api.nexusgpt.io" }, "tools")).toBe(
      "url:https://api.nexusgpt.io|tools"
    );
  });

  it("gives every anonymous caller on a host ONE bucket per slug", () => {
    // The kind tags make org/profile/url spaces disjoint, but WITHIN `url:` there
    // is a single bucket per (base URL, slug). Two different orgs reaching the
    // CLI with raw --api-key and no NEXUS_ORGANIZATION_ID are indistinguishable
    // client-side and land on the same key. This is the one cross-org
    // interaction the tag argument does NOT cover, so it is pinned explicitly
    // rather than left to be rediscovered.
    const anonA: MountScope = { baseUrl: "https://api.nexusgpt.io" };
    const anonB: MountScope = { baseUrl: "https://api.nexusgpt.io" };
    expect(mountKey(anonA, "general-context")).toBe(mountKey(anonB, "general-context"));
    // A different host does separate them — the bucket is per base URL.
    expect(mountKey({ baseUrl: "https://eu.nexusgpt.io" }, "general-context")).not.toBe(
      mountKey(anonA, "general-context")
    );
  });
});

describe("isLegacyKey", () => {
  it("treats a bare slug as legacy and a composite key as not", () => {
    expect(isLegacyKey("general-context")).toBe(true);
    expect(isLegacyKey("org:org_aaa|general-context")).toBe(false);
  });
});

describe("scopeCandidateKeys", () => {
  it("lists orgId then profile, and never the shared baseUrl bucket, for an identified scope", () => {
    // Each candidate carries its own kind tag, so the profile candidate can
    // never collide with an org candidate.
    //
    // The `url:` bucket is absent on purpose. `mountScopeId` reaches it only
    // when neither orgId nor profile exists, so an identified caller can never
    // have written one — offering it back would let this scope match a row
    // belonging to some anonymous caller on the same host.
    expect(scopeCandidateKeys(orgA, "general-context")).toEqual([
      "org:org_aaa|general-context",
      "profile:org-a|general-context"
    ]);
  });
  it("uses only the baseUrl key when neither orgId nor profile is set", () => {
    expect(scopeCandidateKeys({ baseUrl: "https://api.nexusgpt.io" }, "general-context")).toEqual([
      "url:https://api.nexusgpt.io|general-context"
    ]);
  });
  it("offers the baseUrl bucket to a profile-only scope no more than to an org-only one", () => {
    // Either identifier is enough to have produced a key of this scope's own.
    expect(
      scopeCandidateKeys({ profile: "org-a", baseUrl: "https://api.nexusgpt.io" }, "gc")
    ).toEqual(["profile:org-a|gc"]);
    expect(
      scopeCandidateKeys({ orgId: "org_aaa", baseUrl: "https://api.nexusgpt.io" }, "gc")
    ).toEqual(["org:org_aaa|gc"]);
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

  it("matches a unique UNOWNED slug when scope is unknown", () => {
    // The row names no org/profile — the anonymous base-URL bucket or a legacy
    // pre-NEX-2360 entry. There is no identity for an unknown scope to
    // contradict, and refusing would strand a live mount with no way to detach.
    const mounts = { [mountKey(orgA, "general-context")]: rec({ slug: "general-context" }) };
    expect(findMount(mounts, "general-context", undefined)?.record.slug).toBe("general-context");
  });

  it("refuses a unique but OWNED slug match when scope is unknown", () => {
    // Uniqueness is not ownership. `unmount` reaches an unknown scope by
    // ordinary accident — a typo'd `--profile`, a raw --api-key with no
    // NEXUS_ORGANIZATION_ID, no profile configured at all — and would then
    // OS-detach and delete this row. Org A recorded it; an unidentified caller
    // cannot show it is theirs, so the lookup must not hand it over.
    const mounts = {
      [mountKey(orgA, "general-context")]: rec({
        slug: "general-context",
        orgId: "org_aaa",
        orgName: "Acme",
        profile: "org-a"
      })
    };
    expect(findMount(mounts, "general-context", undefined)).toBeUndefined();
    // Still resolvable by the org that owns it — the refusal is about identity,
    // not about making the row unreachable.
    expect(findMount(mounts, "general-context", orgA)?.record.orgId).toBe("org_aaa");
  });

  it("refuses a unique slug match owned by a PROFILE alone when scope is unknown", () => {
    // A mount made before login filled in orgId records only the profile name.
    // That is still a named owner, so the same refusal applies.
    const mounts = {
      "profile:org-a|general-context": rec({ slug: "general-context", profile: "org-a" })
    };
    expect(findMount(mounts, "general-context", undefined)).toBeUndefined();
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

  it("does NOT hand an identified scope the shared anonymous bucket", () => {
    // The row was created via --api-key/NEXUS_API_KEY with no resolvable org, so
    // it is keyed by baseUrl and names nobody. That bucket is shared by every
    // anonymous caller on the host, which makes "is this mine?" unanswerable —
    // and `unmount` acts on whatever findMount returns, OS-detaching the drive
    // and deleting the row. Returning it to org A would therefore let org A
    // detach an anonymous caller's live mount. `findMountsBySlug` is the
    // disambiguation path; guessing is not.
    const mounts = {
      "url:https://api.nexusgpt.io|general-context": rec({ slug: "general-context" })
    };
    expect(findMount(mounts, "general-context", orgA)).toBeUndefined();
    // Still reachable from the scope that actually wrote it.
    expect(findMount(mounts, "general-context", { baseUrl: "https://api.nexusgpt.io" })?.key).toBe(
      "url:https://api.nexusgpt.io|general-context"
    );
  });

  it("leaves an identified scope free to mount the slug the anonymous bucket holds", () => {
    // The other half of the same fix: the mount guard blocks on whatever
    // findMount returns, so an anonymous row used to refuse org A a mount of
    // its OWN workspace — the cross-org independence NEX-2360 exists to give.
    // The mount POINT is still protected, by claimMountPoint, across all scopes.
    const mounts = {
      "url:https://api.nexusgpt.io|general-context": rec({ slug: "general-context" })
    };
    expect(findMount(mounts, "general-context", orgA)).toBeUndefined();
    expect(findMountsBySlug(mounts, "general-context")).toHaveLength(1);
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
  // `rec()` defaults to /Users/me/nexus/<slug>: the org-less path a row written
  // before the default carried an org segment sits at, and any path `--at`
  // names. Two orgs can still aim at one directory.
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

describe("unmountMissMessage — the remedy has to be one the caller can perform", () => {
  const owned = { record: rec({ slug: "general-context", orgId: "org_bbb", mountPath: "/b" }) };
  const anonymous = { record: rec({ slug: "general-context", mountPath: "/anon" }) };

  it("tells an identified caller to switch profile/org when there IS an owner to switch to", () => {
    const msg = unmountMissMessage("general-context", [owned], orgA);
    expect(msg).toContain("nexus auth switch");
    expect(msg).toContain("/b");
  });

  it("never says 'switch' when every candidate is unowned — there is nothing to switch to", () => {
    // The caller mounted with a raw --api-key and has since logged in. Their own
    // row sits in the anonymous base-URL bucket, which an identified scope no
    // longer resolves, so `findMount` misses and this message is the whole
    // remedy. "Switch to the owning profile/org" names an org and a profile that
    // do not exist, and leaves a live mount with no way to reach it.
    const msg = unmountMissMessage("general-context", [anonymous], orgA);
    expect(msg).not.toContain("nexus auth switch");
    expect(msg).not.toContain("owning profile/org");
    expect(msg).toContain("no profile or org to switch to");
    // Both routes that DO reach the row.
    expect(msg).toContain("--api-key");
    expect(msg).toContain("fusermount -u");
    expect(msg).toContain("/anon");
  });

  it("still offers the switch when only SOME candidates are unowned", () => {
    // One owned row is enough for the switch to be actionable, and the anonymous
    // row is listed alongside it either way.
    const msg = unmountMissMessage("general-context", [anonymous, owned], orgA);
    expect(msg).toContain("nexus auth switch");
    expect(msg).toContain("/anon");
    expect(msg).toContain("/b");
  });

  it("asks an unresolved scope to pick, and never guesses at a single candidate", () => {
    const msg = unmountMissMessage("general-context", [owned], undefined);
    expect(msg).toContain("could not be resolved");
    expect(msg).toContain("--profile <name>");
    expect(msg).not.toContain("nexus auth switch");
  });
});

// ── The direct engine's pure half (`workspace-direct-mount.ts`) ───────────────

const NOW = new Date("2026-09-07T12:00:00.000Z");
const MOUNT_ID = "0123456789abcdef";
const BUCKET = "nxw-d-0123456789ab";
const CTX = { slug: "support-docs", profile: "work" };

function at(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

function session(over: Partial<MountSession> = {}): MountSession {
  return {
    version: 1,
    mountId: MOUNT_ID,
    profile: "work",
    baseUrl: "https://api.nexusgpt.io",
    orgId: "org_aaa",
    workspace: { id: "ws-1", slug: "support-docs", shared: false },
    access: "read-write",
    volumeName: "Support Docs (Acme)",
    credentials: {
      accessKeyId: "ASIA_TEST_KEY_ID",
      secretAccessKey: "not-a-secret",
      sessionToken: "not-a-token"
    },
    expiresAt: at(60 * 60 * 1000),
    mintedAt: NOW.toISOString(),
    ...over
  };
}

describe("mountIdFor / sessionPathsFor", () => {
  it("is 16 hex digits, stable for one registry key and distinct across orgs", () => {
    const id = mountIdFor(mountKey(orgA, "support-docs"));
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(mountIdFor(mountKey(orgA, "support-docs"))).toBe(id);
    expect(mountIdFor(mountKey(orgB, "support-docs"))).not.toBe(id);
    expect(mountIdFor(mountKey(orgA, "other"))).not.toBe(id);
  });

  it("puts the session, the aws config and the cache under the 0700 state tree", () => {
    expect(sessionPathsFor(MOUNT_ID)).toEqual({
      dir: `${MOUNT_CREDENTIALS_DIR}/${MOUNT_ID}`,
      sessionFile: `${MOUNT_CREDENTIALS_DIR}/${MOUNT_ID}/session.json`,
      awsConfigFile: `${MOUNT_CREDENTIALS_DIR}/${MOUNT_ID}/aws.config`,
      cacheDir: `${MOUNT_CACHE_DIR}/${MOUNT_ID}`,
      // INSIDE the cache, so it shares its lifetime exactly: kept while saves
      // are pending, removed with the empty cache it describes.
      cacheOwnerFile: `${MOUNT_CACHE_DIR}/${MOUNT_ID}/owner.json`
    });
    expect(MOUNT_CREDENTIALS_DIR).toMatch(/\.nexus-mcp\/mount-credentials$/);
    expect(MOUNT_CACHE_DIR).toMatch(/\.nexus-mcp\/cache$/);
  });

  it("REFUSES an id that is not 16 hex digits, because two of these paths are recursively deleted", () => {
    // `readMounts` parses and casts `workspace-mounts.json`, so `MountRecord.mountId`
    // is a claim about a JSON file rather than a fact. `removeDirectSession` hands
    // `dir` and `cacheDir` to `fs.rmSync(…, { recursive: true, force: true })`, so a
    // hand-edited or corrupted row must not be allowed to aim them.
    for (const bad of ["../../..", "", "0123456789ABCDEF", "0123456789abcde", "../etc"]) {
      expect(() => sessionPathsFor(bad)).toThrow(/not 16 hex digits/);
    }
    // The positive control: the real shape still resolves.
    expect(sessionPathsFor(MOUNT_ID).dir).toBe(`${MOUNT_CREDENTIALS_DIR}/${MOUNT_ID}`);
  });
});

describe("rcloneEnvFor — the bucket lives in the environment and nowhere else", () => {
  const inherited: NodeJS.ProcessEnv = {
    HOME: "/Users/me",
    PATH: "/usr/bin",
    AWS_ACCESS_KEY_ID: "AKIA_SHELL_KEY",
    AWS_SECRET_ACCESS_KEY: "shell-secret",
    AWS_PROFILE: "work-shell",
    AWS_REGION: "us-east-1",
    NEXUS_API_KEY: "nxs_shell",
    NEXUS_PROFILE: "shell",
    NEXUS_ORGANIZATION_ID: "org_shell",
    RCLONE_S3_ENDPOINT: "http://127.0.0.1:1",
    RCLONE_S3_ACCESS_KEY_ID: "AKIA_MINIO_KEY",
    RCLONE_CONFIG_NXS3_ENDPOINT: "http://127.0.0.1:1",
    RCLONE_CONFIG: "/Users/me/.config/rclone/other.conf"
  };
  const env = rcloneEnvFor({
    inherited,
    awsConfigFile: `/Users/me/.nexus-mcp/mount-credentials/${MOUNT_ID}/aws.config`,
    mountId: MOUNT_ID,
    region: "eu-west-3",
    bucket: BUCKET,
    prefix: "support-docs/"
  });

  it("points rclone at an EMPTY config, so a user's own `nxs3` remote cannot supply the key", () => {
    // Stripping the environment is not enough: rclone merges the user's own
    // remotes from `~/.config/rclone/rclone.conf` BY NAME, and `nxs3` is a name
    // we chose. Their `access_key_id` is then present, and the s3 backend
    // honours `env_auth` only while it is blank — so the drive would sign with
    // their identity. Observed against the real bucket as `InvalidAccessKeyId`.
    expect(env.RCLONE_CONFIG).toBe("/dev/null");
    // And it is OURS, not the inherited one, which named a real file.
    expect(env.RCLONE_CONFIG).not.toBe(inherited.RCLONE_CONFIG);
  });

  it("names the bucket in the alias remote (positive control) while the argv names only the alias", () => {
    // The argv the engine will build names `nxws:`; the bucket reaches rclone
    // through the alias remote defined here. Both halves asserted, so a
    // regression that moved the bucket into argv could not pass by dropping it
    // from both.
    const argv = ["mount", "nxws:", "/Users/me/nexus/support-docs", "--vfs-cache-mode", "writes"];
    expect(env.RCLONE_CONFIG_NXWS_REMOTE).toBe(`nxs3:${BUCKET}/support-docs/`);
    expect(argv.join(" ")).not.toContain(BUCKET);
    expect(argv).toContain("nxws:");
  });

  it("strips every inherited AWS_* and RCLONE_* key and the three NEXUS_* selectors, keeping the rest", () => {
    const awsKeys = Object.keys(env)
      .filter((key) => key.startsWith("AWS_"))
      .sort();
    expect(awsKeys).toEqual([
      "AWS_CONFIG_FILE",
      "AWS_EC2_METADATA_DISABLED",
      "AWS_PROFILE",
      "AWS_SHARED_CREDENTIALS_FILE"
    ]);
    expect(env.AWS_ACCESS_KEY_ID).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.AWS_REGION).toBeUndefined();
    expect(env.NEXUS_API_KEY).toBeUndefined();
    expect(env.NEXUS_PROFILE).toBeUndefined();
    expect(env.NEXUS_ORGANIZATION_ID).toBeUndefined();
    // An inherited RCLONE_S3_ENDPOINT re-points the env-defined remote at
    // another host with the mount's signed requests; an RCLONE_S3_ACCESS_KEY_ID
    // outranks env_auth. The only RCLONE_* keys rclone sees are the eight set
    // here — `RCLONE_CONFIG` among them, because the environment is only half of
    // what rclone reads and the file is the other half.
    const rcloneKeys = Object.keys(env)
      .filter((key) => key.startsWith("RCLONE_"))
      .sort();
    expect(rcloneKeys).toEqual([
      "RCLONE_CONFIG",
      "RCLONE_CONFIG_NXS3_ENV_AUTH",
      "RCLONE_CONFIG_NXS3_NO_CHECK_BUCKET",
      "RCLONE_CONFIG_NXS3_PROVIDER",
      "RCLONE_CONFIG_NXS3_REGION",
      "RCLONE_CONFIG_NXS3_TYPE",
      "RCLONE_CONFIG_NXWS_REMOTE",
      "RCLONE_CONFIG_NXWS_TYPE"
    ]);
    expect(env.RCLONE_S3_ENDPOINT).toBeUndefined();
    expect(env.RCLONE_CONFIG_NXS3_ENDPOINT).toBeUndefined();
    // Positive control: a stripped-nothing env would also satisfy every
    // `toBeUndefined` above. Two ordinary keys must SURVIVE.
    expect(env.HOME).toBe("/Users/me");
    expect(env.PATH).toBe("/usr/bin");
  });

  it("points the SDK at the mount's own profile and config, with no shared credentials file", () => {
    expect(env.AWS_PROFILE).toBe(`nexus-mount-${MOUNT_ID}`);
    expect(env.AWS_CONFIG_FILE).toBe(
      `/Users/me/.nexus-mcp/mount-credentials/${MOUNT_ID}/aws.config`
    );
    expect(env.AWS_SHARED_CREDENTIALS_FILE).toBe("/dev/null");
    expect(env.AWS_EC2_METADATA_DISABLED).toBe("true");
  });

  it("defines the S3 remote from env auth with the bucket check off", () => {
    expect(env.RCLONE_CONFIG_NXS3_TYPE).toBe("s3");
    expect(env.RCLONE_CONFIG_NXS3_PROVIDER).toBe("AWS");
    expect(env.RCLONE_CONFIG_NXS3_ENV_AUTH).toBe("true");
    expect(env.RCLONE_CONFIG_NXS3_REGION).toBe("eu-west-3");
    // HeadBucket is denied under a prefix-conditioned ListBucket; without this
    // the mount fails at startup while a raw PutObject would have succeeded.
    expect(env.RCLONE_CONFIG_NXS3_NO_CHECK_BUCKET).toBe("true");
    expect(env.RCLONE_CONFIG_NXWS_TYPE).toBe("alias");
  });
});

describe("stableNodePath — the node spelling that survives a node upgrade", () => {
  const binary = path.basename(process.execPath);
  const stableBin = path.join(SANDBOX, "stable-node", "bin");
  const strangerBin = path.join(SANDBOX, "stranger-node", "bin");

  afterEach(() => {
    fs.rmSync(path.join(SANDBOX, "stable-node"), { recursive: true, force: true });
    fs.rmSync(path.join(SANDBOX, "stranger-node"), { recursive: true, force: true });
  });

  it("prefers the PATH entry that resolves to this very binary, whatever else PATH holds", () => {
    fs.mkdirSync(stableBin, { recursive: true });
    fs.symlinkSync(process.execPath, path.join(stableBin, binary));
    const pathEnv = ["/nonexistent/bin", stableBin].join(path.delimiter);
    expect(stableNodePath(process.execPath, pathEnv)).toBe(path.join(stableBin, binary));
  });

  it("never names a different node: a same-named binary that is NOT this one falls back to execPath", () => {
    fs.mkdirSync(strangerBin, { recursive: true });
    fs.writeFileSync(path.join(strangerBin, binary), "#!/bin/sh\nexit 1\n");
    expect(stableNodePath(process.execPath, strangerBin)).toBe(process.execPath);
    // The positive control: the same PATH plus the real symlink picks the symlink.
    fs.mkdirSync(stableBin, { recursive: true });
    fs.symlinkSync(process.execPath, path.join(stableBin, binary));
    expect(stableNodePath(process.execPath, [strangerBin, stableBin].join(path.delimiter))).toBe(
      path.join(stableBin, binary)
    );
  });

  it("ignores a RELATIVE PATH entry, which resolves against a working directory rclone does not share", () => {
    // `.` and `./bin` are ordinary in a dev shell. A line built from one passes
    // `credential-process --check` here — same working directory — and then
    // fails at the first renewal an hour later, run by rclone from its own.
    fs.mkdirSync(stableBin, { recursive: true });
    fs.symlinkSync(process.execPath, path.join(stableBin, binary));
    const relative = path.relative(process.cwd(), stableBin);
    expect(path.isAbsolute(relative)).toBe(false);
    expect(stableNodePath(process.execPath, relative)).toBe(process.execPath);
    // Positive control: the SAME directory spelled absolutely is taken.
    expect(stableNodePath(process.execPath, stableBin)).toBe(path.join(stableBin, binary));
  });

  it("falls back to execPath with an empty PATH, or a binary that does not exist", () => {
    expect(stableNodePath(process.execPath, "")).toBe(process.execPath);
    expect(stableNodePath("/nonexistent/node", "/usr/bin")).toBe("/nonexistent/node");
  });
});

describe("awsConfigFor — the credential_process line", () => {
  const execPath = "/Users/Jane Doe/.nvm/versions/node/v24.6.0/bin/node";
  const entry =
    "/Users/Jane Doe/.nvm/versions/node/v24.6.0/lib/node_modules/@agent-nexus/cli/dist/index.js";

  it("quotes both paths and ends on the unquoted subcommand, so a space in HOME survives", () => {
    const result = awsConfigFor({ execPath, entry, mountId: MOUNT_ID });
    expect(result).toEqual({
      ok: true,
      text:
        `[profile nexus-mount-${MOUNT_ID}]\n` +
        `credential_process = "${execPath}" "${entry}" workspace credential-process ${MOUNT_ID}\n`
    });
    if (!result.ok) return;
    // The ini reader strips outer quotes only when the WHOLE value is one
    // quoted token — a value ending on a quote would reach the shell bare.
    const value = result.text.split("credential_process = ")[1].trimEnd();
    expect(value.endsWith('"')).toBe(false);
    expect(value.endsWith(`workspace credential-process ${MOUNT_ID}`)).toBe(true);
  });

  it("reads its own line back, and refuses anything else", () => {
    const result = awsConfigFor({ execPath, entry, mountId: MOUNT_ID });
    if (!result.ok) throw new Error("fixture must be writable");
    expect(parseAwsConfig(result.text)).toEqual({ execPath, entry, mountId: MOUNT_ID });
    expect(parseAwsConfig("[default]\nregion = eu-west-3\n")).toBeNull();
    // The line without its profile header is not the file this CLI writes.
    expect(parseAwsConfig(result.text.split("\n")[1] + "\n")).toBeNull();
  });

  it.each([
    ["execPath", '/opt/no"de', "double-quote"],
    ["entry", "/opt/cli\nindex.js", "newline"],
    ["execPath", "/opt/node #x", "comment-start"],
    ["entry", "/opt/cli\t;index.js", "comment-start"],
    ["entry", "/opt/cli ;index.js", "comment-start"],
    // `sh -c` still expands these inside the double quotes the paths sit in.
    ["execPath", "/Volumes/data$backup/node", "shell-special"],
    ["entry", "/opt/`cli`/index.js", "shell-special"],
    ["entry", "C:\\cli\\index.js", "shell-special"]
  ] as const)(
    "refuses a %s of %j (%s) rather than writing a line that tokenises differently",
    (field, bad, because) => {
      const input = { execPath, entry, mountId: MOUNT_ID, [field]: bad };
      expect(awsConfigFor(input)).toEqual({ ok: false, refusal: { field, because } });
    }
  );

  it("accepts `#` and `;` that no whitespace precedes (positive control for the refusal)", () => {
    expect(
      awsConfigFor({ execPath: "/opt/c#/node", entry: "/opt/a;b/index.js", mountId: MOUNT_ID }).ok
    ).toBe(true);
  });
});

describe("processCredentialsDocument — Expiration is five minutes early and never in the past", () => {
  it("is the AWS process-credentials shape with Expiration = expiresAt − 5 min", () => {
    const fresh = session({ expiresAt: at(60 * 60 * 1000) });
    expect(processCredentialsDocument(fresh, NOW)).toEqual({
      Version: 1,
      AccessKeyId: "ASIA_TEST_KEY_ID",
      SecretAccessKey: "not-a-secret",
      SessionToken: "not-a-token",
      Expiration: at(55 * 60 * 1000)
    });
    expect(EXPIRATION_LEAD_MS).toBe(5 * 60 * 1000);
  });

  it("answers null — never a past Expiration — once the lead has been reached", () => {
    // AT the lead: reported expiration equals now, which the SDK reads as
    // already expired and would rerun the helper on every request.
    expect(
      processCredentialsDocument(session({ expiresAt: at(EXPIRATION_LEAD_MS) }), NOW)
    ).toBeNull();
    expect(processCredentialsDocument(session({ expiresAt: at(-1000) }), NOW)).toBeNull();
    // One second past the lead is the first servable instant.
    const doc = processCredentialsDocument(
      session({ expiresAt: at(EXPIRATION_LEAD_MS + 1000) }),
      NOW
    );
    expect(doc?.Expiration).toBe(at(1000));
    for (const offset of [1000, 60_000, 3_600_000]) {
      const served = processCredentialsDocument(
        session({ expiresAt: at(EXPIRATION_LEAD_MS + offset) }),
        NOW
      );
      expect(served && new Date(served.Expiration).getTime() > NOW.getTime()).toBe(true);
    }
  });
});

describe("redactBucketNames", () => {
  it("rewrites the bucket in a real rclone AccessDenied line (positive control) and leaves the rest", () => {
    const line =
      "2026/09/04 12:00:01 ERROR : probe.txt: Failed to copy: AccessDenied: User: " +
      "arn:aws:sts::123456789012:assumed-role/nexus-workspaces-sandbox/cli-abc is not authorized to " +
      `perform: s3:PutObject on resource: "arn:aws:s3:::${BUCKET}/other-slug/probe.txt"`;
    const redacted = redactBucketNames(line);
    expect(redacted).not.toContain(BUCKET);
    expect(redacted).toContain('"arn:aws:s3:::<bucket>/other-slug/probe.txt"');
    expect(redacted).toContain("AccessDenied");
  });

  it("covers every environment letter and the platform bucket, and nothing shaped otherwise", () => {
    expect(redactBucketNames("nxw-p-shared nxw-s-abcdefabcdef nxw-d-000000000000")).toBe(
      "<bucket> <bucket> <bucket>"
    );
    // Not a workspace bucket: an unknown env letter, and thirteen hex digits.
    expect(redactBucketNames("nxw-x-0123456789ab nxw-d-0123456789abc")).toBe(
      "nxw-x-0123456789ab nxw-d-0123456789abc"
    );
  });
});

describe("REFRESH_FAILURE_TABLE — one row per reason, texts a user can act on", () => {
  // Removing a row is refused by `satisfies Record<RefreshFailureReason, …>`
  // at compile time, not here — a mutant that deletes the `remote-error` row
  // fails `tsc` with "Property 'remote-error' is missing". This runtime pin is
  // the population's identity, so a mutant that also widens the union is seen.
  it("keys exactly the CLI's six failure causes plus the two helper refusals", () => {
    expect(Object.keys(REFRESH_FAILURE_TABLE).sort()).toEqual(
      [
        "access-downgraded",
        "connection-failed",
        "local-failed",
        "not-authenticated",
        "not-found",
        "remote-error",
        "timed-out",
        "workspace-replaced"
      ].sort()
    );
  });

  it("marks exactly the two network failures transient", () => {
    const transient = Object.entries(REFRESH_FAILURE_TABLE)
      .filter(([, row]) => row.transient)
      .map(([reason]) => reason)
      .sort();
    expect(transient).toEqual(["connection-failed", "timed-out"]);
  });

  it("never names a bucket, a prefix, a mount id or the word credential in any text", () => {
    for (const [reason, row] of Object.entries(REFRESH_FAILURE_TABLE)) {
      for (const text of [row.title, row.body(CTX), row.statusHint(CTX)]) {
        expect(text, `${reason}: ${text}`).not.toMatch(
          /bucket|prefix|credential|nxw-|[0-9a-f]{16}/i
        );
        expect(text.length, `${reason} has an empty text`).toBeGreaterThan(10);
      }
    }
  });

  it("names the pinned profile in the sign-in fix and the slug in the unmount/remount fixes", () => {
    expect(REFRESH_FAILURE_TABLE["not-authenticated"].body(CTX)).toContain(
      "nexus auth login --profile work"
    );
    // The two fixes a fresh mount cures name the `remount` leaf, which keeps
    // the mount point, the mode, the copy and the cache directory.
    expect(REFRESH_FAILURE_TABLE["access-downgraded"].body(CTX)).toContain(
      "nexus workspace remount support-docs"
    );
    expect(REFRESH_FAILURE_TABLE["local-failed"].statusHint(CTX)).toContain(
      "nexus workspace remount support-docs"
    );
    // 🔴 The sign-in fixes the LOGIN and rewrites nothing here: this line IS the
    // last renewal's record, and only a renewal rewrites it. So `status` keeps
    // reporting the failure — and keeps exiting non-zero — until the drive is
    // next touched, which on an idle drive is never. The hint used to say "no
    // remount needed", true of the drive and false of this line, so a caller who
    // had just fixed the cause read a red status as the fix not working.
    const signIn = REFRESH_FAILURE_TABLE["not-authenticated"].statusHint(CTX);
    expect(signIn).toContain("nexus auth login --profile work");
    expect(signIn).toContain("nexus workspace remount support-docs");
    expect(signIn).not.toContain("no remount needed");
    // A workspace that is GONE or REPLACED is not remounted: a remount would
    // bind the old cache's unsent saves to whatever now answers to the slug.
    for (const reason of ["workspace-replaced", "not-found"] as const) {
      for (const text of [
        REFRESH_FAILURE_TABLE[reason].body(CTX),
        REFRESH_FAILURE_TABLE[reason].statusHint(CTX)
      ]) {
        expect(text).toContain("nexus workspace unmount support-docs");
        expect(text).not.toContain("workspace remount");
      }
    }
  });

  it("exits the two helper-side refusals as local-failed and every cause as itself", () => {
    expect(REFRESH_EXIT_CAUSE["access-downgraded"]).toBe("local-failed");
    expect(REFRESH_EXIT_CAUSE["workspace-replaced"]).toBe("local-failed");
    expect(REFRESH_EXIT_CAUSE["not-authenticated"]).toBe("not-authenticated");
    expect(REFRESH_EXIT_CAUSE["connection-failed"]).toBe("connection-failed");
  });
});

describe("refresh decisions", () => {
  it("accessIsLower: read under a read-write mount is lower; anything else is not", () => {
    expect(accessIsLower("read", "read-write")).toBe(true);
    expect(accessIsLower("read-write", "read")).toBe(false);
    expect(accessIsLower("read", "read")).toBe(false);
    expect(accessIsLower("read-write", "read-write")).toBe(false);
  });

  it("refreshCooldownFailure: a failure inside 30 s is still cooling down, an older one is not", () => {
    const failed = { at: at(-10_000), outcome: "failed", reason: "not-authenticated" } as const;
    expect(refreshCooldownFailure(session({ lastRefresh: failed }), NOW)).toEqual(failed);
    expect(REFRESH_COOLDOWN_MS).toBe(30_000);
    expect(
      refreshCooldownFailure(session({ lastRefresh: { ...failed, at: at(-31_000) } }), NOW)
    ).toBeNull();
    expect(
      refreshCooldownFailure(session({ lastRefresh: { at: at(-1000), outcome: "ok" } }), NOW)
    ).toBeNull();
    expect(refreshCooldownFailure(session(), NOW)).toBeNull();
    // An UNPARSEABLE stamp cools down. `isMountSession` only checks `at` is a
    // string, and every comparison against NaN is false — which would have
    // opened the gate and turned each Finder poll on a broken mount into a POST.
    expect(
      refreshCooldownFailure(session({ lastRefresh: { ...failed, at: "not-an-instant" } }), NOW)
    ).toEqual({ ...failed, at: "not-an-instant" });
    // A failure stamped in the future (the clock stepped back since) would
    // otherwise cool down until the clock caught up with it.
    expect(
      refreshCooldownFailure(session({ lastRefresh: { ...failed, at: at(10 * 60_000) } }), NOW)
    ).toBeNull();
  });

  it("refreshMayRetry: the attempt count caps fast failures, the budget bounds hung ones", () => {
    // rclone's AWS SDK kills credential_process at 60 s (processcreds
    // DefaultTimeout), and a kill records nothing — so every attempt must end
    // inside the budget, with room left for start-up and the record.
    expect(REFRESH_BUDGET_MS).toBeLessThan(60_000);
    expect(REFRESH_ATTEMPTS).toBe(3);
    expect(REFRESH_RETRY_DELAY_MS).toBe(2000);
    const timeoutMs = 20_000;
    // Refused connections come back at once: three attempts, then stop.
    expect(refreshMayRetry({ attempt: 1, elapsedMs: 10, timeoutMs })).toBe(true);
    expect(refreshMayRetry({ attempt: 2, elapsedMs: 2020, timeoutMs })).toBe(true);
    expect(refreshMayRetry({ attempt: 3, elapsedMs: 4030, timeoutMs })).toBe(false);
    // A backend that never answers costs the full timeout per attempt: the
    // second fits (20 + 2 + 20 = 42 s), the third would end at 64 s.
    expect(refreshMayRetry({ attempt: 1, elapsedMs: 20_000, timeoutMs })).toBe(true);
    expect(refreshMayRetry({ attempt: 2, elapsedMs: 42_000, timeoutMs })).toBe(false);
    // A --timeout longer than the budget leaves room for one attempt only.
    expect(refreshMayRetry({ attempt: 1, elapsedMs: 0, timeoutMs: REFRESH_BUDGET_MS })).toBe(false);
  });

  it("shouldNotify: transitions only, debounced by the last announcement of the same outcome", () => {
    const failed = { at: NOW.toISOString(), outcome: "failed", reason: "not-found" } as const;
    const ok = { at: NOW.toISOString(), outcome: "ok" } as const;
    const failedEarlier = { ...failed, at: at(-60_000) };
    // A mount with no refresh yet counts as ok: its first failure notifies.
    expect(shouldNotify(session(), failed, NOW)).toBe(true);
    expect(shouldNotify(session({ lastRefresh: ok }), failed, NOW)).toBe(true);
    expect(shouldNotify(session({ lastRefresh: failedEarlier }), failed, NOW)).toBe(false);
    expect(shouldNotify(session({ lastRefresh: failedEarlier }), ok, NOW)).toBe(true);
    expect(shouldNotify(session(), ok, NOW)).toBe(false);
    // Debounce: the same outcome was announced a minute ago.
    expect(
      shouldNotify(session({ lastRefresh: ok, lastNotified: { failed: at(-60_000) } }), failed, NOW)
    ).toBe(false);
    expect(
      shouldNotify(
        session({ lastRefresh: ok, lastNotified: { failed: at(-NOTIFICATION_DEBOUNCE_MS) } }),
        failed,
        NOW
      )
    ).toBe(true);
    // A notification about the OTHER outcome never suppresses this one.
    expect(
      shouldNotify(session({ lastRefresh: ok, lastNotified: { ok: at(-1000) } }), failed, NOW)
    ).toBe(true);
    // An announcement stamped in the future (the clock stepped back) does not
    // suppress, or the window would last until the clock caught up with it.
    expect(
      shouldNotify(session({ lastRefresh: ok, lastNotified: { failed: at(60_000) } }), failed, NOW)
    ).toBe(true);
  });

  it("shouldNotify: a drive flapping ok→failed→ok→failed inside the window announces each state ONCE", () => {
    // The debounce is only reachable when the announcement record survives the
    // transition to the OTHER outcome. A single last-announcement record is
    // overwritten by the ok→failed→ok round trip, so the second failure reads
    // as never announced and posts again — which is what made the ten-minute
    // promise in the help text unreachable.
    let stored = session();
    const step = (record: (typeof stored)["lastRefresh"] & object): boolean => {
      const notify = shouldNotify(stored, record, new Date(record.at));
      stored = session({
        lastRefresh: record,
        lastNotified: notify ? announced(stored, record) : stored.lastNotified
      });
      return notify;
    };
    expect(step({ at: at(0), outcome: "failed", reason: "not-found" })).toBe(true);
    expect(step({ at: at(60_000), outcome: "ok" })).toBe(true);
    expect(step({ at: at(120_000), outcome: "failed", reason: "not-found" })).toBe(false);
    expect(step({ at: at(180_000), outcome: "ok" })).toBe(false);
    // Past the window, the same transition speaks again.
    expect(
      step({ at: at(NOTIFICATION_DEBOUNCE_MS + 1000), outcome: "failed", reason: "not-found" })
    ).toBe(true);
    expect(stored.lastNotified).toEqual({
      failed: at(NOTIFICATION_DEBOUNCE_MS + 1000),
      ok: at(60_000)
    });
  });

  it("notificationArgv escapes the AppleScript string delimiters", () => {
    const argv = notificationArgv(
      'Nexus drive "Q3 \\ plans"',
      "Access expired",
      'Run: nexus auth login --profile "work"'
    );
    expect(argv[0]).toBe("-e");
    expect(argv[1]).toBe(
      'display notification "Run: nexus auth login --profile \\"work\\"" with title ' +
        '"Nexus drive \\"Q3 \\\\ plans\\"" subtitle "Access expired"'
    );
  });

  it.each([
    [new NexusTimeoutError(20_000), "timed-out"],
    [new NexusConnectionError("offline"), "connection-failed"],
    [new NexusAuthenticationError("expired", "API_KEY_EXPIRED"), "not-authenticated"],
    [new NexusApiError("INSUFFICIENT_SCOPE", "no", 403), "not-authenticated"],
    [new NexusApiError("WORKSPACE_NOT_FOUND", "gone", 404), "not-found"],
    [new NexusApiError("WORKSPACE_STORAGE_FAILED", "sts", 500), "remote-error"],
    [new Error("something else"), "remote-error"]
  ] as const)("refreshFailureReasonFor(%o) is %s", (error, reason) => {
    expect(refreshFailureReasonFor(error)).toBe(reason);
  });
});

describe("toVolumeName", () => {
  it("strips path separators, collapses whitespace, appends the org and caps the length", () => {
    expect(toVolumeName("Q3: Plans / Drafts")).toBe("Q3 Plans Drafts");
    expect(toVolumeName("Support   Docs", "Acme")).toBe("Support Docs (Acme)");
    expect(toVolumeName("   ")).toBe("Nexus workspace");
    expect(toVolumeName("x".repeat(100))).toHaveLength(VOLUME_NAME_MAX_CHARS);
  });

  it("cuts by code point, so a name capped mid-emoji never ends in half a character", () => {
    // `slice` cuts UTF-16 units. A pair straddling the cap would leave a lone
    // surrogate: invalid UTF-8 for the FUSE layer, a bare \udXXX escape inside
    // session.json that every later read carries, a tofu glyph in Finder.
    const name = "x".repeat(VOLUME_NAME_MAX_CHARS - 1) + "🙂" + "tail";
    const volume = toVolumeName(name);
    expect([...volume]).toHaveLength(VOLUME_NAME_MAX_CHARS);
    expect(volume.endsWith("🙂")).toBe(true);
    // The defect stated directly: no unpaired surrogate anywhere in the result.
    expect(/[\uD800-\uDFFF]/.test(volume.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""))).toBe(
      false
    );
  });
});

describe("isMountSession — a damaged file is a typed miss, never a crash", () => {
  it("accepts the session this CLI writes, with and without its optional records", () => {
    expect(isMountSession(session())).toBe(true);
    expect(
      isMountSession(
        session({
          lastRefresh: { at: NOW.toISOString(), outcome: "failed", reason: "timed-out" },
          lastNotified: { ok: NOW.toISOString(), failed: at(-60_000) }
        })
      )
    ).toBe(true);
  });

  it.each([
    ["not an object", "{}"],
    ["another version", { ...session(), version: 2 }],
    ["a mount id that is not 16 hex", { ...session(), mountId: "abc" }],
    // An empty pin reads as unset downstream, so the refresh would follow the
    // shell or the active profile instead of the mount.
    ["an empty profile pin", { ...session(), profile: "" }],
    ["an empty base URL pin", { ...session(), baseUrl: "" }],
    ["an empty organization pin", { ...session(), orgId: "" }],
    ["no organization pin", { ...session(), orgId: undefined }],
    ["no credentials", { ...session(), credentials: undefined }],
    [
      "a failed refresh with no reason",
      { ...session(), lastRefresh: { at: NOW.toISOString(), outcome: "failed" } }
    ],
    [
      "a reason outside the union",
      { ...session(), lastRefresh: { at: NOW.toISOString(), outcome: "failed", reason: "eio" } }
    ],
    [
      "an announcement record keyed by something that is not an outcome",
      { ...session(), lastNotified: { at: NOW.toISOString(), outcome: "ok" } }
    ],
    ["a truncated write", JSON.parse('{"version":1,"mountId":"0123456789abcdef"}')]
  ])("refuses %s", (_name, value) => {
    expect(isMountSession(value)).toBe(false);
  });
});

// ── Slice 5: engines, preflight, argv, health, default path ──────────────────

describe("ENGINE_LIVENESS / defaultMountPath", () => {
  it("probes the two rclone-backed engines by pid and the native one by the mount table", () => {
    expect(ENGINE_LIVENESS).toEqual({ webdav: "mount-table", rclone: "pid", direct: "pid" });
  });

  it("puts the org NAME, slugified, between ~/nexus and the slug", () => {
    expect(mountPathOrgSegment({ orgId: "org_aaa", orgName: "Acme Corp." })).toBe("acme-corp");
    expect(mountPathOrgSegment({ orgId: "org_aaa", orgName: "  Globex / R&D  " })).toBe(
      "globex-r-d"
    );
    expect(defaultMountPath("support-docs", orgA)).toBe(
      path.join(os.homedir(), "nexus", "acme", "support-docs")
    );
  });

  it("falls back to the org id when the name is unknown, and to the org-less path when nothing identifies one", () => {
    // An env override naming another org yields an id and no name.
    expect(mountPathOrgSegment({ orgId: "org_env" })).toBe("org_env");
    expect(defaultMountPath("support-docs", { orgId: "org_env" })).toBe(
      path.join(os.homedir(), "nexus", "org_env", "support-docs")
    );
    // A name that slugifies to nothing is no name.
    expect(mountPathOrgSegment({ orgId: "org_x", orgName: "   " })).toBe("org_x");

    // 🔴 THE ID IS SANITISED TOO. It is not checked anywhere on the way here —
    // `resolveOrganization` hands back `NEXUS_ORGANIZATION_ID` verbatim — so it
    // is caller input reaching `path.join`, where `..` climbs out of `~/nexus`
    // and `createMountDir` then creates the result. The slug half has refused
    // exactly this all along.
    // Refused, not rewritten: the org-less path is a real layout, while a
    // "cleaned" id would name an organization that does not exist.
    for (const hostile of ["../../tmp/x", "..", "a/b", "a\\b", ""]) {
      expect(mountPathOrgSegment({ orgId: hostile })).toBeUndefined();
      expect(defaultMountPath("notes", { orgId: hostile })).toBe(
        path.join(os.homedir(), "nexus", "notes")
      );
    }
    // The positive control, and the reason the id is not slugified: a REAL id
    // is used verbatim, so no existing mount point is renamed by this guard.
    expect(mountPathOrgSegment({ orgId: "org_39FoxcMixrC5rGX65cZutTJ3x7a" })).toBe(
      "org_39FoxcMixrC5rGX65cZutTJ3x7a"
    );
    // A raw --api-key with no NEXUS_ORGANIZATION_ID: the pre-org-segment path.
    expect(mountPathOrgSegment({})).toBeUndefined();
    expect(defaultMountPath("support-docs", {})).toBe(
      path.join(os.homedir(), "nexus", "support-docs")
    );
  });
});

describe("rcloneBuildVerdict — the token is the capability", () => {
  const official = [
    "rclone v1.74.4",
    "- os/version: darwin 15.5 (64 bit)",
    "- go/version: go1.25.0",
    "- go/tags: cmount",
    ""
  ].join("\n");
  const homebrew = official.replace("- go/tags: cmount", "- go/tags: none");

  it("reads cmount off the official build and refuses Homebrew's `none`", () => {
    expect(rcloneBuildVerdict(official)).toBe("mount-capable");
    expect(rcloneBuildVerdict(homebrew)).toBe("no-mount-support");
  });

  it("refuses a version output with no go/tags line at all", () => {
    expect(rcloneBuildVerdict("rclone v1.50.0\n- os/arch: darwin/amd64\n")).toBe("no-tags-line");
    expect(rcloneBuildVerdict("")).toBe("no-tags-line");
  });

  it("does not take a tag that merely CONTAINS the token, and reads a multi-tag list", () => {
    expect(rcloneBuildVerdict("- go/tags: nocmount")).toBe("no-mount-support");
    expect(rcloneBuildVerdict("- go/tags: noselfupdate,cmount")).toBe("mount-capable");
  });

  it("every preflight problem opens with the engine flag; the darwin hint names the official binary and both FUSE layers", () => {
    const problems = [
      { kind: "rclone-missing" },
      { kind: "no-mount-support", verdict: "no-mount-support" },
      { kind: "no-mount-support", verdict: "no-tags-line" },
      { kind: "no-fuse-library" },
      { kind: "macfuse-not-approved" }
    ] as const;
    for (const problem of problems) {
      expect(preflightProblemMessage(problem, "direct")).toContain("--engine direct");
      // The gateway engine runs the same preflight and is named as itself.
      expect(preflightProblemMessage(problem, "rclone")).toContain("--engine rclone");
      expect(preflightProblemMessage(problem, "rclone")).not.toContain("--engine direct");
    }
    expect(
      preflightProblemMessage({ kind: "no-mount-support", verdict: "no-mount-support" }, "direct")
    ).toContain("cmount");
    expect(preflightProblemMessage({ kind: "macfuse-not-approved" }, "direct")).toContain(
      "load_macfuse"
    );
    const darwin = rcloneInstallHint("darwin");
    expect(darwin).toContain("https://rclone.org/downloads/");
    expect(darwin).not.toContain("brew install");
    expect(darwin).toContain("macFUSE");
    expect(darwin).toContain("FUSE-T");
    expect(darwin).toContain("drop --engine direct");
    // The other platforms have no engine that needs nothing, so no such offer.
    expect(rcloneInstallHint("linux")).toContain("fuse3");
    expect(rcloneInstallHint("linux")).not.toContain("drop --engine");
    expect(rcloneInstallHint("win32")).toContain("WinFsp");
  });
});

describe("directMountArgv — the bucket never enters argv", () => {
  const argv = directMountArgv({
    mountPath: "/Users/me/nexus/acme/support-docs",
    cacheDir: `/Users/me/.nexus-mcp/cache/${MOUNT_ID}`,
    slug: "support-docs",
    volumeName: "Support Docs (Acme)",
    readOnly: false
  });

  it("mounts the alias with the two labels and the mount-keyed cache, no bucket anywhere", () => {
    expect(argv.slice(0, 3)).toEqual(["mount", DIRECT_REMOTE, "/Users/me/nexus/acme/support-docs"]);
    expect(argv[argv.indexOf("--devname") + 1]).toBe("nexus-support-docs");
    expect(argv[argv.indexOf("--volname") + 1]).toBe("Support Docs (Acme)");
    expect(argv[argv.indexOf("--cache-dir") + 1]).toBe(`/Users/me/.nexus-mcp/cache/${MOUNT_ID}`);
    expect(argv[argv.indexOf("--vfs-cache-mode") + 1]).toBe("writes");
    expect(argv[argv.indexOf("--poll-interval") + 1]).toBe("0");
    expect(argv).not.toContain("--allow-other");
    expect(argv).not.toContain("--read-only");
    // Positive control for the absence claim: the env that pairs with this
    // argv DOES carry the bucket, so the split is real rather than vacuous.
    const env = rcloneEnvFor({
      inherited: {},
      awsConfigFile: `/Users/me/.nexus-mcp/mount-credentials/${MOUNT_ID}/aws.config`,
      mountId: MOUNT_ID,
      region: "eu-west-3",
      bucket: BUCKET,
      prefix: "support-docs/"
    });
    expect(JSON.stringify(env)).toContain(BUCKET);
    expect(argv.join(" ")).not.toContain(BUCKET);
  });

  it("adds --read-only when asked, and only then", () => {
    const readOnly = directMountArgv({
      mountPath: "/m",
      cacheDir: "/c",
      slug: "s",
      volumeName: "v",
      readOnly: true
    });
    expect(readOnly).toContain("--read-only");
    expect(readOnly.length).toBe(argv.length + 1);
  });
});

describe("relative time for the status table", () => {
  it("formatAgo / formatExpiry use the coarsest unit that is at least one", () => {
    expect(formatAgo(at(-12_000), NOW)).toBe("12s ago");
    expect(formatAgo(at(-41 * 60_000), NOW)).toBe("41m ago");
    expect(formatAgo(at(-3 * 3_600_000 - 5), NOW)).toBe("3h ago");
    expect(formatAgo(at(-2 * 86_400_000), NOW)).toBe("2d ago");
    expect(formatAgo(NOW.toISOString(), NOW)).toBe("just now");
    expect(formatAgo(at(5000), NOW)).toBe("just now");
    expect(formatExpiry(at(41 * 60_000), NOW)).toBe("in 41m");
    expect(formatExpiry(at(-3 * 60_000), NOW)).toBe("expired 3m ago");
  });
});

describe("the VFS cache: pending uploads and what unmount may delete", () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-vfs-cache-"));
  const metaRoot = path.join(cacheDir, "vfsMeta", "nxws{abc}", "support-docs");

  afterAll(() => {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  it("counts zero and holds nothing when the cache is absent (positive control below)", () => {
    expect(countPendingUploads(path.join(cacheDir, "absent"))).toBe(0);
    expect(cacheHoldsEntries(path.join(cacheDir, "absent"))).toBe(false);
  });

  it("a cache holding the OTHER copy's saves is refused, not drained into this workspace", () => {
    // The mount id hashes `<kind>:<id>|<slug>`, and a slug can name TWO
    // workspaces — the organization's own and the ownerless admin-shared one.
    // They differ only in a field that key never carries, so both land on one
    // cache directory. That is only dangerous because a dirty cache outlives
    // its mount by design: `unmount` keeps it, and the next direct mount drains
    // it — into the OTHER bucket, if the other copy mounts next.
    const dir = path.join(cacheDir, "provenance");
    const paths = { cacheDir: dir, cacheOwnerFile: path.join(dir, "owner.json") };
    fs.mkdirSync(path.join(dir, "vfsMeta", "x"), { recursive: true });
    fs.writeFileSync(path.join(dir, "vfsMeta", "x", "item"), '{"Dirty":true}');
    writeCacheOwner(paths.cacheOwnerFile, { shared: false });

    // The other copy, with saves pending: refused, and told where they belong.
    const refusal = cacheProvenanceRefusal(paths, true, "support-docs");
    expect(refusal).toContain("unsent saves");
    expect(refusal).toContain("wrong workspace");
    // The SAME copy drains normally — the positive control, without which a
    // guard that refused everything would pass the assertion above.
    expect(cacheProvenanceRefusal(paths, false, "support-docs")).toBeNull();

    // An EMPTY cache misdelivers nothing, so a stale marker never blocks.
    fs.rmSync(path.join(dir, "vfsMeta"), { recursive: true, force: true });
    expect(cacheProvenanceRefusal(paths, true, "support-docs")).toBeNull();

    // No marker at all — every cache written before this file existed — is not
    // a provenance, so it is not a refusal either.
    fs.rmSync(paths.cacheOwnerFile, { force: true });
    fs.mkdirSync(path.join(dir, "vfsMeta", "x"), { recursive: true });
    fs.writeFileSync(path.join(dir, "vfsMeta", "x", "item"), '{"Dirty":true}');
    expect(cacheProvenanceRefusal(paths, true, "support-docs")).toBeNull();
  });

  it("an UNREADABLE cache is not an empty one — the count is unknown and the cache is held", () => {
    // The whole point: `unmount` deletes a cache it believes is empty. A
    // directory read can fail for reasons that say nothing about emptiness, and
    // reading those as zero is how an unsent save disappears. Chmod 000 the
    // metadata root and both answers must refuse to call it clean.
    const unreadable = path.join(cacheDir, "unreadable");
    fs.mkdirSync(path.join(unreadable, "vfsMeta", "locked"), { recursive: true });
    fs.writeFileSync(path.join(unreadable, "vfsMeta", "locked", "item"), '{"Dirty":true}');
    fs.chmodSync(path.join(unreadable, "vfsMeta", "locked"), 0o000);
    try {
      expect(countPendingUploads(unreadable)).toBe(PENDING_UPLOADS_UNKNOWN);
      // Both comparisons in the two decision sites must fail SAFE, and they
      // compare in opposite directions — this is why the sentinel is infinite.
      expect(countPendingUploads(unreadable) === 0).toBe(false);
      expect(countPendingUploads(unreadable) > 0).toBe(true);
      expect(cacheHoldsEntries(unreadable)).toBe(true);
      expect(describePendingUploads(PENDING_UPLOADS_UNKNOWN)).toBe("An unknown number of");
      expect(describePendingUploads(3)).toBe("3");
    } finally {
      fs.chmodSync(path.join(unreadable, "vfsMeta", "locked"), 0o700);
    }
  });

  it("counts the DIRTY items, a metadata file it cannot parse, and nothing that is clean", () => {
    // Asymmetric on purpose: two dirty, one clean. A reader that inverted the
    // flag would count one clean plus the torn file and still answer 2 against
    // a one-and-one fixture, which is how this case first stayed green.
    fs.mkdirSync(path.join(metaRoot, "notes"), { recursive: true });
    fs.writeFileSync(path.join(metaRoot, "clean.md"), JSON.stringify({ Size: 3, Dirty: false }));
    fs.writeFileSync(
      path.join(metaRoot, "notes", "dirty.md"),
      JSON.stringify({ Size: 3, Dirty: true })
    );
    fs.writeFileSync(path.join(metaRoot, "draft.md"), JSON.stringify({ Size: 9, Dirty: true }));
    fs.writeFileSync(path.join(metaRoot, "torn.md"), '{"Size": 3, "Dirty": tr');
    expect(countPendingUploads(cacheDir)).toBe(3);
    expect(cacheHoldsEntries(cacheDir)).toBe(true);
  });

  it("holds entries while only the data tree has a file, so a clean cache is still not deleted", () => {
    fs.rmSync(path.join(cacheDir, "vfsMeta"), { recursive: true, force: true });
    const dataRoot = path.join(cacheDir, "vfs", "nxws{abc}", "support-docs");
    fs.mkdirSync(dataRoot, { recursive: true });
    fs.writeFileSync(path.join(dataRoot, "clean.md"), "abc");
    expect(countPendingUploads(cacheDir)).toBe(0);
    expect(cacheHoldsEntries(cacheDir)).toBe(true);
  });
});

describe("checkRefreshPath / directMountHealth — the status verdict from local reads", () => {
  const profileExists = (name: string): boolean => name === "work";
  const input = { mountId: MOUNT_ID, slug: "support-docs", profileExists, now: NOW };

  function writeGoodConfig(): void {
    const config = awsConfigFor({
      execPath: process.execPath,
      entry: __filename,
      mountId: MOUNT_ID
    });
    if (!config.ok) throw new Error("fixture must be writable");
    fs.writeFileSync(sessionPathsFor(MOUNT_ID).awsConfigFile, config.text);
  }

  afterEach(() => {
    fs.rmSync(sessionPathsFor(MOUNT_ID).dir, { recursive: true, force: true });
    fs.rmSync(sessionPathsFor(MOUNT_ID).cacheDir, { recursive: true, force: true });
  });

  it("is broken when the session is missing, and names the file and the remount", () => {
    const health = directMountHealth(input);
    expect(health.verdict).toEqual({
      kind: "broken",
      what: `${sessionPathsFor(MOUNT_ID).sessionFile} missing`,
      fix: "nexus workspace remount support-docs"
    });
    expect(health.expiresAt).toBeNull();
    expect(refreshVerdictIsUnhealthy(health.verdict)).toBe(true);
    expect(describeRefresh(health.verdict, NOW, true)).toBe(
      `broken: ${sessionPathsFor(MOUNT_ID).sessionFile} missing — run: nexus workspace remount support-docs`
    );
  });

  it("is broken when the profile the session pins is gone from config.json, naming the sign-in", () => {
    writeSession(session({ profile: "gone" }));
    writeGoodConfig();
    const health = directMountHealth(input);
    expect(health.verdict).toEqual({
      kind: "broken",
      what: 'profile "gone" missing from config.json',
      fix: "nexus auth login --profile gone"
    });
    expect(health.expiresAt).toBe(session().expiresAt);
  });

  it("is broken when aws.config is missing or names a node that is not there", () => {
    writeSession(session());
    const paths = sessionPathsFor(MOUNT_ID);
    expect(checkRefreshPath(session())).toEqual({
      ok: false,
      problem: `${paths.awsConfigFile} missing`
    });
    expect(directMountHealth(input).verdict).toMatchObject({
      kind: "broken",
      what: `${paths.awsConfigFile} missing`
    });

    const moved = awsConfigFor({
      execPath: "/nonexistent/node",
      entry: __filename,
      mountId: MOUNT_ID
    });
    if (!moved.ok) throw new Error("fixture must be writable");
    fs.writeFileSync(paths.awsConfigFile, moved.text);
    const probe = checkRefreshPath(session());
    expect(probe.ok).toBe(false);
    if (probe.ok) return;
    expect(probe.problem).toContain("/nonexistent/node");
    expect(probe.problem).toContain("missing or not usable");

    fs.writeFileSync(paths.awsConfigFile, "[default]\nregion = eu-west-3\n");
    expect(checkRefreshPath(session())).toMatchObject({ ok: false });
  });

  it("is ok, dated by the last renewal or the mint, while the access is valid and the path usable", () => {
    writeSession(session());
    writeGoodConfig();
    expect(checkRefreshPath(session())).toEqual({ ok: true });
    const fresh = directMountHealth(input);
    expect(fresh.verdict).toEqual({ kind: "ok", at: NOW.toISOString() });
    expect(fresh.expiresAt).toBe(session().expiresAt);
    expect(fresh.pendingUploads).toBe(0);
    expect(refreshVerdictIsUnhealthy(fresh.verdict)).toBe(false);
    expect(describeRefresh(fresh.verdict, new Date(at(3 * 60_000)), true)).toBe("ok 3m ago");
    expect(refreshJson(fresh.verdict)).toEqual({
      outcome: "ok",
      at: NOW.toISOString(),
      reason: null,
      transient: false,
      fix: null
    });

    fs.rmSync(sessionPathsFor(MOUNT_ID).sessionFile);
    writeSession(session({ lastRefresh: { at: at(-60_000), outcome: "ok" } }));
    expect(directMountHealth(input).verdict).toEqual({ kind: "ok", at: at(-60_000) });
  });

  it("answers BROKEN, not ok, when expiresAt cannot be read", () => {
    // `isMountSession` checks `expiresAt` is a STRING, not that it is an
    // instant, so a truncated stamp survives a round trip. `NaN <= now` is
    // FALSE, which fell past the staleness arm to `ok` — and `status` exits 0,
    // the half a script gates on. `isFresh` fails safe on the very same field,
    // so the two readers of one value disagreed about which way to fail.
    writeSession(session({ expiresAt: "not-an-instant" }));
    writeGoodConfig();
    const health = directMountHealth(input);
    expect(health.verdict.kind).toBe("broken");
    expect(refreshVerdictIsUnhealthy(health.verdict)).toBe(true);

    // Positive control: the SAME setup with a readable expiry reads ok, so the
    // assertion above cannot be satisfied by a verdict that refuses everything.
    writeSession(session());
    writeGoodConfig();
    expect(directMountHealth(input).verdict.kind).toBe("ok");
  });
  it("is stale — not broken, exit 0 — when the access expired with no failure recorded", () => {
    writeSession(session({ expiresAt: at(-3 * 60_000) }));
    writeGoodConfig();
    const health = directMountHealth(input);
    expect(health.verdict).toEqual({ kind: "stale", expiredAt: at(-3 * 60_000) });
    expect(refreshVerdictIsUnhealthy(health.verdict)).toBe(false);
    expect(describeRefresh(health.verdict, NOW, true)).toBe(
      "stale: expired 3m ago, refreshes on next access"
    );
    // Nothing accesses a dead mount, so "next access" is not a promise it can keep.
    expect(describeRefresh(health.verdict, NOW, false)).toBe(
      "stale: expired 3m ago, mount is not live — remount"
    );
    expect(refreshJson(health.verdict)).toMatchObject({ outcome: "stale", at: at(-3 * 60_000) });
  });

  it("is failed with the table's title and hint; transient stays healthy, the rest does not", () => {
    writeSession(
      session({
        lastRefresh: { at: at(-2 * 60_000), outcome: "failed", reason: "not-authenticated" }
      })
    );
    writeGoodConfig();
    const notAuthenticated = directMountHealth(input);
    expect(notAuthenticated.verdict).toEqual({
      kind: "failed",
      at: at(-2 * 60_000),
      reason: "not-authenticated",
      transient: false,
      fix: REFRESH_FAILURE_TABLE["not-authenticated"].statusHint(CTX)
    });
    expect(refreshVerdictIsUnhealthy(notAuthenticated.verdict)).toBe(true);
    expect(describeRefresh(notAuthenticated.verdict, NOW, true)).toBe(
      `failed 2m ago: Access expired — ${REFRESH_FAILURE_TABLE["not-authenticated"].statusHint(CTX)}`
    );
    expect(refreshJson(notAuthenticated.verdict)).toEqual({
      outcome: "failed",
      at: at(-2 * 60_000),
      reason: "not-authenticated",
      transient: false,
      fix: REFRESH_FAILURE_TABLE["not-authenticated"].statusHint(CTX)
    });

    fs.rmSync(sessionPathsFor(MOUNT_ID).sessionFile);
    writeSession(
      session({ lastRefresh: { at: at(-60_000), outcome: "failed", reason: "connection-failed" } })
    );
    const offline = directMountHealth(input);
    expect(offline.verdict).toMatchObject({ kind: "failed", transient: true });
    expect(refreshVerdictIsUnhealthy(offline.verdict)).toBe(false);
  });

  it("counts the cache's pending uploads alongside the verdict, whatever the verdict", () => {
    const metaRoot = path.join(
      sessionPathsFor(MOUNT_ID).cacheDir,
      "vfsMeta",
      "nxws{abc}",
      "support-docs"
    );
    fs.mkdirSync(metaRoot, { recursive: true });
    fs.writeFileSync(path.join(metaRoot, "a.md"), JSON.stringify({ Dirty: true }));
    fs.writeFileSync(path.join(metaRoot, "b.md"), JSON.stringify({ Dirty: true }));
    fs.writeFileSync(path.join(metaRoot, "c.md"), JSON.stringify({ Dirty: false }));
    expect(directMountHealth(input).pendingUploads).toBe(2);
    writeSession(session());
    writeGoodConfig();
    expect(directMountHealth(input).pendingUploads).toBe(2);
  });

  it("never names a bucket, a prefix or a credential value in any verdict text", () => {
    writeSession(
      session({ lastRefresh: { at: at(-1000), outcome: "failed", reason: "remote-error" } })
    );
    writeGoodConfig();
    const health = directMountHealth(input);
    const text =
      describeRefresh(health.verdict, NOW, true) + JSON.stringify(refreshJson(health.verdict));
    expect(text).not.toMatch(/nxw-|not-a-secret|not-a-token|ASIA_/);
    expect(text).not.toContain("support-docs/");
  });
});
