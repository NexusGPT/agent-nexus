/**
 * `nexus vibe deploy-state` — "did my push land, and is what I pushed what is
 * live", answered by the platform in one call.
 *
 * ── Why a CLI verb, when the endpoint already exists ────────────────────────
 *
 * The endpoint was built because a client parsing `git push` stdout cannot
 * classify its own push: rejection lines print FIRST (so a pipe through `tail`
 * destroys them), `-q` suppresses the success report but not the failure one, a
 * backgrounded push carries no outcome at all, and an error quoting a remote URL
 * is shape-identical to a success report. The measured consequence was failures
 * read as successes.
 *
 * Shipping the endpoint with no verb reproduces that defect one layer up: an
 * answer nobody can reach is not an answer. A client that cannot find this
 * writes the parser again.
 *
 * ── The two things this renderer exists to get right ────────────────────────
 *
 * 1. `served` IS AN OBSERVATION, AND ITS AGE IS PART OF THE ANSWER. Nothing
 *    re-checks the row after the probe writes it, so a rollback or a newer
 *    deploy since `provenAt` is not reflected. Every line that mentions
 *    `served` carries how old it is — see {@link formatServedLines}.
 *
 * 2. `live.servedProvenAt === null` MUST NEVER RENDER AS "NOT SERVING", AND
 *    THE NULL CAN BE PERMANENT. The proof sweep only considers a deployment
 *    whose healthy row is inside its window, so a swap slower than that — or an
 *    app the probe cannot reach at all — stays unproven forever while serving
 *    perfectly well. The words are "not proven", and the reason is printed
 *    beside them, because "not proven" on its own is the same trap with a
 *    politer label.
 *
 * Rendering is pure and separated from the HTTP call so both can be asserted
 * without a network — the command wiring lives in `vibe.ts`.
 */

import { color } from "../output";
import { nonBlankOr } from "../util/present-text";
import type {
  GetDeployStateResponse,
  VibeDeployStateOutcome,
  VibeLiveDeploymentDto,
  VibeServedArtifactDto
} from "../vibe-wire-types";

/**
 * Expand a bare branch name to the fully-qualified ref the contract requires.
 *
 * `--ref main` is what a person types and `refs/heads/main` is what the schema
 * accepts, so without this the ordinary invocation is refused by a Zod message
 * about a regex — which is precisely the class of "the platform knows and will
 * not say" defect this command exists to close.
 *
 * Anything already qualified is passed through untouched, which is also how a
 * TAG is reached: `refs/tags/v1.0`. A bare name is assumed to be a branch,
 * because a bare name is a branch in every other git command a caller has just
 * run.
 */
export function qualifyRefName(ref: string): string {
  const trimmed = ref.trim();
  return trimmed.startsWith("refs/") ? trimmed : `refs/heads/${trimmed}`;
}

/**
 * The one-line meaning of the discriminator.
 *
 * The value alone reproduces the original complaint at a smaller scale: the
 * caller learns a word and still not what happened to their push. Each string
 * below says what the platform observed, and — where there is one — what to do.
 */
export function describeOutcome(outcome: VibeDeployStateOutcome): string {
  switch (outcome) {
    case "DEPLOYED":
      return `${color.green("DEPLOYED")} ${color.dim("— a deployment exists for this commit; read its status below")}`;
    case "RECEIVED_NOT_DEPLOYED":
      // Deliberately NOT red. The push landed; this is a configuration answer,
      // and colouring it as a failure sends people hunting a push problem that
      // does not exist.
      return `${color.yellow("RECEIVED_NOT_DEPLOYED")} ${color.dim("— the push LANDED and nothing deployed it. Usually: not the app's deploy branch, no app attached to the repo, or deploys refused (a suspended org).")}`;
    case "NOT_RECEIVED":
      return `${color.red("NOT_RECEIVED")} ${color.dim("— no ref on this repo has this commit as its head. Read as 'the platform cannot see it', not 'it was rejected': ref rows record HEADS, so a commit that landed and was then pushed past also reads this way.")}`;
    case "REF_UNKNOWN":
      return `${color.red("REF_UNKNOWN")} ${color.dim("— that ref does not exist on this repo at all; nothing has ever been pushed to it")}`;
    case "NO_REPOSITORY":
      return `${color.red("NO_REPOSITORY")} ${color.dim("— the app has no git project attached, so there is nothing to have received a push. Fix: nexus vibe app attach-repo")}`;
    default:
      // Unreachable per the union, reachable at runtime: a published binary
      // routinely talks to a backend newer than itself, and a value this CLI
      // has never heard of must still print rather than vanish.
      return `${String(outcome)} ${color.dim("— outcome not known to this CLI version; upgrade with: npm i -g @agent-nexus/cli")}`;
  }
}

