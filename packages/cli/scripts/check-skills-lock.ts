/**
 * Assert `src/skills-content.generated.ts` was built from the SHA that
 * `skills-nexus.lock` currently pins.
 *
 * Run: pnpm dlx tsx packages/cli/scripts/check-skills-lock.ts
 * Prove it can fail: … check-skills-lock.ts --self-test
 *
 * ## What rots, and why nothing saw it
 *
 * The bundle is generated from a DIFFERENT repository. `bundle-skills.ts`
 * fetches `NexusGPT/claude-code-skills-nexus` at the pinned SHA and overwrites
 * the generated file, so the pin and the artefact are two facts that must agree
 * and nothing compared them. Three ways they come apart, all of them silent:
 *
 * - The lock is bumped and `pnpm run gen:skills` is not re-run. The pin then
 *   describes content no user has. This is the expensive one: the repository
 *   claims a fix shipped, and the bundle every agent reads still teaches the
 *   old thing.
 * - The generated file is hand-edited. It says "do not edit" and that is the
 *   whole of the enforcement; the next bundle run reverts the edit with no
 *   diff to review and no message.
 * - A partial commit takes one file and not the other. `git add <path>` makes
 *   that one keystroke.
 *
 * `pr-checks.yml` already asserts freshness for the porter configs and the API
 * client by REGENERATING and requiring no diff. That is the stronger check and
 * it is not available here: the source repository is private, and a workflow's
 * default `GITHUB_TOKEN` is scoped to this repository alone. Regenerating in CI
 * would need a cross-repository read token that does not exist yet.
 *
 * So this compares the two facts the artefact already carries about itself. It
 * needs no network, no token and no install, which is why it can run on every
 * pull request with no path filter.
 *
 * ## What it deliberately does NOT check
 *
 * That the pin is CURRENT. A lock pinned by hand drifts behind upstream `main`
 * at upstream's pace — 35 commits at the time this was written — and no offline
 * check can see that. Making staleness visible needs a scheduled job holding a
 * token that can read the private source repository. That is a credential
 * decision, not code, and it is open.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "NexusGPT/claude-code-skills-nexus";
const SHA_PATTERN = /^[a-f0-9]{40}$/i;

/** A single reason the pin and the artefact disagree. */
interface Finding {
  /** Stable identifier, so the self-test asserts on the CAUSE, not on prose. */
  code: string;
  message: string;
}

/**
 * Compare `skills-nexus.lock` against what the generated bundle says about
 * itself. An empty array means they agree.
 *
 * `cliRoot` is a parameter rather than the module constant so the self-test can
 * drive real fixtures through the same code path the gate runs.
 */
export function findDisagreements(cliRoot: string): Finding[] {
  const lockPath = path.join(cliRoot, "skills-nexus.lock");
  const bundlePath = path.join(cliRoot, "src", "skills-content.generated.ts");
  const findings: Finding[] = [];

  if (!fs.existsSync(lockPath)) {
    return [{ code: "LOCK_MISSING", message: `${lockPath} does not exist.` }];
  }
  const pinned = fs.readFileSync(lockPath, "utf-8").trim();
  if (!SHA_PATTERN.test(pinned)) {
    return [
      {
        code: "LOCK_MALFORMED",
        message: `skills-nexus.lock holds ${JSON.stringify(pinned)}, not a 40-character commit SHA.`
      }
    ];
  }

  if (!fs.existsSync(bundlePath)) {
    return [
      {
        code: "BUNDLE_MISSING",
        message: `${bundlePath} does not exist. Run: GITHUB_TOKEN=$(gh auth token) pnpm run gen:skills`
      }
    ];
  }
  const bundle = fs.readFileSync(bundlePath, "utf-8");

  // Written by bundle-skills.ts as line 2: `// Source: <repo>@<sha>`.
  const header = new RegExp(`^// Source: ${REPO}@([a-f0-9]{40})$`, "m").exec(bundle);
  if (header === null) {
    findings.push({
      code: "BUNDLE_HEADER_UNREADABLE",
      message: `The generated bundle carries no \`// Source: ${REPO}@<sha>\` header line.`
    });
  } else if (header[1] !== pinned) {
    findings.push({
      code: "BUNDLE_STALE",
      message:
        `The bundle was built from ${header[1].slice(0, 12)} but skills-nexus.lock pins ` +
        `${pinned.slice(0, 12)}.`
    });
  }

  const exported = /^export const SKILLS_NEXUS_SHA: string = "([a-f0-9]{40})";$/m.exec(bundle);
  if (exported === null) {
    findings.push({
      code: "SHA_EXPORT_MISSING",
      message: "The generated bundle exports no SKILLS_NEXUS_SHA constant."
    });
  } else if (exported[1] !== pinned) {
    findings.push({
      code: "SHA_EXPORT_MISMATCH",
      message:
        `SKILLS_NEXUS_SHA is ${exported[1].slice(0, 12)} but skills-nexus.lock pins ` +
        `${pinned.slice(0, 12)}.`
    });
  }

  return findings;
}

