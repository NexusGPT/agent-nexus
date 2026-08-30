/**
 * WHICH surface drifted: bucket a compare's `files` array into the bundle
 * surfaces, or refuse and say why — and render that as lines for a verdict.
 *
 * "The pin drifted" is not a price anybody can pay. The bundle bakes FOUR
 * surfaces into the CLI and `nexus claude-code install` writes all of them into
 * a user's `~/.claude`: `skills/` is prose, and `hooks/`, `agents/` and
 * `settings.json` change how a session BEHAVES. `hooks/` are gates that refuse
 * commands, and upstream gitignores its observe-mode markers on purpose — its
 * own `hooks/.r34-observe.hold` says a fresh clone has no marker and is
 * ENFORCING from its first run. So a one-line sha bump can arm blocking checks
 * on every installing machine, and the verdict has to be able to say so.
 *
 * Everything here is DECORATION ON A VERDICT ALREADY REACHED. It may refuse, it
 * may be absent, it may be wrong about a count — and none of that is allowed to
 * move `state` or `code`. `verdict.ts` owns that invariant at the compare call
 * site; this file's part of the bargain is that every function below is TOTAL,
 * so there is never an exception for the invariant to have to survive.
 *
 * Kept apart from `verdict.ts` for the same reason `upstream.ts` is: deciding
 * which of three states this is, and describing what moved, are two
 * responsibilities, and only the first one is allowed to change an exit code.
 */

import { BRANCH } from "./upstream";

/**
 * How many files moved on each surface a bump would ship.
 *
 * Bucketed by FIRST PATH SEGMENT, which is the whole classification: GitHub
 * gives `filename` as a repo-relative path, `settings.json` carries no `/` and
 * so is its own bucket, and anything that is not one of the four bundle
 * surfaces (`tools/`, `CLAUDE.md`, `.gitignore`, …) lands in `other` rather
 * than being dropped — a total that does not add up is a classification nobody
 * can check.
 */
export interface SurfaceCounts {
  skills: number;
  hooks: number;
  agents: number;
  settingsJson: number;
  other: number;
  total: number;
}

/**
 * Why a surface count could not be trusted. Stable identifiers, asserted by the
 * self-test, so a case pins the CAUSE and never a sentence.
 */
export type SurfaceRefusal =
  /**
   * The payload carries no `files` key at all. PROVEN live against a paged
   * request (`?per_page=30&page=2`), where `status` and `ahead_by` stayed
   * correct and `files` simply was not there. Tested as `"files" in body`,
   * NEVER as `length === 0` — an empty array is a legitimate answer and
   * conflating the two is the likeliest bug in this whole classification.
   */
  | "FILES_ABSENT"
  /**
   * The array is at GitHub's documented 300-entry first-page cap. There is NO
   * truncation flag anywhere in the payload — not top level, not per entry —
   * so "exactly 300 files changed" and "the list was cut off" are the same
   * answer, and no bucket count read off it can be believed.
   */
  | "FILES_TRUNCATED"
  /** `files` is present but not an array, or an entry carries no string `filename`. */
  | "FILES_UNREADABLE"
  /** The second, reverse compare call did not answer. Degrades `departing` alone. */
  | "COMPARE_FAILED";

/**
 * One direction's reading: a measurement, a refusal, or an absence.
 *
 * `none` and `refused` are DIFFERENT ANSWERS and must never render alike.
 * "no commit under the pin is missing from upstream" is a fact established by
 * `behind_by === 0`; "the file list could not be read" is the absence of a
 * fact. Collapsing them would make an unmeasured surface read as a safe one,
 * which is the exact false green this whole check is built against.
 */
export type SurfaceReading =
  | { kind: "measured"; counts: SurfaceCounts }
  | { kind: "none"; reason: "BEHIND_BY_ZERO" }
  | { kind: "refused"; reason: SurfaceRefusal };

/**
 * GitHub's documented first-page cap on a compare's `files` array.
 *
 * debt: at the cap this refuses instead of paginating, so a genuinely enormous
 *       upstream jump reports FILES_TRUNCATED and names no surface at all.
 *       Ceiling: it classifies a compare of up to 299 files and refuses above.
 *       Upgrade trigger: the first time a real run reports FILES_TRUNCATED —
 *       then page `/compare/…?page=N` until short, and drop this constant.
 */
export const FILES_PAGE_CAP = 300;

/**
 * Bucket a compare's `files` array by surface, or refuse and say why.
 *
 * TOTAL by construction — every unrecognised shape is a `refused` value and
 * nothing here throws. A throw would escape to the top-level catch, which exits
 * CANNOT_CHECK, and a decorative count is not allowed to erase a finding.
 *
 * Reads `filename` only. NEVER `patch`: it is silently absent on 64 of 179
 * live entries (oversized files, plus a hard cutoff partway down the list) with
 * no flag saying so, while `filename` is present on all 179. Path-level
 * classification is safe; content-level is not.
 */