/**
 * A coarse age, for a timestamp whose PRECISION does not matter but whose
 * STALENESS does. "3m ago" is the fact a reader needs about an observation;
 * "3m 41s ago" invites them to trust it more than they should.
 *
 * A negative span (clock skew between this machine and the platform) renders as
 * "just now" rather than as a negative number — the alternative reads as a
 * corrupted answer when it is a corrupted clock.
 */
export function formatAge(ms: number): string {
  if (ms < 0) return "just now";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${String(seconds)}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${String(hours)}h ago`;
  return `${String(Math.floor(hours / 24))}d ago`;
}

/** `2026-08-04 06:40:11Z` — the same shape the rest of `vibe` prints. */
function formatInstant(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, "Z").replace("T", " ");
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/**
 * The served-artifact block — the half of this command that is easiest to get
 * dangerously wrong, and therefore the half with its own function and its own
 * assertions.
 *
 * Three cases, exhaustive by construction (the schema documents them as such):
 *
 *   · `served === null`      — never observed. NOT "nothing is live".
 *   · same deployment as `live` — the swap is done AND proven.
 *   · a different deployment — as of `provenAt` the edge was still on the
 *     previous build, which is what a null `live.servedProvenAt` MEANS.
 *
 * Every branch prints `provenAt`'s age, and no branch ever prints the words
 * "not serving".
 */
export function formatServedLines(
  live: VibeLiveDeploymentDto | null,
  served: VibeServedArtifactDto | null,
  nowMs: number
): string[] {
  if (served === null) {
    return [
      `${color.bold("Served".padEnd(12))}  ${color.dim("not observed")}`,
      color.dim("  The platform has never seen the edge answer with any build of this app."),
      color.dim(
        "  This is NOT a statement that nothing is being served — the probe needs a public URL it can reach, and an app it cannot reach is never proven at all."
      )
    ];
  }

  const age = formatAge(nowMs - Date.parse(served.provenAt));
  const observed = `${age} ${color.dim(`(${formatInstant(served.provenAt)})`)}`;
  const proven = live !== null && live.deploymentId === served.deploymentId;

  if (proven) {
    return [
      `${color.bold("Served".padEnd(12))}  ${color.green(`v${String(live.versionNumber)}`)}  ${shortSha(served.commitSha)}  ${color.dim("observed")} ${observed}`,
      color.dim(
        `  Swapped ${String(Math.round(served.healthyToServedMs / 1000))}s after that deployment went healthy (an UPPER bound — the probe samples on a sweep).`
      ),
      color.dim(
        "  An observation, not a live reading: nothing re-checks it, so anything that changed since is not reflected here."
      )
    ];
  }

  // Nothing is HEALTHY, yet the edge WAS observed answering. There is no
  // "previous" for this build to be previous TO, and no live slot it failed to
  // swap to — claiming either contradicts the Live line printed directly above,
  // which says the slot is empty. The observation still stands on its own; that
  // is exactly what a mandatory `provenAt` buys.
  if (live === null) {
    return [
      `${color.bold("Served".padEnd(12))}  ${color.yellow("last observed")}  ${shortSha(served.commitSha)}  ${color.dim("observed")} ${observed}`,
      color.dim(
        "  As of that observation the edge was answering with this build. Nothing is in the live slot now, so this is the last build the platform saw served — NOT one that something newer has replaced."
      ),
      color.dim(`  Deployment ${served.deploymentId}, image ${served.imageRef}.`)
    ];
  }

  // The case the whole `served` field was added for. `live.servedProvenAt` is
  // null here, and this block is what that null means.
  return [
    `${color.bold("Served".padEnd(12))}  ${color.yellow("previous build")}  ${shortSha(served.commitSha)}  ${color.dim("observed")} ${observed}`,
    color.dim(
      `  As of that observation the edge was still answering with this build, not with v${String(live.versionNumber)} (${shortSha(live.commitSha)}).`
    ),
    color.dim(`  Deployment ${served.deploymentId}, image ${served.imageRef}.`)
  ];
}

/**
 * The `live` block, plus the "not proven" line whose absence would be the
 * original defect.
 */
function formatLiveLines(
  live: VibeLiveDeploymentDto | null,
  served: VibeServedArtifactDto | null
): string[] {
  if (live === null) {
    return [
      `${color.bold("Live".padEnd(12))}  ${color.dim("nothing in the live slot — never deployed, or every version is down")}`
    ];
  }

  const lines = [
    `${color.bold("Live".padEnd(12))}  ${color.green(`v${String(live.versionNumber)}`)}  ${shortSha(live.commitSha)}  ${live.url ?? color.dim("(no public URL recorded)")}`,
    color.dim(
      `  The newest HEALTHY deployment — the ALLOCATION's verdict, which lands BEFORE the edge swaps. Triggered ${formatInstant(live.createdAt)}.`
    )
  ];

  if (live.servedProvenAt !== null) return lines;

  // 🔴 The line this command exists for. "not proven" is a statement about
  // EVIDENCE; a reader who takes it for "not serving" has reinvented the bug.
  lines.push(
    color.yellow(
      `  Not PROVEN served${served === null ? "" : " — see Served below"}. Not proven is not "not serving".`
    ),
    color.dim(
      "  The proof sweep only considers a deployment that went healthy recently, so a swap slower than its window — or an app the probe cannot reach — stays unproven permanently while serving perfectly well."
    )
  );
  return lines;
}

