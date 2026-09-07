/**
 * The release-moment question: is the skills pin the shipped bundle records the
 * HEAD of the repository that bundle claims to come from, right now?
 *
 * ## Why this exists beside `verdict.ts` rather than inside it
 *
 * `verdict.ts` answers "has anybody looked at this lately", and it is right to
 * answer on AGE with a review window: between releases, being some commits
 * behind is the intended state, because bumping the pin ships enforcement and is
 * a reviewed act. Nothing about that argument survives contact with a publish.
 * A release is the instant the pin stops being a reviewable position in this
 * repository and becomes a fact inside an artefact on npm, installed by people
 * who cannot see the pin at all and will not get a corrected one until somebody
 * cuts another version. There is no review window on a tarball.
 *
 * So the two checks measure the same distance and are not the same check:
 *
 *   verdict.ts      schedule    tolerant   "is anyone watching the drift?"
 *   publish-pin.ts  release     zero       "is this artefact about to freeze it?"
 *
 * ## The measurement that produced it
 *
 * `@agent-nexus/cli@1.3.0` was published 2026-09-05T15:36:49Z carrying pin
 * `61fb85d2dd`. `NexusGPT/claude-code-skills-nexus@main` was `ec5acadf30` at
 * that instant — eight commits further on, the third of which is
 * `3edc3d3da9 fix(hooks): re-land W69 — a stale branch put both enforcers back
 * to one root`, merged as PR #45 twenty-three hours and forty minutes before the
 * publish. A fix that had been on upstream's default branch for a full day did
 * not reach a single user, and nothing anywhere refused the release.
 *
 * It was not a race. That is the load-bearing part: a gate asking this question
 * at publish time had a day of slack to catch it in.
 *
 * ## The refusal NAMES the commits, because a refusal that does not is a hunt
 *
 * `verdict.ts` reports `ahead_by` — a number. At the moment somebody is trying
 * to ship, a number sends them to the GitHub compare view to find out whether
 * the gap is eight doc commits or an enforcement fix, which is precisely the
 * investigation a gate is supposed to replace. So this one reads
 * `compare.commits[]` and prints every missing commit with its date, its
 * subject, and its pull-request number where the message carries one.
 *
 * ## Three states, and UNCHECKED is not a softer pass
 *
 *   RELEASE_PIN_CURRENT     the pin is the branch head — ship
 *   RELEASE_PIN_BEHIND      named commits are missing, or the pin is off-branch
 *   RELEASE_PIN_UNCHECKED   no credential, or the read did not answer
 *
 * UNCHECKED refuses. An unverified pin at publish time is the exact state that
 * shipped 1.3.0; a tick over it would reproduce the defect while claiming the
 * opposite.
 */

import { BRANCH, type GitHubReader, REPO } from "./upstream";

const SHA_PATTERN = /^[a-f0-9]{40}$/i;

/**
 * GitHub's compare endpoint returns at most 250 commits inline while reporting
 * the true count in `total_commits`. A pin far enough behind to overflow that
 * would otherwise print a confident list that is quietly incomplete — the same
 * shape as an instrument with no field for the bad news. The overflow is stated
 * rather than paged, because at 250 commits behind the remedy is identical and
 * the list has already made its point.
 */
const COMPARE_INLINE_LIMIT = 250;

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
 * ## Why this exists at all
 *
 * The gate's step originally signalled through `steps.publish_pin.outcome`,
 * which has two states — success or failure — and was being asked a three-state
 * question. Everything that was not a clean pass collapsed into one bucket, so
 * "the pin is stale" and "the check could not run" became the same signal, and
 * whichever meaning the workflow assigned was wrong for the other half.
 *
 * That collapse cost twice in one change, in opposite directions. First a
 * deliberate refusal read as a broken sync and paged as an outage. Then the fix
 * for that read every failure as a deliberate refusal and SUPPRESSED the page —
 * so a tooling failure, which used to page spuriously, would not page at all.
 * The second direction is the worse one: an alarm that fails silent is not an
 * alarm.
 *
 * ## The two decisions are independent, which is the whole point
 *
 *   withhold   may this release publish?      NO for anything but a clean pass.
 *   verdict    whose problem is this?         Only `behind` is a deliberate
 *                                             refusal; `unchecked` is nobody
 *                                             having measured anything, and it
 *                                             must keep paging.
 *
 * Collapsing them back into one boolean re-creates the defect, in whichever
 * direction the boolean happens to lean.
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
      // state that shipped 1.3.0 — but NOT reported as one. The alarm arms
      // `release_refused` on `behind` alone, so this still pages.
      return { verdict: "unchecked", withhold: true };
  }
}

