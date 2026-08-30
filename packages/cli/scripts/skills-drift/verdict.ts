/**
 * The comparison, and nothing else: given a pin and a way to read upstream,
 * decide which of the THREE states this is.
 *
 * Three outcomes, never two, because the defect this whole gate closes is an
 * absence that read as a green. A check that cannot perform its check must not
 * report success:
 *
 *   CURRENT       exit 0   in sync, or behind inside the review window
 *   DRIFT         exit 1   behind past the window, or pinned off `main`
 *   CANNOT_CHECK  exit 2   no credential, or the read did not answer
 *
 * Every function here is TOTAL — a shape it does not recognise becomes a state,
 * never a throw. A crash would exit 1 and be indistinguishable from DRIFT.
 */

import fs from "node:fs";
import path from "node:path";

import { BRANCH, type GitHubReader, REPO } from "./upstream";

const SHA_PATTERN = /^[a-f0-9]{40}$/i;

/**
 * How far behind upstream the pin may fall before this goes red.
 *
 * Measured between the PINNED commit and the UPSTREAM TIP, never against the
 * wall clock: if upstream goes quiet for a month, `now - pinned` grows while the
 * real distance is zero, and a check that reddens because nothing happened
 * upstream is measuring the wrong thing.
 *
 * A THRESHOLD IS INHERENT TO AGE, not an escape from it. The metric is "nobody
 * has looked at this in N days", so N is the metric's definition. This is not a
 * snooze: a snooze suppresses a signal that has already fired, where this is
 * where the signal fires. Being some commits behind is the INTENDED state —
 * the bundle carries hooks/, agents/ and settings.json, so a bump ships
 * enforcement and is a reviewed act. A green run still prints the distance, so
 * the number is on screen every run rather than only once it is too late.
 *
 * debt: 14 days is a judgement, not a measurement. Nobody has yet observed how
 *       long a healthy bump cycle actually takes on this bundle, because until
 *       this gate existed nothing recorded when the pin moved.
 *       Ceiling: it only distinguishes "reviewed recently" from "unattended".
 *       It says nothing about whether the CONTENT of those commits matters, so
 *       an urgent upstream correction inside the window is still invisible.
 *       Upgrade trigger: once this gate has run for a few cycles, set it from
 *       the observed interval between real bumps rather than from judgement —
 *       or, if an urgent correction is ever missed inside the window, replace
 *       age with a signal upstream controls (a tag, a severity marker).
 */
export const DEFAULT_MAX_AGE_DAYS = 14;

export interface Verdict {
  /** CURRENT · DRIFT · CANNOT_CHECK. Maps to the exit code. */
  state: "CURRENT" | "DRIFT" | "CANNOT_CHECK";
  /** Stable identifier, so the self-test asserts on the CAUSE, not on prose. */
  code: string;
  message: string;
  /** Extra lines for the step summary. Never load-bearing for the verdict. */
  detail: string[];
}

export const EXIT_CODE: Record<Verdict["state"], number> = {
  CURRENT: 0,
  DRIFT: 1,
  CANNOT_CHECK: 2
};

// ── the comparison ───────────────────────────────────────────────────────────

/**
 * Ask whether the pin is current, and answer in one of exactly three states.
 *
 * `read` is `null` when no credential resolved. That is modelled as a value
 * rather than thrown, because "there is no token" is a VERDICT this check has to
 * be able to return, not an error that aborts it into an ambiguous exit code.
 */