/** The smallest tree `findDisagreements` accepts, for the self-test to mutate. */
function writeCleanFixture(root: string, sha: string): void {
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "skills-nexus.lock"), sha + "\n", "utf-8");
  fs.writeFileSync(
    path.join(root, "src", "skills-content.generated.ts"),
    [
      "// AUTO-GENERATED — do not edit. Run: pnpm run gen:skills",
      `// Source: ${REPO}@${sha}`,
      "",
      `export const SKILLS_NEXUS_SHA: string = "${sha}";`,
      ""
    ].join("\n"),
    "utf-8"
  );
}

/**
 * Prove every check can go red, and that a correct tree goes green.
 *
 * A comparison is the shape most able to pass by comparing nothing to nothing:
 * a regex that stops matching reports no finding, which reads exactly like
 * agreement. Each case below breaks the fixture ONE way and requires the
 * matching code back, so a refactor that makes a check unfalsifiable fails here
 * instead of going quiet.
 */
function selfTest(): number {
  const sha = "a".repeat(40);
  const other = "b".repeat(40);

  const cases: { name: string; expect: string; break: (root: string) => void }[] = [
    {
      name: "no lock file",
      expect: "LOCK_MISSING",
      break: (root) => fs.rmSync(path.join(root, "skills-nexus.lock"))
    },
    {
      name: "lock is not a SHA",
      expect: "LOCK_MALFORMED",
      break: (root) => fs.writeFileSync(path.join(root, "skills-nexus.lock"), "main\n", "utf-8")
    },
    {
      name: "no generated bundle",
      expect: "BUNDLE_MISSING",
      break: (root) => fs.rmSync(path.join(root, "src", "skills-content.generated.ts"))
    },
    {
      name: "bundle header removed",
      expect: "BUNDLE_HEADER_UNREADABLE",
      break: (root) => rewriteBundle(root, (text) => text.replace(/^\/\/ Source: .*$/m, "//"))
    },
    {
      name: "bundle built from another SHA",
      expect: "BUNDLE_STALE",
      break: (root) =>
        rewriteBundle(root, (text) =>
          text.replace(`Source: ${REPO}@${sha}`, `Source: ${REPO}@${other}`)
        )
    },
    {
      name: "SKILLS_NEXUS_SHA export removed",
      expect: "SHA_EXPORT_MISSING",
      break: (root) =>
        rewriteBundle(root, (text) => text.replace(/^export const SKILLS_NEXUS_SHA.*$/m, ""))
    },
    {
      name: "SKILLS_NEXUS_SHA disagrees with the lock",
      expect: "SHA_EXPORT_MISMATCH",
      break: (root) =>
        rewriteBundle(root, (text) =>
          text.replace(
            `SKILLS_NEXUS_SHA: string = "${sha}"`,
            `SKILLS_NEXUS_SHA: string = "${other}"`
          )
        )
    }
  ];

  let failed = 0;

  // The control. Without it every case below could pass because the fixture is
  // broken in some eighth way the checks all report unconditionally.
  const control = fs.mkdtempSync(path.join(os.tmpdir(), "skills-lock-control-"));
  writeCleanFixture(control, sha);
  const clean = findDisagreements(control);
  if (clean.length === 0) {
    console.log("  ok    a correct tree reports nothing");
  } else {
    failed += 1;
    console.error(`  FAIL  a correct tree reported ${clean.map((f) => f.code).join(", ")}`);
  }
  fs.rmSync(control, { recursive: true, force: true });

  for (const testCase of cases) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "skills-lock-selftest-"));
    writeCleanFixture(root, sha);
    testCase.break(root);
    const codes = findDisagreements(root).map((f) => f.code);
    if (codes.includes(testCase.expect)) {
      console.log(`  ok    ${testCase.name} → ${testCase.expect}`);
    } else {
      failed += 1;
      console.error(
        `  FAIL  ${testCase.name} → expected ${testCase.expect}, got ${codes.join(", ") || "nothing"}`
      );
    }
    fs.rmSync(root, { recursive: true, force: true });
  }

  if (failed > 0) {
    console.error(`\ncheck-skills-lock --self-test: ${failed} case(s) no longer detectable.`);
    return 1;
  }
  console.log(`\ncheck-skills-lock --self-test: ${cases.length + 1} case(s) behave.`);
  return 0;
}

function rewriteBundle(root: string, edit: (text: string) => string): void {
  const file = path.join(root, "src", "skills-content.generated.ts");
  fs.writeFileSync(file, edit(fs.readFileSync(file, "utf-8")), "utf-8");
}

function main(): number {
  if (process.argv.includes("--self-test")) return selfTest();

  const findings = findDisagreements(CLI_ROOT);
  if (findings.length === 0) {
    const pinned = fs.readFileSync(path.join(CLI_ROOT, "skills-nexus.lock"), "utf-8").trim();
    console.log(`skills bundle matches skills-nexus.lock (${REPO}@${pinned.slice(0, 12)}).`);
    return 0;
  }

  for (const finding of findings) {
    console.error(`::error::[${finding.code}] ${finding.message}`);
  }
  console.error(
    "::error::Regenerate and commit both files together: " +
      "GITHUB_TOKEN=$(gh auth token) pnpm --filter @agent-nexus/cli run gen:skills"
  );
  return 1;
}

process.exit(main());
