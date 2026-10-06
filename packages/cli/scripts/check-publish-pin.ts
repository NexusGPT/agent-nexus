/**
 * Refuse a CLI release whose skills bundle misses upstream content that had
 * landed by the time the release was decided.
 *
 * Run:   pnpm dlx tsx packages/cli/scripts/check-publish-pin.ts --release-ref <sha>
 * Against a published tarball's own sha:
 *        … check-publish-pin.ts --pin 61fb85d2dd2041143ed5d7eba3d97af21b339faa --release-ref <sha>
 *
 * `--release-ref` is the monorepo commit being released (`github.sha` in a
 * workflow). It locates the release commit and the PR that merged it, which fix
 * the DEADLINE — see `skills-drift/publish-pin.ts`. Without it the bundle is held
 * to upstream HEAD by content, the strictest reading; on a runner its absence is
 * refused instead, because a workflow that forgot it would bring back the race.
 *
 * ## Where it sits, and why that is the only placement that gates anything
 *
 * The CLI is published from the PUBLIC mirror, not from here: `main` is synced
 * into `NexusGPT/agent-nexus`, and a `cli-v<version>` tag pushed onto that
 * mirror is what its release workflow reacts to. The version itself is decided
 * in this repository by changesets — `chore(release): version packages` on
 * `main` — so the repository does already know what is published, and a check
 * that re-derived that would be building something that exists.
 *
 * What nothing owns is the tag push. It is the last act in this repository
 * before a tarball exists, it lives in `mirror-public-packages.yml`, and this
 * check runs there. A gate has to sit IN the path; a checker sitting beside the
 * merge is a discipline somebody keeps by remembering to.
 *
 * ## What it structurally cannot catch — all four are real
 *
 *  1. **A publish that does not come through the mirror tag.** A hand-run
 *     `npm publish` from a laptop, or a release cut inside the mirror repo
 *     itself, never executes this file. This gate covers the ONE path the
 *     automation takes, and that path is not the only one that exists.
 *  2. **A pin advanced without a rebuild.** This reads the sha the generated
 *     bundle records about itself, so it is honest about the artefact — but a
 *     lock moved without regenerating the bundle is `check-skills-lock.ts`'s
 *     question, and it is a separate check for a reason. Green here says the
 *     bundle's own claim matches upstream head; it says nothing about whether
 *     the bundle's CONTENT was built at that sha.
 *  3. **Upstream content landing after the deadline.** By design: it was not on
 *     upstream `main` when the release was decided, it is named in the report,
 *     and it ships in the next release.
 *  4. **Whether upstream content is GOOD.** It compares what landed against what
 *     the bundle carries. A pin that carries a broken upstream passes, correctly
 *     and uselessly.
 *
 * ## Exit codes
 *
 *   0  RELEASE_PIN_CURRENT     nothing shipping that was due is missing
 *   1  RELEASE_PIN_BEHIND      named commits are missing, or the pin is off-branch
 *   2  RELEASE_PIN_UNCHECKED   no credential, or the read did not answer
 *
 * 1 and 2 both refuse. They are separate codes because the remedies are
 * opposite — one is "refresh the pin", the other is "nobody measured anything".
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkPublishPin,
  gateOutputs,
  PUBLISH_PIN_EXIT_CODE,
  type PublishPinState,
  type PublishPinVerdict
} from "./skills-drift/publish-pin";
import { type ReleaseDeadline, resolveReleaseDeadline } from "./skills-drift/release-deadline";
import {
  githubReader,
  githubRepoReader,
  RELEASE_REPO,
  resolveReleaseRepoToken,
  resolveToken
} from "./skills-drift/upstream";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE = path.join(CLI_ROOT, "src", "skills-content.generated.json");

/**
 * The sha the artefact records about ITSELF.
 *
 * Reading the lock file instead would make this check's subject a file that
 * declares intent, while the thing that reaches a user is the bundle. That
 * distinction is not pedantry: a spec whose assertions read a declaration
 * rather than the behaviour it describes is green in exactly the state it
 * exists to report.
 */
function readBundlePin(): { pin: string } | { error: string } {
  let raw: string;
  try {
    raw = fs.readFileSync(BUNDLE, "utf-8");
  } catch (error) {
    return {
      error: `${BUNDLE} could not be read (${error instanceof Error ? error.message : String(error)}).`
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      error: `${BUNDLE} is not JSON (${error instanceof Error ? error.message : String(error)}).`
    };
  }
  const sha = (parsed as { sha?: unknown }).sha;
  if (typeof sha !== "string" || sha === "") {
    return {
      error: `${BUNDLE} carries no \`sha\` field, so the artefact does not say what it pins.`
    };
  }
  return { pin: sha };
}

/**
 * Publish the verdict as STEP OUTPUTS, so the workflow reads a three-state
 * field instead of inferring one from the step's two-state `outcome`.
 *
 * Written by this process rather than by the calling shell, because the shell
 * has no way to tell `behind` from `unchecked` — that is precisely the
 * distinction the exit code carries and `outcome` destroys. If this process
 * never runs at all, the outputs are simply absent, and the workflow's
 * conditions are written so that an absent verdict withholds and pages.
 */
