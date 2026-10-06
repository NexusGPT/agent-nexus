/**
 * The recorded upstream and monorepo answers the release pin gate is proven
 * against, and the scripted reader that serves them. Shared by
 * `publish-pin-gate.test.ts` and `release-deadline.test.ts`.
 *
 * Every JSON file beside this one is GitHub's own answer, trimmed to the fields
 * the code reads. Re-derive any of them rather than trusting it:
 *
 *   gh api repos/NexusGPT/claude-code-skills-nexus/compare/<pin>...<head>
 *   gh api "repos/NexusGPT/nexus/commits?sha=<ref>&path=packages%2Fcli%2FCHANGELOG.md&per_page=30"
 *   gh api repos/NexusGPT/nexus/commits/<release commit>/pulls
 *
 *   1.3.0    pin 61fb85d2dd (read from the published tarball), upstream head
 *            ec5acadf30 when it shipped. Release commit b3acecb596, cut
 *            2026-09-04T15:28:42Z, merged by #5257 at 2026-09-05T11:16:18Z.
 *   1.10.0   pin 8d1cd619e8, upstream head 0d58ef8787 when mirror sync run
 *            37428682363 withheld it. Release commit e56317f1e3, cut
 *            2026-10-05T02:28:24Z, merged by #6931 at 2026-10-06T07:16:48Z.
 *   #7344    the refresh to pin 0d58ef8787, against head 92df8e01ef — four
 *            commits behind again within minutes of going green.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type ReleaseDeadline,
  releaseDeadline
} from "../../../../scripts/skills-drift/release-deadline";
import type { GitHubReader, ReadResult } from "../../../../scripts/skills-drift/upstream";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The monorepo root, for arms that read a workflow's own text. */
export const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..", "..", "..");

export function fixture(name: string): {
  commits: { sha: string; commit: { committer: { date: string } } }[];
  files: { filename: string }[];
} & Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(HERE, name), "utf-8"));
}

export const PIN_1_3_0 = "61fb85d2dd2041143ed5d7eba3d97af21b339faa";
export const HEAD_AT_1_3_0 = "ec5acadf300227d1f5d0d99617fcb7cba5f07d2c";
export const GAP_1_3_0 = fixture("1.3.0-pin-to-head.json");
export const DUE_1_3_0 = fixture("1.3.0-pin-to-eb35d622ee.json");
export const EB35 = "eb35d622ee64fda5534a63d9e8d98c65f1299125";
/** The enforcement fix 1.3.0 shipped without, committed on a BRANCH at 09:52. */
export const W69_FIX = "3edc3d3da90708c9e6b3f937721c1f6fd2e47359";

export const PIN_1_10_0 = "8d1cd619e8fba201896b279fb171f8fd06097afa";
export const GAP_1_10_0 = fixture("1.10.0-pin-to-head.json");
export const DUE_1_10_0 = fixture("1.10.0-pin-to-a1cef4e993.json");
export const HEAD_AT_1_10_0_FULL = GAP_1_10_0.commits[GAP_1_10_0.commits.length - 1].sha;
export const A1CEF = "a1cef4e993";

export const PIN_7344 = HEAD_AT_1_10_0_FULL;
export const GAP_7344 = fixture("pr7344-pin-to-head.json");
export const HEAD_AT_7344 = "92df8e01effa55cfbb5a96cb9ae40709548ef38f";

export function deadlineAt(at: string): ReleaseDeadline {
  return { at, basis: [`fixed at ${at} by the arm`] };
}

/** The deadline each recorded release actually had — computed, not typed. */
export function recordedDeadline(cutAt: string, cutSha: string, mergedAt: string): ReleaseDeadline {
  const deadline = releaseDeadline({ cutAt, cutSha, mergedAt, mergedBy: null, now: new Date() });
  if (deadline === null) throw new Error("recorded dates did not parse");
  return deadline;
}
export const DEADLINE_1_3_0 = recordedDeadline(
  "2026-09-04T15:28:42Z",
  "b3acecb596",
  "2026-09-05T11:16:18Z"
);
export const DEADLINE_1_10_0 = recordedDeadline(
  "2026-10-05T02:28:24Z",
  "e56317f1e3",
  "2026-10-06T07:16:48Z"
);

/**
 * A reader scripted from a path→body map.
 *
 * Every request an arm did not anticipate resolves to a 500 rather than a
 * default body: a stub that answers a call the code was not expected to make
 * turns an unexpected code path into a passing one.
 */
export function readerFor(routes: Record<string, unknown>): GitHubReader {
  return (apiPath: string): Promise<ReadResult> => {
    if (apiPath in routes) return Promise.resolve({ kind: "ok", body: routes[apiPath] });
    return Promise.resolve({ kind: "http", status: 500, statusText: `unstubbed path ${apiPath}` });
  };
}

export const ROUTES_1_3_0 = {
  "/commits/main": { sha: HEAD_AT_1_3_0 },
  [`/compare/${PIN_1_3_0}...${HEAD_AT_1_3_0}`]: GAP_1_3_0,
  [`/compare/${PIN_1_3_0}...${EB35}`]: DUE_1_3_0
};

export const ROUTES_1_10_0 = {
  "/commits/main": { sha: HEAD_AT_1_10_0_FULL },
  [`/compare/${PIN_1_10_0}...${HEAD_AT_1_10_0_FULL}`]: GAP_1_10_0
};

export const A1CEF_FULL = GAP_1_10_0.commits.find((c) => c.sha.startsWith(A1CEF))?.sha as string;

export const ROUTES_7344 = {
  "/commits/main": { sha: HEAD_AT_7344 },
  [`/compare/${PIN_7344}...${HEAD_AT_7344}`]: GAP_7344
};
