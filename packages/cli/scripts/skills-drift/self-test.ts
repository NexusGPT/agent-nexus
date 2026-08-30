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
  mergeBase?: string;
  /**
   * OMITTED means the `files` KEY IS ABSENT from the payload — which is a real
   * shape, proven live on a paged compare where `status` and `ahead_by` stayed
   * correct and `files` simply was not there. An empty array is a DIFFERENT and
   * legitimate answer. Conflating the two is the likeliest bug in this
   * classification, so the fixture has to be able to express both.
   */
  files?: unknown[];
}): ReadResult {
  const body: Record<string, unknown> = {
    status: params.status,
    ahead_by: params.aheadBy,
    behind_by: params.behindBy,
    base_commit: { commit: { committer: { date: params.baseDate } } }
  };
  if (params.mergeBase !== undefined) body.merge_base_commit = { sha: params.mergeBase };
  if (params.files !== undefined) body.files = params.files;
  return { kind: "ok", body };
}

/**
 * A `files` array with a known count per surface.
 *
 * Only `filename` is set, because only `filename` is read: `patch` is silently
 * absent on 64 of 179 live entries with no flag, so a fixture carrying it would
 * model a payload the real one does not always send.
 */
function fileEntries(spec: {
  skills?: number;
  hooks?: number;
  agents?: number;
  settings?: number;
  other?: number;
}): { filename: string }[] {
  const out: { filename: string }[] = [];
  for (let i = 0; i < (spec.skills ?? 0); i += 1) out.push({ filename: `skills/s${i}/SKILL.md` });
  for (let i = 0; i < (spec.hooks ?? 0); i += 1) out.push({ filename: `hooks/h${i}.py` });
  for (let i = 0; i < (spec.agents ?? 0); i += 1) out.push({ filename: `agents/a${i}.md` });
  for (let i = 0; i < (spec.settings ?? 0); i += 1) out.push({ filename: "settings.json" });
  for (let i = 0; i < (spec.other ?? 0); i += 1) out.push({ filename: `tools/t${i}.sh` });
  return out;
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
  const BASE = "c".repeat(40);
  const HEAD_PATH = `/commits/${BRANCH}`;
  const COMPARE_PATH = "/compare/";
  // The forward and reverse compares are two calls to the same endpoint,
  // separated only by which sha comes first. A shared `/compare/` prefix
  // answers both with one body, which would hide a direction swap entirely.
  const FORWARD_PATH = `/compare/${PIN}...`;
  const REVERSE_PATH = `/compare/${TIP}...`;

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
    /**
     * Substrings the rendered verdict must NOT contain.
     *
     * Presence-only assertions cannot tell an EMPTY `files` array from a
     * MISSING `files` key, because both render *something*. The empty array is
     * a real, correct answer and the missing key is a refusal, so the case that
     * separates them has to be able to say "and it did not call this a
     * refusal". Without this, that pair of cases is vacuous.
     */
    reject?: string[];
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
    },

    // ── WHICH surface drifted ────────────────────────────────────────────────
    //
    // Every case here breaks exactly ONE thing and demands a specific STATE and
    // CODE back alongside the classification, because the whole risk of adding
    // a second network call and a second parser is that one of them quietly
    // becomes load-bearing for the verdict.
    {
      name: "diverged: both directions classified, and hooks/ counted",
      state: "DRIFT",
      code: "LOCK_DIVERGED",
      read: scriptedReader({
        [HEAD_PATH]: commitBody(TIP, "2026-08-30T00:00:00Z"),
        // Distinct prefixes, because the forward and reverse compares are two
        // different calls to the same endpoint and a shared `/compare/` prefix
        // would answer both with the same body — which would make a reversed
        // reading of the two directions invisible here.
        [FORWARD_PATH]: compareBody({
          status: "diverged",
          aheadBy: 66,
          behindBy: 7,
          baseDate: "2026-08-20T00:00:00Z",
          mergeBase: BASE,
          // The live shape on 2026-08-30, so the fixture is not a shape nobody
          // has ever seen: 134 + 18 + 18 + 1 + 8 = 179.
          files: fileEntries({ skills: 134, hooks: 18, agents: 18, settings: 1, other: 8 })
        }),
        [REVERSE_PATH]: compareBody({
          status: "diverged",
          aheadBy: 7,
          behindBy: 66,
          baseDate: "2026-08-20T00:00:00Z",
          mergeBase: BASE,
          // What a bump would DELETE. Live today this side holds a 416-line
          // skill that exists at the pin and not on main, and the FORWARD
          // compare cannot see it at all.
          files: fileEntries({ skills: 5, other: 1 })
        })
      }),
      expect: [
        `merge base ${BASE}`,
        "arriving  179 file(s) — skills/ 134 · hooks/ 18 · agents/ 18 · settings.json 1 · other 8",
        "departing 6 file(s) — skills/ 5 · hooks/ 0 · agents/ 0 · settings.json 0 · other 1"
      ]
    },
    {
      name: "plain behind: departing is absent BY CONSTRUCTION, not refused",
      state: "DRIFT",
      code: "LOCK_BEHIND",
      read: scriptedReader({
        [HEAD_PATH]: commitBody(TIP, "2026-08-30T00:00:00Z"),
        [FORWARD_PATH]: compareBody({
          status: "ahead",
          aheadBy: 64,
          behindBy: 0,
          baseDate: "2026-08-01T00:00:00Z",
          mergeBase: BASE,
          files: fileEntries({ skills: 3, hooks: 2, agents: 1, settings: 1 })
        })
      }),
      expect: [
        "arriving  7 file(s) — skills/ 3 · hooks/ 2 · agents/ 1 · settings.json 1 · other 0",
        "departing NONE (BEHIND_BY_ZERO)"
      ],
      // The whole point of the case: `behind_by === 0` PROVES nothing is
      // departing. Rendering that as a refusal would turn a measured absence
      // into an unread surface, which reads as risk that is not there.
      reject: ["departing NOT CLASSIFIED"]
    },
    {
      name: "empty files array is a MEASUREMENT, not a refusal",
      state: "DRIFT",
      code: "LOCK_BEHIND",
      read: scriptedReader({
        [HEAD_PATH]: commitBody(TIP, "2026-08-30T00:00:00Z"),
        [FORWARD_PATH]: compareBody({
          status: "ahead",
          aheadBy: 64,
          behindBy: 0,
          baseDate: "2026-08-01T00:00:00Z",
          mergeBase: BASE,
          files: []
        })
      }),
      expect: ["arriving  0 file(s)"],
      // The twin of the case below. `body.files ?? []` makes these two
      // identical, and this pair is the only thing that can tell them apart.
      reject: ["FILES_ABSENT", "arriving  NOT CLASSIFIED"]
    },
    {
      name: 'the "files" KEY is absent — refusal renders, verdict untouched',
      state: "DRIFT",
      code: "LOCK_BEHIND",
      read: scriptedReader({
        [HEAD_PATH]: commitBody(TIP, "2026-08-30T00:00:00Z"),
        [FORWARD_PATH]: compareBody({
          status: "ahead",
          aheadBy: 64,
          behindBy: 0,
          baseDate: "2026-08-01T00:00:00Z",
          mergeBase: BASE
        })
      }),
      // State and code are asserted as the ORDINARY drift verdict: a
      // classification that could not be taken must not colour the finding.
      expect: ["arriving  NOT CLASSIFIED (FILES_ABSENT)", "64 commit(s) behind"],
      reject: ["arriving  0 file(s)"]
    },
    {
      name: "files at the 300-entry page cap is indistinguishable from truncation",
      state: "DRIFT",
      code: "LOCK_BEHIND",
      read: scriptedReader({
        [HEAD_PATH]: commitBody(TIP, "2026-08-30T00:00:00Z"),
        [FORWARD_PATH]: compareBody({
          status: "ahead",
          aheadBy: 400,
          behindBy: 0,
          baseDate: "2026-08-01T00:00:00Z",
          mergeBase: BASE,
          // 300 is written here as a LITERAL rather than imported from the
          // implementation. Sharing the constant would make this case agree
          // with whatever the code says, which is not a test of anything.
          files: fileEntries({ skills: 300 })
        })
      }),
      expect: ["arriving  NOT CLASSIFIED (FILES_TRUNCATED)"],
      // No count may be printed off a list that might be cut off.
      reject: ["skills/ 300"]
    },
    {
      name: "reverse compare fails: arriving survives, departing refused, verdict untouched",
      state: "DRIFT",
      code: "LOCK_DIVERGED",
      read: scriptedReader({
        [HEAD_PATH]: commitBody(TIP, "2026-08-30T00:00:00Z"),
        [FORWARD_PATH]: compareBody({
          status: "diverged",
          aheadBy: 66,
          behindBy: 7,
          baseDate: "2026-08-20T00:00:00Z",
          mergeBase: BASE,
          files: fileEntries({ skills: 2, hooks: 4 })
        }),
        [REVERSE_PATH]: { kind: "http", status: 502, statusText: "Bad Gateway" }
      }),
      expect: [
        "arriving  6 file(s) — skills/ 2 · hooks/ 4",
        "departing NOT CLASSIFIED (COMPARE_FAILED)"
      ]
    },
    {
      name: "an entry with no filename is a refusal, never a throw",
      state: "DRIFT",
      code: "LOCK_BEHIND",
      read: scriptedReader({
        [HEAD_PATH]: commitBody(TIP, "2026-08-30T00:00:00Z"),
        [FORWARD_PATH]: compareBody({
          status: "ahead",
          aheadBy: 64,
          behindBy: 0,
          baseDate: "2026-08-01T00:00:00Z",
          mergeBase: BASE,
          files: [{ filename: "skills/ok.md" }, { additions: 3 }]
        })
      }),
      expect: ["arriving  NOT CLASSIFIED (FILES_UNREADABLE)"],
      // A partial count off a list one entry of which could not be read is a
      // confident wrong number, which is worse than no number.
      reject: ["skills/ 1"]
    },
    {
      name: "a transport that THROWS on the reverse compare is caught, not propagated",
      state: "DRIFT",
      code: "LOCK_DIVERGED",
      // Not a `ReadResult` this transport is supposed to produce — which is the
      // point. An unexpected throw escapes to the top-level handler, which
      // exits CANNOT_CHECK, so a decorative second call would be able to erase
      // a measured drift. Without this case the try/catch guarding it is itself
      // untested code claiming to be protection.
      read: async (apiPath) => {
        if (apiPath.startsWith(REVERSE_PATH)) throw new Error("socket hang up");
        if (apiPath.startsWith(HEAD_PATH)) return commitBody(TIP, "2026-08-30T00:00:00Z");
        return compareBody({
          status: "diverged",
          aheadBy: 66,
          behindBy: 7,
          baseDate: "2026-08-20T00:00:00Z",
          mergeBase: BASE,
          files: fileEntries({ skills: 2, hooks: 4 })
        });
      },
      expect: [
        "arriving  6 file(s) — skills/ 2 · hooks/ 4",
        "departing NOT CLASSIFIED (COMPARE_FAILED)"
      ]
    },
    {
      name: "files that is not an array is a refusal, never a throw",
      state: "DRIFT",
      code: "LOCK_BEHIND",
      read: scriptedReader({
        [HEAD_PATH]: commitBody(TIP, "2026-08-30T00:00:00Z"),
        [FORWARD_PATH]: {
          kind: "ok",
          body: {
            status: "ahead",
            ahead_by: 64,
            behind_by: 0,
            base_commit: { commit: { committer: { date: "2026-08-01T00:00:00Z" } } },
            files: "not an array"
          }
        }
      }),
      expect: ["arriving  NOT CLASSIFIED (FILES_UNREADABLE)"]
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

  // 🔴 THE INVARIANT, asserted as an INVARIANCE rather than as a value.
  //
  // The classification is decoration on a finding already in hand. A case above
  // pins one scenario's state and code, which a refactor could satisfy by
  // changing BOTH the with-files and the without-files expectations together.
  // This runs the identical scenario twice, differing only in whether `files`
  // is present, and requires the two verdicts to be the SAME verdict — so a
  // files failure that decayed the drift into CANNOT_CHECK reds here even if
  // every literal expectation elsewhere was updated to match it.
  //
  // Degrading to CANNOT_CHECK on a failed decorative call is the specific
  // regression: it discards a measured drift and reports "unknown", which is
  // the three-state contract collapsing in the one direction that hides a
  // finding.
  const invariance = fs.mkdtempSync(path.join(os.tmpdir(), "skills-drift-invariance-"));
  writeLockFixture(invariance, PIN);
  const scenario = (files?: unknown[]): GitHubReader =>
    scriptedReader({
      [HEAD_PATH]: commitBody(TIP, "2026-08-30T00:00:00Z"),
      [FORWARD_PATH]: compareBody({
        status: "ahead",
        aheadBy: 64,
        behindBy: 0,
        baseDate: "2026-08-01T00:00:00Z",
        mergeBase: BASE,
        files
      })
    });
  const withFiles = await detectDrift({
    cliRoot: invariance,
    read: scenario(fileEntries({ skills: 1, hooks: 1 }))
  });
  const withoutFiles = await detectDrift({ cliRoot: invariance, read: scenario() });
  fs.rmSync(invariance, { recursive: true, force: true });

  if (
    withFiles.state === withoutFiles.state &&
    withFiles.code === withoutFiles.code &&
    withoutFiles.state !== "CANNOT_CHECK"
  ) {
    console.log(
      `  ok    a files failure changes the DETAIL and not the VERDICT ` +
        `(${withoutFiles.state}/${withoutFiles.code} either way)`
    );
  } else {
    failed += 1;
    console.error(
      `  FAIL  a files failure MOVED the verdict: with files ${withFiles.state}/` +
        `${withFiles.code}, without files ${withoutFiles.state}/${withoutFiles.code}. ` +
        `A decorative classification must never take away a finding already in hand.`
    );
  }

  for (const testCase of cases) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "skills-drift-selftest-"));
    writeLockFixture(root, PIN);
    testCase.mutate?.(root);
    const verdict = await detectDrift({ cliRoot: root, read: testCase.read });
    const rendered = [verdict.message, ...verdict.detail].join("\n");
    const missing = (testCase.expect ?? []).filter((needle) => !rendered.includes(needle));
    const forbidden = (testCase.reject ?? []).filter((needle) => rendered.includes(needle));

    if (
      verdict.state === testCase.state &&
      verdict.code === testCase.code &&
      missing.length === 0 &&
      forbidden.length === 0
    ) {
      console.log(`  ok    ${testCase.name} → ${verdict.state}/${verdict.code}`);
    } else if (verdict.state !== testCase.state || verdict.code !== testCase.code) {
      failed += 1;
      console.error(
        `  FAIL  ${testCase.name} → expected ${testCase.state}/${testCase.code}, ` +
          `got ${verdict.state}/${verdict.code}`
      );
    } else if (missing.length > 0) {
      failed += 1;
      console.error(
        `  FAIL  ${testCase.name} → ${verdict.state}/${verdict.code} is right but the ` +
          `verdict never said: ${missing.map((m) => JSON.stringify(m)).join(", ")}`
      );
      console.error(`        rendered: ${rendered.split("\n")[0]}`);
    } else {
      failed += 1;
      console.error(
        `  FAIL  ${testCase.name} → ${verdict.state}/${verdict.code} is right but the ` +
          `verdict said what it must not: ${forbidden.map((m) => JSON.stringify(m)).join(", ")}`
      );
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
  // +3 standalone checks that are not table cases: the clean-tree control, the
  // files-failure invariance guard, and the exit-code distinctness assertion.
  console.log(`\ncheck-skills-drift --self-test: ${cases.length + 3} case(s) behave.`);
  return 0;
}
