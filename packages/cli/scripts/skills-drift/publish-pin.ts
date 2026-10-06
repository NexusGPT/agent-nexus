/**
 * The release-moment question: does the skills bundle a CLI release is about to
 * publish miss upstream content that had ALREADY LANDED when the release was
 * decided?
 *
 * ## Why this exists beside `verdict.ts` rather than inside it
 *
 * `verdict.ts` answers "has anybody looked at this lately", and it is right to
 * answer on AGE with a review window: between releases, being some commits
 * behind is the intended state, because bumping the pin ships enforcement and is
 * a reviewed act. A release is different. It is the instant the pin stops being a
 * reviewable position in this repository and becomes a fact inside an artefact on
 * npm, installed by people who cannot see the pin and will not get a corrected one
 * until somebody cuts another version.
 *
 * ## The measurement that produced it
 *
 * `@agent-nexus/cli@1.3.0` was published 2026-09-05T15:36:49Z carrying pin
 * `61fb85d2dd`. Its release PR (#5257) merged at 2026-09-05T11:16:18Z, and
 * `3edc3d3da9 fix(hooks): re-land W69 …` had landed upstream as PR #45 at
 * 2026-09-04T15:55:54Z — nineteen hours and twenty minutes before that merge. A
 * fix that had been on upstream's default branch for most of a day reached no
 * user, and nothing anywhere refused the release.
 *
 * ## Why the question is "as of the release", never "as of now"
 *
 * This gate used to demand that the pin BE upstream head at the instant the
 * mirror sync ran. That instant is minutes after a human merges the release PR,
 * and the pin reaches the release through a PR to `staging`, a promotion and the
 * release PR — a path measured in hours to days. Upstream changes what an install
 * writes far faster than that: over 2026-09-22 → 10-06, 68 of 71 non-merge
 * upstream commits touched a file the bundle ships, and the chance that NOTHING
 * shipping landed inside a window was 0.58 over 6 hours, 0.15 over 24 and 0.01
 * over 48. So "zero commits behind at sync time" was not a strict gate, it was a
 * coin that came up tails on almost every release: `cli-v1.10.0` was withheld on
 * 2026-10-06 for 29 commits that landed upstream AFTER its release was cut, and
 * the refresh sent after it was behind again within minutes.
 *
 * A guarantee nobody can satisfy is not a stronger guarantee. The one kept here is
 * the one 1.3.0 broke, stated so a release can meet it:
 *
 *   The bundle may not miss any upstream change to a shipping file that landed on
 *   upstream `main` before the DEADLINE of the release:
 *
 *     deadline = max(cut, merged − RELEASE_STALENESS_TOLERANCE_HOURS)
 *
 *   `cut`     when `release-version.yml` built the release commit — it regenerates
 *             the bundle at upstream head in that same commit, so this half holds
 *             by construction unless the regeneration silently did not happen.
 *   `merged`  when a human merged the release PR (now, before it merges). The
 *             tolerance is how long a release PR may sit after its cut before the
 *             content it misses counts as stale: 1.3.0 is refused because its
 *             missing fix landed 19h20m before the merge, far outside it.
 *
 * The deadline is FIXED once the release has merged, so the race is gone: a
 * refreshed pin that reaches `main` later satisfies it permanently, however fast
 * upstream keeps moving afterwards. Content that landed after the deadline is
 * named in the report and ships in the next release.
 *
 * ## Content, not shas
 *
 * A commit that changes no file an install writes — `statusline/`, `tools/`, a
 * README — cannot make a bundle stale. Which files ship is answered by
 * `mayShip` in `src/skills-corpus/shipped-paths.ts`, from the same root constants
 * the corpus builder reads through, so the two cannot disagree.
 *
 * ## Three states, and UNCHECKED is not a softer pass
 *
 *   RELEASE_PIN_CURRENT     nothing shipping that landed before the deadline is missing
 *   RELEASE_PIN_BEHIND      named commits are missing, or the pin is off-branch
 *   RELEASE_PIN_UNCHECKED   no credential, or a read did not answer
 *
 * UNCHECKED refuses. An unverified pin at publish time is the exact state that
 * shipped 1.3.0; a tick over it would reproduce the defect while claiming the
 * opposite.
 */

import { mayShip } from "../../src/skills-corpus/shipped-paths";
import {
  COMPARE_FILES_LIMIT,
  landedBy,
  type MissingCommit,
  parseCompare,
  renderMissing
} from "./compare-range";
import type { ReleaseDeadline } from "./release-deadline";
import { BRANCH, type GitHubReader, PIN_REFRESH_COMMAND, REPO } from "./upstream";

export type { MissingCommit } from "./compare-range";

const SHA_PATTERN = /^[a-f0-9]{40}$/i;