export async function detectDrift(params: {
  cliRoot: string;
  read: GitHubReader | null;
  maxAgeDays?: number;
}): Promise<Verdict> {
  const { cliRoot, read } = params;
  const maxAgeDays = params.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;

  // ── the pin ────────────────────────────────────────────────────────────────
  //
  // `check-skills-lock.ts` already refuses both of these on every pull request,
  // so reaching them here means something got past that gate. They are still
  // CANNOT_CHECK rather than DRIFT: with no valid pin there is no comparison to
  // make, and reporting a drift verdict we did not compute would be the exact
  // dishonesty this file exists to prevent.
  const lockPath = path.join(cliRoot, "skills-nexus.lock");
  if (!fs.existsSync(lockPath)) {
    return {
      state: "CANNOT_CHECK",
      code: "LOCK_MISSING",
      message: `${lockPath} does not exist, so there is no pin to compare.`,
      detail: []
    };
  }
  const pinned = fs.readFileSync(lockPath, "utf-8").trim();
  if (!SHA_PATTERN.test(pinned)) {
    return {
      state: "CANNOT_CHECK",
      code: "LOCK_MALFORMED",
      message: `skills-nexus.lock holds ${JSON.stringify(pinned)}, not a 40-character commit SHA.`,
      detail: []
    };
  }

  // ── the credential ─────────────────────────────────────────────────────────
  if (read === null) {
    return {
      state: "CANNOT_CHECK",
      code: "NO_TOKEN",
      message:
        `No credential can read ${REPO}, so whether ${pinned.slice(0, 12)} is current is ` +
        `UNKNOWN — not fine.`,
      detail: tokenRemedy()
    };
  }

  // ── upstream's tip ─────────────────────────────────────────────────────────
  const head = await read(`/commits/${BRANCH}`);
  if (head.kind === "transport") {
    return {
      state: "CANNOT_CHECK",
      code: "UPSTREAM_UNREACHABLE",
      message: `Could not reach the GitHub API for ${REPO}: ${head.message}`,
      detail: []
    };
  }
  if (head.kind === "http") {
    // 404 is the shape an under-scoped token gets on a PRIVATE repository —
    // GitHub hides existence rather than admitting a permission failure — so it
    // is reported as "cannot read", never as "the repository is gone".
    if (head.status === 404) {
      return {
        state: "CANNOT_CHECK",
        code: "UPSTREAM_NOT_FOUND",
        message:
          `${REPO} answered 404. On a PRIVATE repository that is what an under-scoped ` +
          `token gets — GitHub hides existence rather than reporting a permission failure — ` +
          `so this is "the credential cannot read it", not "the repository is gone".`,
        detail: tokenRemedy()
      };
    }
    if (head.status === 401 || head.status === 403) {
      return {
        state: "CANNOT_CHECK",
        code: "UPSTREAM_UNAUTHORIZED",
        message:
          `${REPO} answered ${head.status} ${head.statusText}. The credential is expired, ` +
          `revoked, or rate-limited.`,
        detail: tokenRemedy()
      };
    }
    return {
      state: "CANNOT_CHECK",
      code: "UPSTREAM_UNREACHABLE",
      message: `${REPO} answered ${head.status} ${head.statusText}.`,
      detail: []
    };
  }

  const upstream = readCommit(head.body);
  if (upstream === null) {
    return {
      state: "CANNOT_CHECK",
      code: "UPSTREAM_UNREADABLE",
      message:
        `${REPO}@${BRANCH} answered 200 with no readable commit sha. The API shape changed, ` +
        `or a proxy answered instead of GitHub.`,
      detail: []
    };
  }

  // From here on, `upstream.sha` is the comparison target — never the NAME
  // `main`. The branch is resolved to a sha ONCE, above, and every later call
  // and every message uses that sha, so one run is internally consistent even
  // if upstream moves while the run is in flight.
  const pair = [
    `pinned   ${pinned}`,
    `upstream ${upstream.sha}  (${REPO}@${BRANCH} when resolved)`
  ];

  if (upstream.sha.toLowerCase() === pinned.toLowerCase()) {
    return {
      state: "CURRENT",
      code: "IN_SYNC",
      message:
        `skills-nexus.lock pins ${pinned.slice(0, 12)} and ${REPO}@${BRANCH} resolved to ` +
        `${upstream.sha.slice(0, 12)} — identical.`,
      detail: pair
    };
  }

  // ── how far behind, and for how long ───────────────────────────────────────
  //
  // The pin and the tip already DISAGREE — that fact is established by a read
  // that succeeded, and nothing below may take it away. A failure here degrades
  // the DETAIL, never the VERDICT: dropping to CANNOT_CHECK because a
  // second, decorative call failed would discard a finding already in hand.
  const compared = await read(`/compare/${pinned}...${upstream.sha}`);

  if (compared.kind === "http" && compared.status === 404) {
    // The read above proved this credential can see the repository, so a 404
    // HERE is a fact about the OBJECT, not about the token. The pinned commit
    // is not reachable upstream — force-pushed away, or on a deleted branch —
    // which means the committed bundle was built from history that no longer
    // exists.
    return {
      state: "DRIFT",
      code: "LOCK_UNREACHABLE_UPSTREAM",
      message:
        `skills-nexus.lock pins ${pinned.slice(0, 12)}, which ${REPO} cannot resolve, ` +
        `while ${BRANCH} is at ${upstream.sha.slice(0, 12)}. The tip read succeeded with ` +
        `this same credential, so this is the COMMIT being unreachable, not the token: ` +
        `the pinned commit was force-pushed away or lived on a deleted branch.`,
      detail: [
        `The committed bundle was built from history that no longer exists upstream.`,
        ...pair
      ]
    };
  }

  if (compared.kind !== "ok") {
    const why =
      compared.kind === "transport"
        ? compared.message
        : `${compared.status} ${compared.statusText}`;
    return {
      state: "DRIFT",
      code: "LOCK_BEHIND_UNMEASURED",
      message:
        `skills-nexus.lock pins ${pinned.slice(0, 12)} but ${REPO}@${BRANCH} is at ` +
        `${upstream.sha.slice(0, 12)}. They disagree — that much is measured. How far ` +
        `could not be: the compare call failed (${why}), so the review window could not ` +
        `be applied and this fails closed.`,
      detail: [...pair, ...bumpRemedy()]
    };
  }

  const comparison = readComparison(compared.body);
  if (comparison === null) {
    return {
      state: "DRIFT",
      code: "LOCK_BEHIND_UNMEASURED",
      message:
        `skills-nexus.lock pins ${pinned.slice(0, 12)} but ${REPO}@${BRANCH} is at ` +
        `${upstream.sha.slice(0, 12)}. The compare call answered 200 with no readable ` +
        `status, so the distance is unknown and this fails closed.`,
      detail: [...pair, ...bumpRemedy()]
    };
  }

  // `status` describes HEAD relative to BASE, and BASE is the pin. So `ahead`
  // means UPSTREAM has moved on and the LOCK IS BEHIND — the ordinary case, and
  // the one place a reversed reading would print a confident wrong number.
  if (comparison.status === "behind" || comparison.status === "diverged") {
    return {
      state: "DRIFT",
      code: "LOCK_DIVERGED",
      message:
        `skills-nexus.lock pins ${pinned.slice(0, 12)}, which is NOT an ancestor of ` +
        `${REPO}@${BRANCH} (${upstream.sha.slice(0, 12)}) — the compare reports ` +
        `"${comparison.status}". The bundle was built from a commit that is not on ` +
        `${BRANCH}.`,
      detail: [
        // Both numbers name their DIRECTION, because the two fields are trivial
        // to swap and a swapped label reads as a confident measurement. Verified
        // against the live API rather than from memory: for `BASE...HEAD` with
        // BASE the pin and HEAD the branch, `ahead_by` counts commits the BRANCH
        // has that the pin lacks, and `behind_by` counts commits the PIN has
        // that the branch lacks. This message had them the wrong way round until
        // a control against the real repository printed the pair backwards.
        `${comparison.aheadBy} commit(s) on ${BRANCH} are absent from the pin ` +
          `(ahead_by); ${comparison.behindBy} commit(s) under the pin are absent ` +
          `from ${BRANCH} (behind_by).`,
        // The likely CAUSE, because this verdict is otherwise a puzzle. Both
        // readings are offered rather than one asserted — the compare cannot
        // distinguish them, and guessing would be the confident-wrong-answer
        // failure this file already had once.
        `A pin that is not an ancestor of ${BRANCH} was taken from something that is not ` +
          `${BRANCH}: most often a pull-request head. Where upstream SQUASH-merges, those ` +
          `commits never appear on ${BRANCH} at all, so such a pin stays diverged forever ` +
          `and no bump-when-behind check would ever surface it. The other reading is that ` +
          `${BRANCH} was rewritten under the pin.`,
        ...pair,
        ...bumpRemedy()
      ]
    };
  }

  const ageDays = ageInDays(comparison.baseDate, upstream.date);
  // Both SHAs, in the message itself. Two runs minutes apart legitimately
  // disagree — upstream moved twice during the session that wrote this file —
  // and without the target named, "the number changed" is indistinguishable
  // from "the detector is broken". Naming it makes a re-run comparable.
  const distance =
    `${pinned.slice(0, 12)} → ${upstream.sha.slice(0, 12)}: ` +
    `${comparison.aheadBy} commit(s) behind` +
    (ageDays === null ? "" : `, spanning ${ageDays} day(s) of upstream history`);

  if (ageDays !== null && ageDays <= maxAgeDays) {
    return {
      state: "CURRENT",
      code: "WITHIN_WINDOW",
      message:
        `skills-nexus.lock ${distance} — inside the ${maxAgeDays}-day review window. ` +
        `A pin behind by design is the intended state; this is the number to watch, not a fault.`,
      detail: [...pair, ...bumpRemedy()]
    };
  }

  // No date to measure with is not permission to pass. Fail closed.
  if (ageDays === null) {
    return {
      state: "DRIFT",
      code: "LOCK_BEHIND_UNMEASURED",
      message:
        `skills-nexus.lock is ${comparison.aheadBy} commit(s) behind ${REPO}@${BRANCH}, ` +
        `but neither commit carried a readable date, so the ${maxAgeDays}-day window could ` +
        `not be applied. This fails closed rather than passing unmeasured.`,
      detail: [...pair, ...bumpRemedy()]
    };
  }

  return {
    state: "DRIFT",
    code: "LOCK_BEHIND",
    message:
      `skills-nexus.lock ${distance}, past the ${maxAgeDays}-day review window. ` +
      `Every agent this CLI installs is being taught the state of ${REPO} as of ` +
      `${comparison.baseDate ?? "an unknown date"}.`,
    detail: [...pair, ...bumpRemedy()]
  };
}

