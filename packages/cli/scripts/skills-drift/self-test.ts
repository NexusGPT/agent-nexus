/**
 * The self-test rig: prove every state is reachable, and that a correct tree is
 * CURRENT.
 *
 * It drives the REAL `detectDrift` through a SCRIPTED transport, so the code
 * path under test is the one that ships — only the network is replaced. That is
 * why it needs no credential and can run on every pull request, where the
 * credentialed job cannot.
 *
 * Two defects have been caught here that reading the code did not catch, and
 * both were assertion gaps rather than logic gaps: the diverged message printed
 * `ahead_by` and `behind_by` under each other's labels (state right, numbers
 * confidently backwards), and the diverged verdict carried only truncated
 * SHAs. Both were invisible while the cases asserted the CODE alone. So where a
 * case carries a number or a sha, the case asserts it.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { BRANCH, type GitHubReader, type ReadResult } from "./upstream";
import { detectDrift, EXIT_CODE, type Verdict } from "./verdict";

/** The smallest tree `detectDrift` accepts, for the self-test to mutate. */
function writeLockFixture(root: string, sha: string): void {
  fs.writeFileSync(path.join(root, "skills-nexus.lock"), sha + "\n", "utf-8");
}

/** A transport that answers from a script, so the REAL code path is driven. */
function scriptedReader(answers: Record<string, ReadResult>): GitHubReader {
  return async (apiPath) => {
    for (const [prefix, answer] of Object.entries(answers)) {
      if (apiPath.startsWith(prefix)) return answer;
    }
    return { kind: "http", status: 404, statusText: "Not Found" };
  };
}

function commitBody(sha: string, date: string): ReadResult {
  return { kind: "ok", body: { sha, commit: { committer: { date } } } };
}

function compareBody(params: {
  status: string;
  aheadBy: number;
  behindBy: number;
  baseDate: string;
}): ReadResult {
  return {
    kind: "ok",
    body: {
      status: params.status,
      ahead_by: params.aheadBy,
      behind_by: params.behindBy,
      base_commit: { commit: { committer: { date: params.baseDate } } }
    }
  };
}

/**
 * Prove every state is reachable, and that a correct tree is CURRENT.
 *
 * A three-state check is the shape most able to collapse into two without
 * anyone noticing — an error path that quietly returns the green state reads
 * exactly like agreement, and that collapse is the whole defect this file
 * exists to prevent. Each case below breaks one thing and requires the matching
 * CODE and STATE back, so a refactor that makes CANNOT_CHECK unreachable turns
 * this red instead of going quiet.
 */