export type PublishPinState =
  | "RELEASE_PIN_CURRENT"
  | "RELEASE_PIN_BEHIND"
  | "RELEASE_PIN_UNCHECKED";

export const PUBLISH_PIN_EXIT_CODE: Record<PublishPinState, number> = {
  RELEASE_PIN_CURRENT: 0,
  RELEASE_PIN_BEHIND: 1,
  RELEASE_PIN_UNCHECKED: 2
};

/**
 * What the workflow must do about a verdict, as DATA rather than as a condition
 * spelled out in YAML.
 *
 * The gate's step originally signalled through `steps.publish_pin.outcome`, which
 * has two states and was being asked a three-state question, so "the pin is
 * stale" and "the check could not run" became one signal — wrong for whichever
 * half the workflow did not assume. The two decisions below are independent:
 *
 *   withhold   may this release publish?      NO for anything but a clean pass.
 *   verdict    whose problem is this?         Only `behind` is a deliberate
 *                                             refusal; `unchecked` is nobody
 *                                             having measured anything, and it
 *                                             must keep paging.
 */
export interface GateOutputs {
  /** `current` ships; `behind` and `unchecked` do not. */
  verdict: "current" | "behind" | "unchecked";
  /** True when the CLI release tag must not be pushed. */
  withhold: boolean;
}

export function gateOutputs(state: PublishPinState): GateOutputs {
  switch (state) {
    case "RELEASE_PIN_CURRENT":
      return { verdict: "current", withhold: false };
    case "RELEASE_PIN_BEHIND":
      return { verdict: "behind", withhold: true };
    case "RELEASE_PIN_UNCHECKED":
      // Withheld like a refusal — an unverified pin at publish time is the exact
      // state that shipped 1.3.0 — but NOT reported as one, so it still pages.
      return { verdict: "unchecked", withhold: true };
  }
}

export interface PublishPinVerdict {
  state: PublishPinState;
  /** Short machine-stable reason, distinct per cause so a log is greppable. */
  code: string;
  message: string;
  detail: string[];
  /**
   * Upstream commits the bundle does not carry and that COUNT against it. Empty on
   * a pass. On a pass with commits after the deadline, those are in `detail` and
   * in `notYetDue`, never here.
   */
  missing: MissingCommit[];
  /** Upstream commits the bundle does not carry, which landed after the deadline. */
  notYetDue: MissingCommit[];
}

function unchecked(code: string, message: string, detail: string[]): PublishPinVerdict {
  return { state: "RELEASE_PIN_UNCHECKED", code, message, detail, missing: [], notYetDue: [] };
}

function compareFailure(
  read: Exclude<Awaited<ReturnType<GitHubReader>>, { kind: "ok" }>,
  pin: string,
  other: string,
  otherLabel: string
): PublishPinVerdict {
  const why = read.kind === "transport" ? read.message : `${read.status} ${read.statusText}`;
  // A 404 here is not "no difference" — it is the pin not being an object this
  // repository holds at all, which is a worse state than being behind and must
  // not be allowed to fall through to a green.
  const notAnObject = read.kind === "http" && read.status === 404;
  return notAnObject
    ? unchecked(
        "PIN_NOT_IN_UPSTREAM",
        `${REPO} does not hold ${pin.slice(0, 10)}, so the bundle's own sha resolves to nothing there.`,
        [
          "A force-push, a deleted branch, or a bundle generated against a fork would each",
          "produce this. Whatever the cause, this artefact cannot say where its content is from."
        ]
      )
    : unchecked(
        "COMPARE_UNREADABLE",
        `The pin differs from ${otherLabel} (${other.slice(0, 10)}) but the compare failed (${why}).`,
        ["The gap is known to be non-zero and its contents are unknown."]
      );
}

/**
 * Read the branch head, then decide what the bundle misses as of the deadline.
 *
 * `pin` is the sha the ARTEFACT records about itself, never the lock file. Those
 * two agreeing is `check-skills-lock.ts`'s job and it runs on every pull request.
 *
 * `deadline` is null when no release could be identified — a local run with no
 * release ref. Then nothing is "not yet due": the bundle is judged against head,
 * by content, which is the strictest reading this gate has.
 */
