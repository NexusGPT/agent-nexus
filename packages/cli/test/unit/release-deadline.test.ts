/**
 * The deadline the release pin gate judges a bundle against, and how it is read
 * off the monorepo. `scripts/skills-drift/publish-pin.ts` carries why the
 * question is "as of the release" rather than "as of now".
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  RELEASE_COMMIT_SUBJECT,
  RELEASE_STALENESS_TOLERANCE_HOURS,
  releaseDeadline,
  resolveReleaseDeadline
} from "../../scripts/skills-drift/release-deadline";
import { DEADLINE_1_10_0, readerFor, REPO_ROOT } from "./fixtures/publish-pin/recorded";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "publish-pin");

describe("the deadline: max(cut, merged − tolerance)", () => {
  const cut = "2026-10-05T02:28:24Z";

  it("is the cut when the merge came within the tolerance", () => {
    const merged = new Date(Date.parse(cut) + 60 * 60_000).toISOString();
    expect(
      releaseDeadline({
        cutAt: cut,
        cutSha: "e56317f1e3",
        mergedAt: merged,
        mergedBy: null,
        now: new Date()
      })?.at
    ).toBe(new Date(cut).toISOString());
  });

  it("is merged − tolerance when the release PR sat longer", () => {
    const merged = "2026-10-06T07:16:48Z";
    const expected = new Date(
      Date.parse(merged) - RELEASE_STALENESS_TOLERANCE_HOURS * 3_600_000
    ).toISOString();
    expect(
      releaseDeadline({
        cutAt: cut,
        cutSha: "e56317f1e3",
        mergedAt: merged,
        mergedBy: null,
        now: new Date()
      })?.at
    ).toBe(expected);
  });

  it("uses now for a release PR that has not merged", () => {
    const now = new Date("2026-10-07T00:00:00Z");
    expect(
      releaseDeadline({ cutAt: cut, cutSha: "e56317f1e3", mergedAt: null, mergedBy: null, now })?.at
    ).toBe(new Date(now.getTime() - RELEASE_STALENESS_TOLERANCE_HOURS * 3_600_000).toISOString());
  });

  it("the tolerance stays under the 19h20m that would let 1.3.0 through", () => {
    // #45 landed 2026-09-04T15:55:54Z; #5257 merged 2026-09-05T11:16:18Z.
    const gapHours =
      (Date.parse("2026-09-05T11:16:18Z") - Date.parse("2026-09-04T15:55:54Z")) / 3_600_000;
    expect(RELEASE_STALENESS_TOLERANCE_HOURS).toBeLessThan(gapHours);
  });
});

describe("resolving the release from the monorepo", () => {
  const HISTORY = JSON.parse(
    fs.readFileSync(path.join(FIXTURES, "1.10.0-changelog-history.json"), "utf-8")
  ) as { sha: string }[];
  const PULLS = JSON.parse(
    fs.readFileSync(path.join(FIXTURES, "1.10.0-release-pulls.json"), "utf-8")
  ) as unknown[];
  const REF = "c259672b55064b1a1eb85e2466b9652fb9025224";
  const HISTORY_PATH = `/commits?sha=${REF}&path=packages%2Fcli%2FCHANGELOG.md&per_page=30`;

  it("finds 1.10.0's release commit and #6931's merge, skipping the open #7342", async () => {
    const resolved = await resolveReleaseDeadline({
      read: readerFor({ [HISTORY_PATH]: HISTORY, [`/commits/${HISTORY[0].sha}/pulls`]: PULLS }),
      ref: REF,
      now: new Date("2026-10-06T07:17:29Z")
    });
    expect(resolved.kind).toBe("ok");
    expect(resolved.kind === "ok" && resolved.deadline.at).toBe(DEADLINE_1_10_0.at);
  });

  it("skips a changelog commit that is not a release", async () => {
    const handEdit = {
      sha: "f".repeat(40),
      commit: { message: "docs(cli): fix a typo", committer: { date: "2026-10-06T00:00:00Z" } }
    };
    const resolved = await resolveReleaseDeadline({
      read: readerFor({
        [HISTORY_PATH]: [handEdit, ...HISTORY],
        [`/commits/${HISTORY[0].sha}/pulls`]: PULLS
      }),
      ref: REF,
      now: new Date()
    });
    expect(resolved.kind === "ok" && resolved.deadline.at).toBe(DEADLINE_1_10_0.at);
  });

  it("is UNKNOWN, never a default, when no release commit is found", async () => {
    const resolved = await resolveReleaseDeadline({
      read: readerFor({ [HISTORY_PATH]: [] }),
      ref: REF,
      now: new Date()
    });
    expect(resolved).toMatchObject({ kind: "unknown", code: "RELEASE_NOT_FOUND" });
  });

  it("is UNKNOWN when the pull request lookup does not answer", async () => {
    const resolved = await resolveReleaseDeadline({
      read: readerFor({ [HISTORY_PATH]: HISTORY }),
      ref: REF,
      now: new Date()
    });
    expect(resolved).toMatchObject({ kind: "unknown", code: "RELEASE_PR_UNREADABLE" });
  });

  it("matches the subject release-version.yml actually writes", () => {
    const workflow = fs.readFileSync(
      path.join(REPO_ROOT, ".github", "workflows", "release-version.yml"),
      "utf-8"
    );
    expect(workflow).toContain(`RELEASE_TITLE: "${RELEASE_COMMIT_SUBJECT}"`);
  });
});
