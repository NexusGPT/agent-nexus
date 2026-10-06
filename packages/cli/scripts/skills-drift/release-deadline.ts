/**
 * The instant a CLI release was decided, which is what the release gate measures
 * staleness against — never the instant the gate happens to run.
 *
 * `publish-pin.ts`'s header carries the measurements that make this the question.
 */

import type { GitHubReader } from "./upstream";

/**
 * How long a release PR may sit between its cut and its merge before upstream
 * content it misses counts against it.
 *
 * Bounded from both sides by measurement. Above: 1.3.0's missing fix landed 19h20m
 * before its release merged, so anything at or past that would wave 1.3.0 through.
 * Below: a release PR's checks complete in about 13 minutes (#6931, 2026-10-05),
 * and the hourly re-cut in `release-version.yml` moves `cut` forward whenever
 * upstream content moved — so a release PR is never more than about an hour behind
 * its own cut, and six leaves room for that run being late or failing once.
 */
export const RELEASE_STALENESS_TOLERANCE_HOURS = 6;

/** When the release under judgement was decided, and why that instant. */
export interface ReleaseDeadline {
  /** ISO-8601. Upstream content that landed at or before this must be in the bundle. */
  at: string;
  /** One line per input, so a reader can re-derive the instant. */
  basis: string[];
}

/**
 * `max(cut, merged − tolerance)`. `merged` is null for a release PR that has not
 * merged yet, and `now` stands in for it — the merge cannot be earlier than now.
 */
export function releaseDeadline(params: {
  cutAt: string;
  cutSha: string;
  mergedAt: string | null;
  mergedBy: string | null;
  now: Date;
}): ReleaseDeadline | null {
  const cut = Date.parse(params.cutAt);
  const merged = params.mergedAt === null ? params.now.getTime() : Date.parse(params.mergedAt);
  if (Number.isNaN(cut) || Number.isNaN(merged)) return null;

  const tolerance = RELEASE_STALENESS_TOLERANCE_HOURS * 3_600_000;
  const at = new Date(Math.max(cut, merged - tolerance)).toISOString();
  return {
    at,
    basis: [
      `release cut   ${params.cutAt}  (${params.cutSha.slice(0, 10)})`,
      params.mergedAt === null
        ? `not merged    now, ${params.now.toISOString()}`
        : `merged        ${params.mergedAt}  (${params.mergedBy ?? "release PR"})`,
      `tolerance     ${RELEASE_STALENESS_TOLERANCE_HOURS}h after the cut`
    ]
  };
}

/**
 * The subject `release-version.yml` gives the release commit — its `RELEASE_TITLE`.
 * `publish-pin-gate.test.ts` reads that workflow and asserts the two agree, so a
 * renamed title is a red spec rather than a gate that stops finding releases.
 */
export const RELEASE_COMMIT_SUBJECT = "chore(release): version packages";

/** The file only a CLI release commit writes: `changeset version` adds its heading. */
export const CLI_CHANGELOG = "packages/cli/CHANGELOG.md";

/** How far back the search reaches for the release commit. */
const RELEASE_SEARCH_DEPTH = 30;

export type ReleaseDeadlineResult =
  | { kind: "ok"; deadline: ReleaseDeadline }
  | { kind: "unknown"; code: string; message: string };

/**
 * Find the CLI release that `ref` publishes, and from it the deadline.
 *
 * The release is the newest commit reachable from `ref` that wrote the CLI
 * changelog under {@link RELEASE_COMMIT_SUBJECT}. GitHub's path history follows a
 * merge to the side that changed the file, so a release PR merged with a merge
 * commit answers with the release commit itself, whose committer date is when
 * `release-version.yml` built it — the cut. The pull request that carried it to
 * `main`, if merged, supplies `merged`.
 *
 * Every failure here is UNKNOWN, never a default: a deadline guessed is a
 * deadline that can wave a stale bundle through.
 */
export async function resolveReleaseDeadline(params: {
  read: GitHubReader;
  ref: string;
  now: Date;
}): Promise<ReleaseDeadlineResult> {
  const { read, ref, now } = params;
  const history = await read(
    `/commits?sha=${ref}&path=${encodeURIComponent(CLI_CHANGELOG)}&per_page=${RELEASE_SEARCH_DEPTH}`
  );
  if (history.kind !== "ok" || !Array.isArray(history.body)) {
    const why =
      history.kind === "ok"
        ? "a body that is not a list"
        : history.kind === "transport"
          ? history.message
          : `${history.status} ${history.statusText}`;
    return {
      kind: "unknown",
      code: "RELEASE_UNREADABLE",
      message: `Could not read ${CLI_CHANGELOG}'s history at ${ref.slice(0, 10)} (${why}).`
    };
  }

  const release = (history.body as unknown[])
    .map((entry) => {
      const e = entry as {
        sha?: unknown;
        commit?: { message?: unknown; committer?: { date?: unknown } };
      };
      return {
        sha: typeof e.sha === "string" ? e.sha : "",
        subject:
          typeof e.commit?.message === "string" ? (e.commit.message.split("\n")[0] ?? "") : "",
        date: typeof e.commit?.committer?.date === "string" ? e.commit.committer.date : ""
      };
    })
    .find((c) => c.sha !== "" && c.subject.includes(RELEASE_COMMIT_SUBJECT));
  if (release === undefined || release.date === "") {
    return {
      kind: "unknown",
      code: "RELEASE_NOT_FOUND",
      message:
        `No "${RELEASE_COMMIT_SUBJECT}" commit wrote ${CLI_CHANGELOG} in the last ` +
        `${RELEASE_SEARCH_DEPTH} changes reachable from ${ref.slice(0, 10)}.`
    };
  }

  const pulls = await read(`/commits/${release.sha}/pulls`);
  if (pulls.kind !== "ok" || !Array.isArray(pulls.body)) {
    return {
      kind: "unknown",
      code: "RELEASE_PR_UNREADABLE",
      message: `Could not read which pull request carried ${release.sha.slice(0, 10)} to main.`
    };
  }
  const merged = (pulls.body as unknown[])
    .map((p) => p as { number?: unknown; merged_at?: unknown; base?: { ref?: unknown } })
    .find((p) => p.base?.ref === "main" && typeof p.merged_at === "string");

  const deadline = releaseDeadline({
    cutAt: release.date,
    cutSha: release.sha,
    mergedAt: merged === undefined ? null : (merged.merged_at as string),
    mergedBy: merged === undefined ? null : `#${String(merged.number)}`,
    now
  });
  if (deadline === null) {
    return {
      kind: "unknown",
      code: "RELEASE_DATES_UNREADABLE",
      message: `${release.sha.slice(0, 10)}'s dates did not parse.`
    };
  }
  return { kind: "ok", deadline };
}