export interface MissingCommit {
  sha: string;
  date: string;
  subject: string;
  /** Pull-request number when the message is a merge commit; `null` otherwise. */
  pr: number | null;
}

export interface PublishPinVerdict {
  state: PublishPinState;
  /** Short machine-stable reason, distinct per cause so a log is greppable. */
  code: string;
  message: string;
  detail: string[];
  missing: MissingCommit[];
}

/** `Merge pull request #45 from …` — upstream's merge-commit spelling. */
const MERGE_PR_PATTERN = /^Merge pull request #(\d+) /;

function toMissingCommit(entry: unknown): MissingCommit | null {
  if (typeof entry !== "object" || entry === null) return null;
  const sha = (entry as { sha?: unknown }).sha;
  if (typeof sha !== "string" || sha === "") return null;

  const commit = (entry as { commit?: unknown }).commit;
  const committer =
    typeof commit === "object" && commit !== null
      ? (commit as { committer?: unknown }).committer
      : undefined;
  const rawDate =
    typeof committer === "object" && committer !== null
      ? (committer as { date?: unknown }).date
      : undefined;
  const rawMessage =
    typeof commit === "object" && commit !== null
      ? (commit as { message?: unknown }).message
      : undefined;

  const message = typeof rawMessage === "string" ? rawMessage : "";
  const subject = message.split("\n")[0] ?? "";
  const prMatch = MERGE_PR_PATTERN.exec(subject);

  return {
    sha,
    // An entry missing its date is reported as unknown rather than dropped: the
    // commit is still missing from the pin, and losing it to keep the row tidy
    // would shrink the very list this check exists to print.
    date: typeof rawDate === "string" && rawDate !== "" ? rawDate : "(date unavailable)",
    subject: subject === "" ? "(no subject)" : subject,
    pr: prMatch === null ? null : Number(prMatch[1])
  };
}

function renderMissing(missing: MissingCommit[], totalCommits: number): string[] {
  const lines = missing.map((c) => {
    const pr = c.pr === null ? "" : ` (#${c.pr})`;
    return `  ${c.sha.slice(0, 10)}  ${c.date}  ${c.subject}${pr}`;
  });
  if (totalCommits > missing.length) {
    lines.push(
      `  … and ${totalCommits - missing.length} more not listed: the compare endpoint ` +
        `returns at most ${COMPARE_INLINE_LIMIT} commits inline.`
    );
  }
  return lines;
}

/**
 * Read the branch head, then everything between it and the pin.
 *
 * `pin` is the sha the ARTEFACT records about itself, never the lock file. Those
 * two agreeing is `check-skills-lock.ts`'s job and it runs on every pull
 * request; reading the lock here would make this check's subject a file that
 * merely declares intent rather than the bytes about to reach a user.
 */