export function classifyFiles(body: unknown): SurfaceReading {
  if (typeof body !== "object" || body === null)
    return { kind: "refused", reason: "FILES_UNREADABLE" };

  // The key, not its length. An empty array is a real and correct answer on a
  // compare with no file changes; a MISSING key is the API declining to tell
  // us. `body.files ?? []` reads the second as the first and reports a bump as
  // touching nothing.
  if (!("files" in body)) return { kind: "refused", reason: "FILES_ABSENT" };
  const files = (body as { files: unknown }).files;
  if (!Array.isArray(files)) return { kind: "refused", reason: "FILES_UNREADABLE" };
  if (files.length >= FILES_PAGE_CAP) return { kind: "refused", reason: "FILES_TRUNCATED" };

  const counts: SurfaceCounts = {
    skills: 0,
    hooks: 0,
    agents: 0,
    settingsJson: 0,
    other: 0,
    total: 0
  };
  for (const entry of files) {
    if (typeof entry !== "object" || entry === null)
      return { kind: "refused", reason: "FILES_UNREADABLE" };
    const filename = (entry as { filename?: unknown }).filename;
    if (typeof filename !== "string" || filename === "") {
      return { kind: "refused", reason: "FILES_UNREADABLE" };
    }
    counts.total += 1;
    if (filename.startsWith("skills/")) counts.skills += 1;
    else if (filename.startsWith("hooks/")) counts.hooks += 1;
    else if (filename.startsWith("agents/")) counts.agents += 1;
    else if (filename === "settings.json") counts.settingsJson += 1;
    else counts.other += 1;
  }
  return { kind: "measured", counts };
}

/**
 * The classification, as lines for the verdict.
 *
 * Says ARRIVING and DEPARTING, never "changed". The forward compare is
 * merge-base-relative, so on a diverged pin it is complete only about what
 * upstream ADDED — commits unique to the pin side are absent from it entirely
 * rather than shown reversed. The wording is what stops a reader taking a
 * forward-only list for the whole story.
 *
 * Takes the three fields it reads rather than the caller's whole comparison
 * record: this file must not know what a verdict is, or the split that put it
 * here buys nothing.
 */
export function surfaceDetail(params: {
  mergeBase: string | null;
  arriving: SurfaceReading;
  departing: SurfaceReading;
}): string[] {
  const lines = [
    params.mergeBase === null
      ? `merge base: not reported — the counts below are relative to an unnamed commit.`
      : `merge base ${params.mergeBase}: both lists below are diffs from THIS commit, ` +
        `not from the pin, so the reading is reproducible.`,
    `arriving  ${renderReading(params.arriving)}`,
    `departing ${renderReading(params.departing)}`
  ];

  if (hooksTouched(params.arriving) || hooksTouched(params.departing)) {
    lines.push(
      `hooks/ are gates that REFUSE commands, and upstream gitignores its observe-mode`,
      `markers, so a fresh install enforces from its first run. The FILE COUNT above is`,
      `the whole derivable fact: how many of those are blocking-tier is NOT derivable —`,
      `hooks/CHECK-REGISTRY.md states the class as free text by design, and two careful`,
      `readings of it disagreed. Open the diff and read the tiers; do not re-derive a number.`
    );
  }
  return lines;
}

function renderReading(reading: SurfaceReading): string {
  if (reading.kind === "refused") {
    return `NOT CLASSIFIED (${reading.reason}) — ${refusalReason(reading.reason)}`;
  }
  if (reading.kind === "none") {
    // Absence BY CONSTRUCTION, and it must not read like a refusal: behind_by
    // is 0, so there is provably nothing on this side to lose.
    return (
      `NONE (BEHIND_BY_ZERO) — behind_by is 0, so no commit under the pin is absent ` +
      `from ${BRANCH}. Measured absence, not an unread surface.`
    );
  }
  const { counts } = reading;
  if (counts.total === 0) {
    return `0 file(s) — an EMPTY file list, which the compare reported. Measured, not refused.`;
  }
  const parts = [
    `skills/ ${counts.skills}`,
    `hooks/ ${counts.hooks}`,
    `agents/ ${counts.agents}`,
    `settings.json ${counts.settingsJson}`,
    `other ${counts.other}`
  ];
  return `${counts.total} file(s) — ${parts.join(" · ")}`;
}

function refusalReason(reason: SurfaceRefusal): string {
  switch (reason) {
    case "FILES_ABSENT":
      return `the compare answered without a "files" key at all, so which surfaces moved is unknown.`;
    case "FILES_TRUNCATED":
      return (
        `the compare returned ${FILES_PAGE_CAP} file entries, GitHub's documented first-page ` +
        `cap, and the payload carries NO truncation flag — so "exactly ${FILES_PAGE_CAP} changed" ` +
        `and "the list was cut off" are the same answer and neither can be believed.`
      );
    case "FILES_UNREADABLE":
      return `the "files" entries were not the shape this reads, so no count was taken.`;
    case "COMPARE_FAILED":
      return `the reverse compare did not answer, so what a bump would DROP is unknown.`;
  }
}

function hooksTouched(reading: SurfaceReading): boolean {
  return reading.kind === "measured" && reading.counts.hooks > 0;
}
