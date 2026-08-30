/**
 * Assert `skills-nexus.lock` has not fallen silently behind the repository it
 * pins — `NexusGPT/claude-code-skills-nexus` at `main`.
 *
 * Run:  pnpm --filter @agent-nexus/cli run check:skills-drift
 * Prove it can fail:  … check-skills-drift.ts --self-test
 *
 * ## The hole this closes, and why its sibling cannot
 *
 * `check-skills-lock.ts` compares the pin against the ARTEFACT — the sha the
 * generated bundle records about itself. Those two facts live in this
 * repository, so that check needs no network, no token and no install, which is
 * what lets it run on every pull request. Its own header says what it therefore
 * cannot see: whether the pin is CURRENT.
 *
 * Nothing saw that. The lock only ever moves when a human with a personal token
 * happens to run `gen:skills`, and no gate anywhere compares it to upstream. A
 * pin drifts behind at upstream's pace, silently, and the first symptom is an
 * agent being taught something that was corrected weeks ago — the NEX-3280
 * shape, one layer up: there the repository claimed a fix the bundle did not
 * carry, here the repository does not know a fix exists.
 *
 * ## Why this is a SCHEDULE and not a pull-request gate
 *
 * Two independent reasons, and either alone would be enough.
 *
 * Drift is not caused by a commit. Upstream merges on its own clock; no pull
 * request here arrives carrying it, so no pull request here is the moment to
 * ask. `schema-drift.yml` makes the same argument at length and for the same
 * reason.
 *
 * And a pull request cannot ask. Reading the source repository needs a
 * cross-repository credential, because it is private and a workflow's default
 * `GITHUB_TOKEN` is scoped to this repository alone. A pull request from a fork
 * gets no secret at all. So a required check of this shape would be red for
 * correct reasons on traffic that has nothing to do with skills — the fastest
 * known way to teach everyone to ignore a gate.
 *
 * ## Why "behind" is not automatically "wrong"
 *
 * The pin is deliberate. Bumping it is a reviewed act with real consequences —
 * the bundle carries `hooks/`, `agents/` and `settings.json`, so a bump ships
 * new enforcement, not just new prose. Being SOME commits behind is therefore
 * the intended state, exactly as `secret-delivery-drift.yml` treats a mirror gap
 * while nobody deploys.
 *
 * What is a defect is being behind and nobody KNOWING. So the verdict turns on
 * AGE, not on commit count: age measures "nobody has looked at this in N days",
 * which is the actual failure, where commit count measures upstream's velocity,
 * which is not this repository's business. Inside the window the run is green
 * AND STILL PRINTS THE DISTANCE, so the number is on screen every single run
 * rather than only once it is too late.
 *
 * `SKILLS_DRIFT_MAX_AGE_DAYS` overrides the window. It is one constant, and
 * widening it is the snooze button this check exists to remove — move it with
 * a reason, in the same commit as the reason.
 *
 * ## THREE outcomes, never two
 *
 * A check that cannot perform its check MUST NOT report success. "Nothing is
 * failing" and "nothing ever ran" reaching the same green is the failure this
 * whole file is built against, so the states are:
 *
 *   CURRENT       exit 0   in sync, or behind inside the review window
 *   DRIFT         exit 1   behind past the window, or pinned off `main`
 *   CANNOT_CHECK  exit 2   no credential, or the read did not answer
 *
 * CANNOT_CHECK is RED. It is not a softer green: nobody knows the answer, and
 * the one thing that reads worse than a known-stale pin is a pin nothing is
 * looking at while a tick says otherwise. The annotation carries a `title=` so
 * the three are distinguishable from the run list without opening a log.
 *
 * ## What it deliberately does NOT do
 *
 * Bump the lock. A bump ships enforcement and is a reviewed act; a checker that
 * edits the thing it checks has no verdict left to give. It prints the command
 * and stops.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runSelfTest } from "./skills-drift/self-test";
import { githubReader, resolveToken } from "./skills-drift/upstream";
import { DEFAULT_MAX_AGE_DAYS, detectDrift, EXIT_CODE, type Verdict } from "./skills-drift/verdict";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── reporting ────────────────────────────────────────────────────────────────

/**
 * Emit the verdict where CI will show it.
 *
 * The `title=` is load-bearing: GitHub renders it on the run summary, so DRIFT
 * and CANNOT_CHECK are distinguishable from the run list WITHOUT opening a log.
 * Two reds that look identical from outside would put this check straight back
 * into the failure it exists to prevent.
 */