export async function checkPublishPin(params: {
  pin: string;
  read: GitHubReader | null;
}): Promise<PublishPinVerdict> {
  const { pin, read } = params;

  if (!SHA_PATTERN.test(pin)) {
    return {
      state: "RELEASE_PIN_UNCHECKED",
      code: "PIN_UNREADABLE",
      message: `The bundle's recorded sha is ${JSON.stringify(pin)}, which is not a 40-character sha.`,
      detail: [
        "Nothing can be compared against it, so this release is unverified rather than clean."
      ],
      missing: []
    };
  }

  if (read === null) {
    return {
      state: "RELEASE_PIN_UNCHECKED",
      code: "NO_TOKEN",
      message: `No credential for ${REPO}, so the pin could not be compared to ${BRANCH}.`,
      detail: [
        `Set the SKILLS_NEXUS_READ_TOKEN secret on this workflow. ${REPO} is private, and a`,
        "workflow's ambient GITHUB_TOKEN is scoped to this repository alone — it earns a 404",
        "there, which reads as a missing branch rather than a missing secret."
      ],
      missing: []
    };
  }

  const head = await read(`/commits/${BRANCH}`);
  if (head.kind !== "ok") {
    const why = head.kind === "transport" ? head.message : `${head.status} ${head.statusText}`;
    return {
      state: "RELEASE_PIN_UNCHECKED",
      code: "HEAD_UNREADABLE",
      message: `Could not read ${REPO}@${BRANCH} (${why}).`,
      detail: [
        "The pin may be current or may be a year stale; this run does not know which,",
        "and a release is not the moment to assume the harmless one."
      ],
      missing: []
    };
  }

  const headSha = (head.body as { sha?: unknown }).sha;
  if (typeof headSha !== "string" || !SHA_PATTERN.test(headSha)) {
    return {
      state: "RELEASE_PIN_UNCHECKED",
      code: "HEAD_UNPARSEABLE",
      message: `${REPO}@${BRANCH} answered 200 with no readable sha.`,
      detail: ["A 200 that does not carry the field being read is not an answer."],
      missing: []
    };
  }

  if (headSha.toLowerCase() === pin.toLowerCase()) {
    return {
      state: "RELEASE_PIN_CURRENT",
      code: "PIN_IS_HEAD",
      message: `The bundle pins ${pin.slice(0, 10)}, which is the head of ${REPO}@${BRANCH}.`,
      detail: ["Nothing merged upstream is missing from this release."],
      missing: []
    };
  }

  const compared = await read(`/compare/${pin}...${headSha}`);
  if (compared.kind !== "ok") {
    const why =
      compared.kind === "transport"
        ? compared.message
        : `${compared.status} ${compared.statusText}`;
    // A 404 here is not "no difference" — it is the pin not being an object this
    // repository holds at all, which is a worse state than being behind and must
    // not be allowed to fall through to a green.
    const notAnObject = compared.kind === "http" && compared.status === 404;
    return {
      state: "RELEASE_PIN_UNCHECKED",
      code: notAnObject ? "PIN_NOT_IN_UPSTREAM" : "COMPARE_UNREADABLE",
      message: notAnObject
        ? `${REPO} does not hold ${pin.slice(0, 10)}, so the bundle's own sha resolves to nothing there.`
        : `The pin differs from ${BRANCH} (${headSha.slice(0, 10)}) but the compare failed (${why}).`,
      detail: notAnObject
        ? [
            "A force-push, a deleted branch, or a bundle generated against a fork would each",
            "produce this. Whatever the cause, this artefact cannot say where its content is from."
          ]
        : ["The gap is known to be non-zero and its contents are unknown."],
      missing: []
    };
  }

  const body = compared.body as {
    status?: unknown;
    ahead_by?: unknown;
    behind_by?: unknown;
    total_commits?: unknown;
    commits?: unknown;
  };
  const behindBy = typeof body.behind_by === "number" ? body.behind_by : 0;
  const totalCommits = typeof body.total_commits === "number" ? body.total_commits : 0;
  const rawCommits = Array.isArray(body.commits) ? body.commits : [];
  const missing = rawCommits.map(toMissingCommit).filter((c): c is MissingCommit => c !== null);

  // `behind_by > 0` with the pin as BASE means the pin carries commits the branch
  // does not — it is not simply behind, it is off `main`. Kept as its own code
  // because the remedy differs: refreshing the pin does not explain how a
  // published artefact came to be built from a ref nobody merged.
  if (behindBy > 0) {
    return {
      state: "RELEASE_PIN_BEHIND",
      code: "PIN_DIVERGED",
      message:
        `The bundle pins ${pin.slice(0, 10)}, which is NOT on ${REPO}@${BRANCH} ` +
        `(head ${headSha.slice(0, 10)}).`,
      detail: [
        `${behindBy} commit(s) under the pin are absent from ${BRANCH}, and ${missing.length} ` +
          `commit(s) on ${BRANCH} are absent from the pin:`,
        ...renderMissing(missing, totalCommits),
        "",
        "A release may not claim a branch it was not built from. Establish where this pin",
        "came from before shipping it."
      ],
      missing
    };
  }

  if (missing.length === 0) {
    // The shas differ, the pin is not diverged, and nothing is listed. That is not
    // a pass — it is a compare this code could not read, and saying so is the
    // whole point of having three states.
    return {
      state: "RELEASE_PIN_UNCHECKED",
      code: "COMPARE_EMPTY",
      message:
        `The pin ${pin.slice(0, 10)} differs from ${BRANCH} head ${headSha.slice(0, 10)}, ` +
        "but the compare listed no commits.",
      detail: ["Two different shas with nothing between them is not an answer this can act on."],
      missing: []
    };
  }

  return {
    state: "RELEASE_PIN_BEHIND",
    code: "PIN_BEHIND_HEAD",
    message:
      `This release would publish skills pinned at ${pin.slice(0, 10)} while ` +
      `${REPO}@${BRANCH} is at ${headSha.slice(0, 10)} — ${totalCommits} commit(s) ahead.`,
    detail: [
      "Merged upstream and MISSING from the artefact this release would publish:",
      ...renderMissing(missing, totalCommits),
      "",
      "Every one of these is already merged. Publishing now freezes their absence into a",
      "tarball that users cannot correct, and the next release is the earliest they can",
      "reach anyone.",
      "",
      "Refresh the bundle and re-cut the release:",
      "  GITHUB_TOKEN=$(gh auth token) pnpm --filter @agent-nexus/cli run gen:skills",
      "  git add packages/cli/skills-nexus.lock packages/cli/src/skills-content.generated.*",
      "",
      "A pin bump ships enforcement, not only prose — review the list above before taking it."
    ],
    missing
  };
}