export async function checkPublishPin(params: {
  pin: string;
  read: GitHubReader | null;
  deadline: ReleaseDeadline | null;
}): Promise<PublishPinVerdict> {
  const { pin, read, deadline } = params;

  if (!SHA_PATTERN.test(pin)) {
    return unchecked(
      "PIN_UNREADABLE",
      `The bundle's recorded sha is ${JSON.stringify(pin)}, which is not a 40-character sha.`,
      ["Nothing can be compared against it, so this release is unverified rather than clean."]
    );
  }

  if (read === null) {
    return unchecked(
      "NO_TOKEN",
      `No credential for ${REPO}, so the pin could not be compared to ${BRANCH}.`,
      [
        `Set the SKILLS_NEXUS_READ_TOKEN secret on this workflow. ${REPO} is private, and a`,
        "workflow's ambient GITHUB_TOKEN is scoped to this repository alone — it earns a 404",
        "there, which reads as a missing branch rather than a missing secret."
      ]
    );
  }

  const deadlineAt = deadline === null ? null : Date.parse(deadline.at);
  if (deadline !== null && (deadlineAt === null || Number.isNaN(deadlineAt))) {
    return unchecked("DEADLINE_UNREADABLE", `The release deadline ${deadline.at} is not a date.`, [
      "Without it nothing can be sorted into due and not-yet-due."
    ]);
  }
  const basis =
    deadline === null
      ? []
      : ["Deadline " + deadline.at + ":", ...deadline.basis.map((l) => "  " + l)];

  const head = await read(`/commits/${BRANCH}`);
  if (head.kind !== "ok") {
    const why = head.kind === "transport" ? head.message : `${head.status} ${head.statusText}`;
    return unchecked("HEAD_UNREADABLE", `Could not read ${REPO}@${BRANCH} (${why}).`, [
      "The pin may be current or may be a year stale; this run does not know which,",
      "and a release is not the moment to assume the harmless one."
    ]);
  }

  const headSha = (head.body as { sha?: unknown }).sha;
  if (typeof headSha !== "string" || !SHA_PATTERN.test(headSha)) {
    return unchecked("HEAD_UNPARSEABLE", `${REPO}@${BRANCH} answered 200 with no readable sha.`, [
      "A 200 that does not carry the field being read is not an answer."
    ]);
  }

  if (headSha.toLowerCase() === pin.toLowerCase()) {
    return {
      state: "RELEASE_PIN_CURRENT",
      code: "PIN_IS_HEAD",
      message: `The bundle pins ${pin.slice(0, 10)}, which is the head of ${REPO}@${BRANCH}.`,
      detail: ["Nothing merged upstream is missing from this release."],
      missing: [],
      notYetDue: []
    };
  }

  const toHead = await read(`/compare/${pin}...${headSha}`);
  if (toHead.kind !== "ok") return compareFailure(toHead, pin, headSha, BRANCH);
  const range = parseCompare(toHead.body);
  const allMissing = range.commits.map((c) => c.missing);

  // `behind_by > 0` with the pin as BASE means the pin carries commits the branch
  // does not — it is not simply behind, it is off `main`. Kept as its own code
  // because the remedy differs: refreshing the pin does not explain how a
  // published artefact came to be built from a ref nobody merged.
  if (range.behindBy > 0) {
    return {
      state: "RELEASE_PIN_BEHIND",
      code: "PIN_DIVERGED",
      message:
        `The bundle pins ${pin.slice(0, 10)}, which is NOT on ${REPO}@${BRANCH} ` +
        `(head ${headSha.slice(0, 10)}).`,
      detail: [
        `${range.behindBy} commit(s) under the pin are absent from ${BRANCH}, and ${allMissing.length} ` +
          `commit(s) on ${BRANCH} are absent from the pin:`,
        ...renderMissing(allMissing, range.totalCommits),
        "",
        "A release may not claim a branch it was not built from. Establish where this pin",
        "came from before shipping it."
      ],
      missing: allMissing,
      notYetDue: []
    };
  }

  if (allMissing.length === 0) {
    // The shas differ, the pin is not diverged, and nothing is listed. That is not
    // a pass — it is a compare this code could not read.
    return unchecked(
      "COMPARE_EMPTY",
      `The pin ${pin.slice(0, 10)} differs from ${BRANCH} head ${headSha.slice(0, 10)}, ` +
        "but the compare listed no commits.",
      ["Two different shas with nothing between them is not an answer this can act on."]
    );
  }

  if (range.paths === null) {
    return unchecked(
      "FILES_TRUNCATED",
      `${pin.slice(0, 10)}...${headSha.slice(0, 10)} changes ${COMPARE_FILES_LIMIT} or more files, ` +
        "the most GitHub lists inline.",
      ["Which of them ship cannot be read from a partial list, so nothing is claimed either way."]
    );
  }

  if (!range.paths.some(mayShip)) {
    return {
      state: "RELEASE_PIN_CURRENT",
      code: "PIN_CONTENT_IS_HEAD",
      message:
        `The bundle pins ${pin.slice(0, 10)}, ${allMissing.length} commit(s) behind ${BRANCH} ` +
        `(${headSha.slice(0, 10)}), and none of them changes a file an install writes.`,
      detail: [
        "Changed upstream since the pin, all outside the bundle:",
        ...range.paths.map((p) => `  ${p}`)
      ],
      missing: [],
      notYetDue: allMissing
    };
  }

  // debt: a range past 250 commits is not walked, it is refused as UNCHECKED.
  //       Upgrade trigger: a release refused RANGE_TRUNCATED — then page the
  //       compare (`?page=`) instead of reading its first response only.
  if (range.totalCommits > range.commits.length) {
    return unchecked(
      "RANGE_TRUNCATED",
      `The pin is ${range.totalCommits} commits behind ${BRANCH}; GitHub listed ${range.commits.length}.`,
      [
        "When each of them landed cannot be read from a partial list, so nothing is claimed.",
        ...renderMissing(allMissing, range.totalCommits)
      ]
    );
  }

  const cutoff = deadlineAt ?? Number.POSITIVE_INFINITY;
  const due = landedBy(range, headSha, cutoff);
  if (due === "broken") {
    return unchecked(
      "LANDING_UNREADABLE",
      `A commit on ${BRANCH}'s first-parent line carries no readable date.`,
      ["When it landed decides whether it is due; this run cannot say."]
    );
  }

  if (due === null) {
    return {
      state: "RELEASE_PIN_CURRENT",
      code: "PIN_CURRENT_AT_DEADLINE",
      message:
        `The bundle pins ${pin.slice(0, 10)}; every upstream commit it misses landed on ` +
        `${BRANCH} after this release's deadline.`,
      detail: [
        ...basis,
        "",
        "Landed after the deadline — NOT in this release, due in the next:",
        ...renderMissing(allMissing, range.totalCommits)
      ],
      missing: [],
      notYetDue: allMissing
    };
  }

  // Something had landed by the deadline. Whether it matters is a question about
  // CONTENT: the bundle against the newest commit that was due, by changed files.
  let duePaths = range.paths;
  let dueCommits = allMissing;
  if (due.sha.toLowerCase() !== headSha.toLowerCase()) {
    const toDue = await read(`/compare/${pin}...${due.sha}`);
    if (toDue.kind !== "ok") return compareFailure(toDue, pin, due.sha, "the deadline commit");
    const dueRange = parseCompare(toDue.body);
    if (dueRange.paths === null) {
      return unchecked(
        "FILES_TRUNCATED",
        `${pin.slice(0, 10)}...${due.sha.slice(0, 10)} changes ${COMPARE_FILES_LIMIT} or more files.`,
        ["Which of them ship cannot be read from a partial list, so nothing is claimed either way."]
      );
    }
    duePaths = dueRange.paths;
    dueCommits = dueRange.commits.map((c) => c.missing);
  }
  const dueShas = new Set(dueCommits.map((c) => c.sha));
  const notYetDue = allMissing.filter((c) => !dueShas.has(c.sha));
  const shipping = duePaths.filter(mayShip);

  if (shipping.length === 0) {
    return {
      state: "RELEASE_PIN_CURRENT",
      code: "PIN_CONTENT_CURRENT_AT_DEADLINE",
      message:
        `The bundle pins ${pin.slice(0, 10)}; what upstream had landed by this release's ` +
        "deadline changes no file an install writes.",
      detail: [
        ...basis,
        "",
        ...(notYetDue.length > 0
          ? [
              "Landed after the deadline — NOT in this release, due in the next:",
              ...renderMissing(notYetDue, notYetDue.length)
            ]
          : [])
      ],
      missing: [],
      notYetDue
    };
  }

  return {
    state: "RELEASE_PIN_BEHIND",
    code: "PIN_BEHIND_DEADLINE",
    message:
      `This release would publish skills pinned at ${pin.slice(0, 10)}, missing ` +
      `${dueCommits.length} upstream commit(s) that had landed on ${BRANCH} by its deadline` +
      (deadline === null ? "." : ` (${deadline.at}).`),
    detail: [
      ...basis,
      "",
      "Landed by the deadline and MISSING from the artefact this release would publish:",
      ...renderMissing(dueCommits, dueCommits.length),
      "",
      "Files they change under a root the bundle ships from (all of skills/ counts):",
      ...shipping.map((p) => `  ${p}`),
      ...(notYetDue.length > 0
        ? [
            "",
            `${notYetDue.length} more landed after the deadline and are not held against this release.`
          ]
        : []),
      "",
      "The deadline is fixed once the release has merged, so ONE refresh that reaches main",
      "satisfies it, however far upstream moves meanwhile. Refresh the bundle:",
      `  ${PIN_REFRESH_COMMAND}`,
      "  git add packages/cli/skills-nexus.lock packages/cli/src/skills-content.generated.*",
      "",
      "A pin bump ships enforcement, not only prose — review the list above before taking it."
    ],
    missing: dueCommits,
    notYetDue
  };
}