function tokenRemedy(): string[] {
  return [
    `This job needs a credential that can READ the private ${REPO}.`,
    `Repository secret: SKILLS_NEXUS_READ_TOKEN`,
    `Scope, and nothing beyond it: a fine-grained PAT whose repository access is`,
    `  ${REPO} alone, with Repository permissions -> Contents: Read-only.`,
    `  (Metadata: Read-only is mandatory and GitHub adds it automatically.)`,
    `Equivalently, a GitHub App installed on that repository with Contents: Read,`,
    `minted per-run via actions/create-github-app-token.`,
    `No write permission of any kind is required — this check only reads.`
  ];
}

function bumpRemedy(): string[] {
  return [
    `To refresh (a REVIEWED act — the bundle carries hooks/, agents/ and settings.json,`,
    `so a bump ships enforcement, not just prose):`,
    `  GITHUB_TOKEN=$(gh auth token) pnpm --filter @agent-nexus/cli run gen:skills`,
    `then commit skills-nexus.lock together with BOTH generated files.`
  ];
}

// ── parsing, kept total so a shape change is a state and never a crash ───────

function readCommit(body: unknown): { sha: string; date: string | null } | null {
  if (typeof body !== "object" || body === null) return null;
  const sha = (body as { sha?: unknown }).sha;
  if (typeof sha !== "string" || !SHA_PATTERN.test(sha)) return null;
  return { sha, date: readCommitDate(body) };
}