/**
 * The whole answer, as lines.
 *
 * `nowMs` is a parameter rather than a `Date.now()` call so the ages above are
 * assertable — an age is the field most likely to be silently dropped in a
 * refactor, and a test that cannot pin "now" cannot notice.
 */
export function renderDeployState(data: GetDeployStateResponse, nowMs: number): string[] {
  const lines: string[] = [`${color.bold("Outcome".padEnd(12))}  ${describeOutcome(data.outcome)}`];

  const askedBy =
    data.resolved.from === "deployBranch"
      ? "the app's own deploy branch"
      : `the ${data.resolved.from} you named`;
  lines.push(
    `${color.bold("Commit".padEnd(12))}  ${data.resolved.sha === null ? color.dim("— none resolved") : shortSha(data.resolved.sha)}  ${color.dim(`${nonBlankOr(data.resolved.refName, "no ref head matches this commit")} — resolved from ${askedBy}`)}`
  );

  lines.push(
    data.ref === null
      ? `${color.bold("Receipt".padEnd(12))}  ${color.dim("no ref row — the platform has no record of a push on this ref")}`
      : `${color.bold("Receipt".padEnd(12))}  ${shortSha(data.ref.sha)} ${color.dim(`is the head of ${data.ref.refName}, last moved ${formatInstant(data.ref.updatedAt)}`)}`
  );

  if (data.deployment === null) {
    lines.push(`${color.bold("Deployment".padEnd(12))}  ${color.dim("none for this commit")}`);
  } else {
    const d = data.deployment;
    lines.push(
      `${color.bold("Deployment".padEnd(12))}  v${String(d.versionNumber)}  ${d.status}  ${color.dim(d.id)}`
    );
    if (d.errorReason !== null) {
      lines.push(color.red(`  ${d.errorReason}`));
    }
    if (data.buildJob !== null && data.buildJob.errorReason !== null) {
      lines.push(
        color.red(`  build ${data.buildJob.status}: ${data.buildJob.errorReason}`),
        color.dim(`  logs: ${data.buildJob.logsRef === "" ? "—" : data.buildJob.logsRef}`)
      );
    }
  }

  lines.push(...formatLiveLines(data.live, data.served));
  lines.push(...formatServedLines(data.live, data.served, nowMs));

  return lines;
}