function writeGateOutputs(state: PublishPinState): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath === undefined || outputPath === "") return;
  const { verdict, withhold } = gateOutputs(state);
  try {
    fs.appendFileSync(outputPath, `verdict=${verdict}\nwithhold=${withhold}\n`, "utf-8");
  } catch (error) {
    // The exit code remains the contract. A workflow that cannot read the
    // verdict falls through to its absent-verdict branch, which withholds.
    console.error(
      `(could not write GITHUB_OUTPUT: ${error instanceof Error ? error.message : String(error)})`
    );
  }
}

function report(verdict: PublishPinVerdict): void {
  const lines = [verdict.message, ...verdict.detail];

  if (verdict.state === "RELEASE_PIN_CURRENT") {
    console.log(`[${verdict.code}] ${verdict.message}`);
    for (const line of verdict.detail) console.log(`  ${line}`);
  } else {
    // The two refusals carry different titles so they are distinguishable from
    // the run list without opening a log — "the pin is stale" and "nobody could
    // tell" call for different people.
    const title =
      verdict.state === "RELEASE_PIN_BEHIND"
        ? "RELEASE REFUSED — STALE SKILLS PIN"
        : "RELEASE REFUSED — PIN UNVERIFIED";
    console.error(`::error title=${title}::[${verdict.code}] ${verdict.message}`);
    for (const line of verdict.detail) console.error(line);
  }

  writeGateOutputs(verdict.state);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath !== undefined && summaryPath !== "") {
    const heading =
      verdict.state === "RELEASE_PIN_CURRENT"
        ? `### CLI release pin: CURRENT (${verdict.code})`
        : verdict.state === "RELEASE_PIN_BEHIND"
          ? `### CLI release REFUSED — stale skills pin (${verdict.code})`
          : `### CLI release REFUSED — pin unverified (${verdict.code})`;
    try {
      fs.appendFileSync(summaryPath, [heading, "", "```", ...lines, "```", ""].join("\n"), "utf-8");
    } catch (error) {
      // A summary that cannot be written must never change the verdict.
      console.error(
        `(could not write GITHUB_STEP_SUMMARY: ${error instanceof Error ? error.message : String(error)})`
      );
    }
  }
}

function flagFromArgv(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag);
  if (at === -1) return null;
  return argv[at + 1] ?? "";
}

function refuseUnchecked(code: string, message: string): number {
  console.error(`::error title=RELEASE REFUSED — PIN UNVERIFIED::[${code}] ${message}`);
  writeGateOutputs("RELEASE_PIN_UNCHECKED");
  return PUBLISH_PIN_EXIT_CODE.RELEASE_PIN_UNCHECKED;
}

async function main(): Promise<number> {
  // `--pin` exists so the check can be pointed at the sha inside an ALREADY
  // PUBLISHED tarball. Validating a gate only against the working tree validates
  // it against the one input that is easiest to make correct.
  const override = flagFromArgv(process.argv, "--pin");
  let pin: string;
  if (override !== null) {
    pin = override;
  } else {
    const read = readBundlePin();
    if ("error" in read) return refuseUnchecked("BUNDLE_UNREADABLE", read.error);
    pin = read.pin;
  }

  const releaseRef = flagFromArgv(process.argv, "--release-ref");
  let deadline: ReleaseDeadline | null = null;
  if (releaseRef === null || releaseRef === "") {
    if (process.env.GITHUB_ACTIONS === "true") {
      return refuseUnchecked(
        "NO_RELEASE_REF",
        "No --release-ref. On a runner the gate judges a RELEASE, and without one it would " +
          "hold the bundle to upstream head — the race this flag exists to remove."
      );
    }
    console.log("No --release-ref: judging the bundle against upstream HEAD, by content.");
  } else {
    const releaseToken = resolveReleaseRepoToken();
    if (releaseToken === null) {
      return refuseUnchecked(
        "NO_RELEASE_TOKEN",
        `No credential for ${RELEASE_REPO}, so when this release was cut cannot be read. ` +
          "Map github.token into NEXUS_REPO_READ_TOKEN."
      );
    }
    const resolved = await resolveReleaseDeadline({
      read: githubRepoReader(RELEASE_REPO, releaseToken),
      ref: releaseRef,
      now: new Date()
    });
    if (resolved.kind !== "ok") return refuseUnchecked(resolved.code, resolved.message);
    deadline = resolved.deadline;
  }

  const token = resolveToken();
  const verdict = await checkPublishPin({
    pin,
    read: token === null ? null : githubReader(token),
    deadline
  });

  report(verdict);
  return PUBLISH_PIN_EXIT_CODE[verdict.state];
}

/**
 * Only when RUN, never when imported — the spec drives `checkPublishPin`
 * directly, and an exported function that exits the process on import is not
 * really exported.
 */
const invokedDirectly =
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      // An uncaught throw would exit 1 and be indistinguishable from a real
      // BEHIND verdict. Every escape lands on UNCHECKED instead: a checker that
      // crashed measured nothing, and must not be read as having found drift.
      console.error(
        `::error title=RELEASE REFUSED — PIN UNVERIFIED::check-publish-pin threw: ` +
          `${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
      );
      process.exit(PUBLISH_PIN_EXIT_CODE.RELEASE_PIN_UNCHECKED);
    });
}