function readCommitDate(commit: unknown): string | null {
  if (typeof commit !== "object" || commit === null) return null;
  const inner = (commit as { commit?: unknown }).commit;
  if (typeof inner !== "object" || inner === null) return null;
  const committer = (inner as { committer?: unknown }).committer;
  if (typeof committer !== "object" || committer === null) return null;
  const date = (committer as { date?: unknown }).date;
  return typeof date === "string" ? date : null;
}

interface Comparison {
  status: string;
  aheadBy: number;
  behindBy: number;
  baseDate: string | null;
}

function readComparison(body: unknown): Comparison | null {
  if (typeof body !== "object" || body === null) return null;
  const status = (body as { status?: unknown }).status;
  if (typeof status !== "string") return null;
  const aheadBy = (body as { ahead_by?: unknown }).ahead_by;
  const behindBy = (body as { behind_by?: unknown }).behind_by;
  return {
    status,
    aheadBy: typeof aheadBy === "number" ? aheadBy : 0,
    behindBy: typeof behindBy === "number" ? behindBy : 0,
    baseDate: readCommitDate((body as { base_commit?: unknown }).base_commit)
  };
}

/**
 * Whole days between the pinned commit and the upstream tip.
 *
 * Deliberately NOT `now - pinned`: upstream going quiet would inflate that
 * while the real distance is zero, and a check that reddens because nothing
 * happened upstream is measuring the wrong thing.
 */
function ageInDays(baseDate: string | null, headDate: string | null): number | null {
  if (baseDate === null || headDate === null) return null;
  const base = Date.parse(baseDate);
  const head = Date.parse(headDate);
  if (Number.isNaN(base) || Number.isNaN(head)) return null;
  return Math.max(0, Math.floor((head - base) / 86_400_000));
}