export async function runSelfTest(): Promise<number> {
  const PIN = "a".repeat(40);
  const TIP = "b".repeat(40);
  const HEAD_PATH = `/commits/${BRANCH}`;
  const COMPARE_PATH = "/compare/";

  const inSync = { [HEAD_PATH]: commitBody(PIN, "2026-08-30T00:00:00Z") };

  interface Case {
    name: string;
    state: Verdict["state"];
    code: string;
    read: GitHubReader | null;
    mutate?: (root: string) => void;
    /**
     * Substrings the rendered verdict must contain.
     *
     * Asserting only on the CODE is what let a real defect through: the diverged
     * message printed `ahead_by` and `behind_by` under each other's labels, so
     * the state was right and the numbers were confidently backwards. A code is
     * not a measurement — where a case carries a number, the number is asserted.
     */
    expect?: string[];
  }

  const cases: Case[] = [
    // ── CANNOT_CHECK: the state that must never collapse into green ──────────
    {
      name: "no credential at all",
      state: "CANNOT_CHECK",
      code: "NO_TOKEN",
      read: null
    },
    {
      name: "lock file absent",
      state: "CANNOT_CHECK",
      code: "LOCK_MISSING",
      read: scriptedReader(inSync),
      mutate: (root) => fs.rmSync(path.join(root, "skills-nexus.lock"))
    },
    {
      name: "lock is not a SHA",
      state: "CANNOT_CHECK",
      code: "LOCK_MALFORMED",
      read: scriptedReader(inSync),
      mutate: (root) => fs.writeFileSync(path.join(root, "skills-nexus.lock"), "main\n", "utf-8")
    },
    {
      name: "token revoked (401)",
      state: "CANNOT_CHECK",
      code: "UPSTREAM_UNAUTHORIZED",
      read: scriptedReader({
        [HEAD_PATH]: { kind: "http", status: 401, statusText: "Unauthorized" }
      })
    },
    {
      name: "token rate-limited or forbidden (403)",
      state: "CANNOT_CHECK",
      code: "UPSTREAM_UNAUTHORIZED",
      read: scriptedReader({ [HEAD_PATH]: { kind: "http", status: 403, statusText: "Forbidden" } })
    },
    {
      name: "token under-scoped for a private repo (404)",
      state: "CANNOT_CHECK",
      code: "UPSTREAM_NOT_FOUND",
      read: scriptedReader({ [HEAD_PATH]: { kind: "http", status: 404, statusText: "Not Found" } })
    },
    {
      name: "GitHub is down (500)",
      state: "CANNOT_CHECK",
      code: "UPSTREAM_UNREACHABLE",
      read: scriptedReader({
        [HEAD_PATH]: { kind: "http", status: 500, statusText: "Internal Server Error" }
      })
    },
    {
      name: "the network is unreachable",
      state: "CANNOT_CHECK",
      code: "UPSTREAM_UNREACHABLE",
      read: scriptedReader({ [HEAD_PATH]: { kind: "transport", message: "ENOTFOUND" } })
    },
    {
      name: "200 with no readable sha",
      state: "CANNOT_CHECK",
      code: "UPSTREAM_UNREADABLE",
      read: scriptedReader({ [HEAD_PATH]: { kind: "ok", body: { unexpected: true } } })
    },

    // ── DRIFT ────────────────────────────────────────────────────────────────
    {
      name: "behind, past the review window",
      state: "DRIFT",
      code: "LOCK_BEHIND",
      read: scriptedReader({
        [HEAD_PATH]: commitBody(TIP, "2026-08-30T00:00:00Z"),
        [COMPARE_PATH]: compareBody({
          status: "ahead",
          aheadBy: 64,
          behindBy: 0,
          baseDate: "2026-08-01T00:00:00Z"
        })
      }),
      // `ahead_by` is the distance the PIN is behind. 29 days spans the window.
      // Both SHAs are required in the verdict: two runs minutes apart can
      // legitimately disagree, and without the target named a moved upstream is
      // indistinguishable from a broken detector.
      expect: [`${PIN.slice(0, 12)} → ${TIP.slice(0, 12)}`, "64 commit(s) behind", "29 day(s)"]
    },
    {
      name: "pinned to a commit that is not on the branch",
      state: "DRIFT",
      code: "LOCK_DIVERGED",
      read: scriptedReader({
        [HEAD_PATH]: commitBody(TIP, "2026-08-30T00:00:00Z"),
        [COMPARE_PATH]: compareBody({
          status: "diverged",
          aheadBy: 3,
          behindBy: 9,
          baseDate: "2026-08-20T00:00:00Z"
        })
      }),
      // The asymmetric pair is the point: 3 and 9 must land under the RIGHT
      // labels. Swap them and this case reds while the code stays LOCK_DIVERGED.
      expect: [
        "3 commit(s) on main are absent from the pin",
        "9 commit(s) under the pin are absent from main",
        PIN,
        TIP
      ]
    },
    {
      name: "pinned ahead of the branch",
      state: "DRIFT",
      code: "LOCK_DIVERGED",
      read: scriptedReader({
        [HEAD_PATH]: commitBody(TIP, "2026-08-30T00:00:00Z"),
        [COMPARE_PATH]: compareBody({
          status: "behind",
          aheadBy: 0,
          behindBy: 4,
          baseDate: "2026-08-29T00:00:00Z"
        })
      })
    },
    {
      name: "the pinned commit no longer exists upstream",
      state: "DRIFT",
      code: "LOCK_UNREACHABLE_UPSTREAM",
      read: scriptedReader({
        [HEAD_PATH]: commitBody(TIP, "2026-08-30T00:00:00Z"),
        [COMPARE_PATH]: { kind: "http", status: 404, statusText: "Not Found" }
      })
    },
    // The verdict is already established by a read that SUCCEEDED. These two
    // require that a failing DETAIL call cannot take it away — the drift must
    // not decay into CANNOT_CHECK and let a real finding escape as "unknown".
    {
      name: "compare fails after the tip read succeeded — verdict survives",
      state: "DRIFT",
      code: "LOCK_BEHIND_UNMEASURED",
      read: scriptedReader({
        [HEAD_PATH]: commitBody(TIP, "2026-08-30T00:00:00Z"),
        [COMPARE_PATH]: { kind: "http", status: 502, statusText: "Bad Gateway" }
      })
    },
    {
      name: "compare answers 200 with no readable status",
      state: "DRIFT",
      code: "LOCK_BEHIND_UNMEASURED",
      read: scriptedReader({
        [HEAD_PATH]: commitBody(TIP, "2026-08-30T00:00:00Z"),
        [COMPARE_PATH]: { kind: "ok", body: { nothing: "useful" } }
      })
    },
    {
      name: "behind with no dates — fails closed rather than passing unmeasured",
      state: "DRIFT",
      code: "LOCK_BEHIND_UNMEASURED",
      read: scriptedReader({
        [HEAD_PATH]: { kind: "ok", body: { sha: TIP } },
        [COMPARE_PATH]: { kind: "ok", body: { status: "ahead", ahead_by: 2, behind_by: 0 } }
      })
    },

    // ── CURRENT ──────────────────────────────────────────────────────────────
    {
      name: "behind but inside the review window",
      state: "CURRENT",
      code: "WITHIN_WINDOW",
      read: scriptedReader({
        [HEAD_PATH]: commitBody(TIP, "2026-08-30T00:00:00Z"),
        [COMPARE_PATH]: compareBody({
          status: "ahead",
          aheadBy: 11,
          behindBy: 0,
          baseDate: "2026-08-27T00:00:00Z"
        })
      }),
      // A GREEN verdict names both SHAs too. The number on a passing run is the
      // one anybody would compare a later run against, so it is worth no less
      // than the number on a failing one.
      expect: [`${PIN.slice(0, 12)} → ${TIP.slice(0, 12)}`, "11 commit(s) behind", PIN, TIP]
    }
  ];

  let failed = 0;

  // THE CONTROL. Without it every case above could pass because the fixture is
  // broken in some further way that every branch reports unconditionally.
  const control = fs.mkdtempSync(path.join(os.tmpdir(), "skills-drift-control-"));
  writeLockFixture(control, PIN);
  const clean = await detectDrift({ cliRoot: control, read: scriptedReader(inSync) });
  const cleanRendered = [clean.message, ...clean.detail].join("\n");
  if (clean.state === "CURRENT" && clean.code === "IN_SYNC" && cleanRendered.includes(PIN)) {
    console.log("  ok    a pin equal to upstream is CURRENT/IN_SYNC, and names the sha");
  } else {
    failed += 1;
    console.error(
      `  FAIL  a pin equal to upstream reported ${clean.state}/${clean.code}` +
        (cleanRendered.includes(PIN) ? "" : " and never named the sha it compared")
    );
  }
  fs.rmSync(control, { recursive: true, force: true });

  for (const testCase of cases) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "skills-drift-selftest-"));
    writeLockFixture(root, PIN);
    testCase.mutate?.(root);
    const verdict = await detectDrift({ cliRoot: root, read: testCase.read });
    const rendered = [verdict.message, ...verdict.detail].join("\n");
    const missing = (testCase.expect ?? []).filter((needle) => !rendered.includes(needle));

    if (
      verdict.state === testCase.state &&
      verdict.code === testCase.code &&
      missing.length === 0
    ) {
      console.log(`  ok    ${testCase.name} → ${verdict.state}/${verdict.code}`);
    } else if (verdict.state !== testCase.state || verdict.code !== testCase.code) {
      failed += 1;
      console.error(
        `  FAIL  ${testCase.name} → expected ${testCase.state}/${testCase.code}, ` +
          `got ${verdict.state}/${verdict.code}`
      );
    } else {
      failed += 1;
      console.error(
        `  FAIL  ${testCase.name} → ${verdict.state}/${verdict.code} is right but the ` +
          `verdict never said: ${missing.map((m) => JSON.stringify(m)).join(", ")}`
      );
      console.error(`        rendered: ${rendered.split("\n")[0]}`);
    }
    fs.rmSync(root, { recursive: true, force: true });
  }

  // The three states must map to three DIFFERENT exit codes. A green that
  // cannot be told from a red by a caller is the same defect one layer out.
  const distinct = new Set(Object.values(EXIT_CODE));
  if (distinct.size === 3) {
    console.log("  ok    CURRENT, DRIFT and CANNOT_CHECK carry distinct exit codes");
  } else {
    failed += 1;
    console.error(`  FAIL  the three states collapse into ${distinct.size} exit code(s)`);
  }

  if (failed > 0) {
    console.error(`\ncheck-skills-drift --self-test: ${failed} case(s) no longer detectable.`);
    return 1;
  }
  console.log(`\ncheck-skills-drift --self-test: ${cases.length + 2} case(s) behave.`);
  return 0;
}