function report(verdict: Verdict): void {
  const lines = [verdict.message, ...verdict.detail];

  if (verdict.state === "CURRENT") {
    console.log(`[${verdict.code}] ${verdict.message}`);
    for (const line of verdict.detail) console.log(`  ${line}`);
  } else {
    const title = verdict.state === "DRIFT" ? "SKILLS BUNDLE DRIFT" : "SKILLS DRIFT UNCHECKED";
    console.error(`::error title=${title}::[${verdict.code}] ${verdict.message}`);
    for (const line of verdict.detail) console.error(`  ${line}`);
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath !== undefined && summaryPath !== "") {
    const heading =
      verdict.state === "CURRENT"
        ? `### skills bundle pin: CURRENT (${verdict.code})`
        : verdict.state === "DRIFT"
          ? `### skills bundle pin: DRIFT DETECTED (${verdict.code})`
          : `### skills bundle pin: CANNOT CHECK (${verdict.code})`;
    const body = [heading, "", "```", ...lines, "```", ""].join("\n");
    try {
      fs.appendFileSync(summaryPath, body, "utf-8");
    } catch (error) {
      // A summary that cannot be written must not change the verdict.
      console.error(
        `(could not write GITHUB_STEP_SUMMARY: ${error instanceof Error ? error.message : String(error)})`
      );
    }
  }

  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath !== undefined && outputPath !== "") {
    try {
      fs.appendFileSync(outputPath, `state=${verdict.state}\ncode=${verdict.code}\n`, "utf-8");
    } catch {
      /* the exit code is the contract; this is a convenience for later steps */
    }
  }
}

async function main(): Promise<number> {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const raw = process.env.SKILLS_DRIFT_MAX_AGE_DAYS;
  let maxAgeDays = DEFAULT_MAX_AGE_DAYS;
  if (raw !== undefined && raw !== "") {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      // Refuse rather than silently falling back: a typo'd override that
      // quietly reverts to the default is a window nobody knows the size of.
      console.error(
        `::error title=SKILLS DRIFT UNCHECKED::SKILLS_DRIFT_MAX_AGE_DAYS is ` +
          `${JSON.stringify(raw)}, which is not a non-negative number.`
      );
      return EXIT_CODE.CANNOT_CHECK;
    }
    maxAgeDays = parsed;
  }

  const token = resolveToken();
  const verdict = await detectDrift({
    cliRoot: CLI_ROOT,
    read: token === null ? null : githubReader(token),
    maxAgeDays
  });

  report(verdict);
  return EXIT_CODE[verdict.state];
}

/**
 * Only when RUN, never when imported.
 *
 * `detectDrift`, `githubReader` and `resolveToken` are exported so a test can
 * drive the real code path against a fixture tree. Without this guard the mere
 * act of importing one of them also ran the whole check against the real
 * repository and called `process.exit` — which is exactly what happened the
 * first time a control imported this file: the harness printed its own verdict
 * and then the module's, and the second one exited the process out from under
 * it. An exported function that cannot be imported without side effects is not
 * really exported.
 */
const invokedDirectly =
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      // An uncaught throw would exit 1 and be indistinguishable from DRIFT.
      // Every escape lands on CANNOT_CHECK instead, because a checker that
      // crashed did not measure anything.
      console.error(
        `::error title=SKILLS DRIFT UNCHECKED::check-skills-drift threw: ` +
          `${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
      );
      process.exit(EXIT_CODE.CANNOT_CHECK);
    });
}
