import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * THE FOUR-OUTCOME CONTRACT, END TO END, THROUGH THE REAL RUNNER.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 WHY THIS FILE EXISTS: THE FIXTURE RAN NOWHERE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `fake-nexus.ts` beside this file was written to prove the sweep's reporting,
 * and NOTHING IMPORTED OR SPAWNED IT. Vitest collects `test/**\/*.test.ts`, so a
 * bare fixture is never run. Every exit code this lane claimed — 0, 1, 4, 7, the
 * 4-and-7 rows, the refusal-vs-rejection split — was produced by a human typing
 * a command, and none of it was protected by anything.
 *
 * ⚠️ AND THAT WENT UNNOTICED BECAUSE THE PERSON CHECKING IT WAS THE PERSON
 * RUNNING IT. An instrument you drive by hand feels exercised precisely because
 * you keep exercising it. This is the same defect that put the refusal parser in
 * `scripts/` and the outcome mapping inside a file ending in `main()` — the
 * third instance in one change, each one level further out.
 *
 * ── WHAT IS HERE AND WHAT IS IN THE UNIT SPEC ───────────────────────────────
 *
 * The disposition MAPPING is exhaustively covered in `src/id-graph.outcome.test.ts`
 * over the whole exit taxonomy, in microseconds. This file covers what a pure
 * function cannot: that the runner is WIRED to it, that the process exit codes
 * are what the contract says, and that the counts reach the report.
 *
 * Each case spawns the real sweep against the fake binary — about 3.4s, and 0.7s
 * for the preflight case, which refuses before running any leaf.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 ONE ARM PER `it`, FILE-WIDE. ORDERING THEM IS NOT AN ALTERNATIVE TO IT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A failing assertion THROWS, so it aborts the rest of its own `it`. The unit of
 * a test result is the BLOCK: a block that reds under a mutant proves ONE of its
 * arms can fail — the first one that did — and the report has no field for the
 * arms below it, which did not pass, did not fail and did not run. A mutation
 * battery structurally cannot see this, because the score's granularity IS the
 * block: every arm below the first failure is scored by nothing while the badge
 * says the block was executed.
 *
 * This is not vitest-specific. jest's `expect` throws identically, so the same
 * shielding holds in `apps/backend`.
 *
 * ── MEASURED ON THIS FILE, READING WHAT THE `→` LINES NAME ──────────────────
 *
 * vitest prints one `→` line per assertion that FIRED. An arm absent from that
 * text was NOT SCORED, whatever colour its block is.
 *
 *   · N1, `bindCommand(list, AGENT_SKILL_LIST_CONTRACT)` deleted — the leaf
 *     leaves the graph, so its row is gone AND `vanished` falls 4 -> 3.
 *     In the old single-block shape, one arrow: the `agent-skill list` name.
 *     The count, `failed`, the `not.toMatch` and `reached` were UNSCORED.
 *   · N2, `bindCommand(list, TOOL_LIST_CONTRACT)` deleted — `agent-tool list`
 *     is the fourth `agentId` consumer and the one that block does not name,
 *     so only the count moves. One arrow: `expected 3 to be 4`.
 *
 * ⚠️ SO THE ORDER OF THE ARMS IS NOT THE VARIABLE, AND MOVING THEM FIXES ONE
 * MUTANT RATHER THAN THE CLASS. With the count first, N1 scores the count and
 * shields all three names; with the names first, N1 scores one name and shields
 * the count. Which arm goes unscored depends on the MUTANT, so no ordering
 * convention closes it — the same pair measured in an isolated lab, on a
 * two-arm subject with nothing else in it, reaches the same conclusion.
 *
 * ✅ ONE ARM PER `it` IS THE ONLY SHAPE THAT SAYS WHICH PROPERTY SURVIVED, AND
 * HERE IT COSTS NOTHING. The stated price of this cure is re-running the setup
 * per block, which would be real at this file's ~5s process spawn; hoisting the
 * spawn into one `beforeAll` per `describe` pays it ONCE, so N `it`s cost one
 * sweep exactly as the single block did. The spawn count is unchanged by this
 * shape — only the number of results it reports.
 *
 * `expect.soft` was the cheaper candidate and is refused: it does not exist
 * under jest, so the shape would not transfer to `apps/backend`; it does not
 * survive a non-assertion throw — `counts()` below throws when there is no
 * summary line — and its arms still collapse into one `it` result.
 *
 * ⚠️ A `beforeAll` THAT THROWS REDS EVERY `it` UNDER IT, AND THAT IS THE HONEST
 * RENDERING RATHER THAN A REGRESSION. When `counts()` finds no summary line the
 * whole `describe` is unproven, which is exactly what the report then says — in
 * the old shape the same throw retired one block and left the others silent.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `sweep()` IS ASYNC ON PURPOSE. NEVER PUT `spawnSync` BACK.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * vitest's worker talks to the main process over birpc, whose call timeout is a
 * HARD-CODED 60000ms with no knob anywhere: `DEFAULT_TIMEOUT = 6e4` in
 * `vitest/dist/chunks/index.B521nVV-.js:3`, armed per call at :56-70 and cleared
 * at :132-138 only when a reply is actually PROCESSED. The one place vitest could
 * inject a different value, `createForksRpcOptions` in
 * `vitest/dist/chunks/utils.CAioKnHs.js:25`, passes serialize/deserialize/post/on
 * and no timeout at all. No config option, no CLI flag, no env var reaches it —
 * `testTimeout`/`hookTimeout` are a different budget and cannot raise or lower it.
 *
 * `spawnSync` blocks this worker's event loop for the child's whole lifetime, so
 * the reply cannot be read while a case runs, and it is UN-YIELDABLE: the usual
 * cure of awaiting a `setImmediate` every so often has nowhere to go inside it.
 * Once this file's cumulative in-worker time passed 60s the run ended
 * `Errors 1 error` / `Timeout calling "onTaskUpdate"` at exit 1 with EVERY test
 * reported PASSED above it — a red no assertion can explain, which reads as a
 * flake and is not one. Measured on this exact file, same code, same cases:
 * 69.38s of `tests` FAILED, 44.18s PASSED.
 *
 * ⚠️ AND THE TIMER WINS THE RACE EVEN THOUGH THE REPLY ARRIVED FIRST. The
 * `onTaskUpdate` calls are fire-and-forget — sent, timer armed, promise parked,
 * and only awaited when the file ends — so nothing forces the loop to turn in
 * between. When it finally does, libuv runs the TIMERS phase before the POLL
 * phase, so the expired timers fire before the replies sitting in the IPC buffer
 * that would have cleared them. The reply is not late; it is merely never read
 * in time.
 *
 * An async `spawn` leaves the loop live between chunks, so the reply is processed
 * and the ceiling is unreachable no matter how many cases this file grows.
 * If you make `sweep()` synchronous again, this file starts failing by WALL CLOCK
 * rather than by assertion, and the failure will not name a test.
 *
 * debt: each case still shells out through `pnpm exec tsx`, and most of a case is
 *       that startup rather than the sweep — measured 5-10s per case on the
 *       Endurance, so this file's wall time scales at roughly 7s x SWEEPS. Note
 *       the multiplier is sweeps and not `it`s: one-arm-per-`it` multiplies the
 *       results, never the spawns. Calling the tsx binary directly would cut it,
 *       at the cost of resolving that binary ourselves in both a local pnpm
 *       workspace and CI, which is a different change with a different blast
 *       radius. It is no longer a CORRECTNESS ceiling: async `spawn` means a slow
 *       file is only slow.
 *       Upgrade trigger: this file passing ~2 minutes on CI, or the CLI step
 *       becoming the critical path of the `Tests: Vitest` job.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, "..", "..", "scripts", "id-thread-sweep.ts");
const FIXTURE = join(HERE, "fake-nexus.ts");

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Async on purpose — the file header holds the whole argument. Keep every hook
 * `async`, and never reach for `spawnSync` here. */
function sweep(env: Readonly<Record<string, string>>): Promise<Run> {
  return new Promise<Run>((resolve, reject) => {
    const proc = spawn("pnpm", ["exec", "tsx", RUNNER], {
      cwd: join(HERE, "..", ".."),
      env: { ...process.env, NEXUS_BIN: `node ${FIXTURE}`, ...env }
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    proc.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    // `spawnSync` reported a failure to START as a null status, which this helper
    // then flattened to -1 alongside a genuine signal kill. Rejecting instead means
    // "pnpm is not on PATH" names itself rather than arriving as an exit-code
    // mismatch in whichever case happened to run first.
    proc.on("error", reject);
    // `close` rather than `exit`: it fires once both pipes are drained, so the last
    // chunk of the summary line cannot be lost. `code` is null when a signal killed
    // the child, which is the -1 the assertions already understand.
    proc.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/** `<n> reached · <n> skipped (<n> no-id, <n> vanished, <n> needs-input) · <n> failed` */
function counts(stdout: string): {
  reached: number;
  noId: number;
  vanished: number;
  needsInput: number;
  failed: number;
} {
  const line =
    /(\d+) reached · (\d+) skipped \((\d+) no-id, (\d+) vanished, (\d+) needs-input\) · (\d+) failed/.exec(
      stdout
    );
  if (line === null) throw new Error(`no summary line in:\n${stdout.slice(-500)}`);
  return {
    reached: Number(line[1]),
    noId: Number(line[3]),
    vanished: Number(line[4]),
    needsInput: Number(line[5]),
    failed: Number(line[6])
  };
}

/** `provisioned=<n> of <n> executable (floor <n>) - ...` — its OWN line, beside
 * the summary. The runner keeps it out of the `Summary:` line on purpose, so
 * `counts` above stays byte-compatible and every case that predates the floor
 * keeps measuring what it always did. */
function provisionedOf(stdout: string): {
  provisioned: number;
  executable: number;
  floor: number;
} {
  const line = /provisioned=(\d+) of (\d+) executable \(floor (\d+)\)/.exec(stdout);
  if (line === null) throw new Error(`no provisioned line in:\n${stdout.slice(-500)}`);
  return { provisioned: Number(line[1]), executable: Number(line[2]), floor: Number(line[3]) };
}

/** Hook budget for a `describe` whose `beforeAll` spawns ONE sweep. `hookTimeout`
 * is its own budget and does not inherit a case's, so every hook states it. */
const ONE_SWEEP = 60_000;
/** Two sweeps in one hook, or a sweep whose fixture writes a state directory. */
const SLOW_SWEEP = 90_000;

describe("the id-thread sweep, end to end", () => {
  describe("when everything answers", () => {
    let run: Run;
    let summary: ReturnType<typeof counts>;

    beforeAll(async () => {
      run = await sweep({ FAKE_MODE: "normal" });
      summary = counts(run.stdout);
    }, ONE_SWEEP);

    it("exits 0", () => {
      expect(run.code).toBe(0);
    });

    it("reports what it reached", () => {
      expect(summary.reached).toBeGreaterThan(0);
    });

    it("fails nothing", () => {
      expect(summary.failed).toBe(0);
    });

    // Both skip kinds named separately, never one total — so each gets its own
    // block, or one of them is only ever scored by the other's failure.
    it("reports no no-id skips", () => {
      expect(summary.noId).toBe(0);
    });

    it("reports no needs-input skips", () => {
      expect(summary.needsInput).toBe(0);
    });
  });

  describe("when a route answers with the wrong shape", () => {
    let run: Run;
    let summary: ReturnType<typeof counts>;

    beforeAll(async () => {
      run = await sweep({ FAKE_MODE: "badshape" });
      summary = counts(run.stdout);
    }, ONE_SWEEP);

    it("exits 1", () => {
      expect(run.code).toBe(1);
    });

    it("counts exactly one failure", () => {
      expect(summary.failed).toBe(1);
    });

    it("NAMES the leaf that failed", () => {
      expect(run.stdout).toMatch(/^FAILED\s+agent-tool list/m);
    });
  });

  describe("when the id source is empty", () => {
    // The row that matters most: nothing existed to test with is not a pass,
    // and a run that reached nothing must not report success.
    let run: Run;
    let summary: ReturnType<typeof counts>;

    beforeAll(async () => {
      run = await sweep({ FAKE_MODE: "empty" });
      summary = counts(run.stdout);
    }, ONE_SWEEP);

    it("exits 7", () => {
      expect(run.code).toBe(7);
    });

    it("reaches nothing", () => {
      expect(summary.reached).toBe(0);
    });

    it("SKIPS rather than passing", () => {
      expect(summary.noId).toBeGreaterThan(0);
    });

    it("fails nothing", () => {
      expect(summary.failed).toBe(0);
    });

    it("refuses on stderr with NONE was reached", () => {
      expect(run.stderr).toContain("NONE was reached");
    });

    it("names the producer that came back empty on every skip", () => {
      expect(run.stdout).toMatch(/^SKIPPED_NO_ID\s+\S+.*returned zero rows/m);
    });
  });

  describe("when the API is unreachable", () => {
    // No `counts()` here on purpose: a refusal prints no summary line, so
    // hoisting one would throw in the hook and red these arms for the wrong
    // reason.
    let run: Run;

    beforeAll(async () => {
      run = await sweep({ FAKE_MODE: "unreachable" });
    }, ONE_SWEEP);

    it("exits 4", () => {
      expect(run.code).toBe(4);
    });

    it("says it is not authenticated", () => {
      expect(run.stderr).toContain("not authenticated");
    });

    it("reports NO per-leaf verdicts, because a refusal claims nothing about any leaf", () => {
      expect(run.stdout).not.toMatch(/^(REACHED|SKIPPED_NO_ID|SKIPPED_NEEDS_INPUT|FAILED)\s/m);
    });
  });

  describe("a client-side refusal beside a server rejection, in ONE run", () => {
    // Both leaves exit 5. `CLI_INVALID_ARGUMENTS` means nothing was sent, so the
    // route is untested; `VALIDATION_ERROR` means the server refused a complete
    // request, so the route answered badly. A rule that softened every 5 would
    // report two skips and exit 0.
    let run: Run;
    let summary: ReturnType<typeof counts>;

    beforeAll(async () => {
      run = await sweep({
        FAKE_MODE: "normal",
        FAKE_REFUSE_LEAVES: "asset get:5:CLI_INVALID_ARGUMENTS,collection get:5:VALIDATION_ERROR"
      });
      summary = counts(run.stdout);
    }, ONE_SWEEP);

    it("exits 1", () => {
      expect(run.code).toBe(1);
    });

    it("counts the client-side refusal as ONE needs-input skip", () => {
      expect(summary.needsInput).toBe(1);
    });

    it("counts the server rejection as ONE failure", () => {
      expect(summary.failed).toBe(1);
    });

    it("names the refused leaf as SKIPPED_NEEDS_INPUT", () => {
      expect(run.stdout).toMatch(/^SKIPPED_NEEDS_INPUT\s+asset get/m);
    });

    it("names the rejected leaf as FAILED", () => {
      expect(run.stdout).toMatch(/^FAILED\s+collection get/m);
    });
  });
});

/**
 * THE CONCURRENT-DELETE RACE, ON DEMAND RATHER THAN ON LUCK.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THESE TWO CASES ARE ONE PAIR AND NEITHER IS EVIDENCE ALONE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The sweep threads a row its list route published, and `CLI: E2E flows` deletes
 * agents and collections on the same shared organisation while it runs. Four
 * measured `CLI: Sweep` runs: two red with a DIFFERENT id each time, two green -
 * and the green ones had a concurrent E2E run in flight, in its create phase.
 *
 * The cure has to hold BOTH ways, and a test of either half alone passes for a
 * rule that is wrong:
 *
 *   · a rule that softened every `not-found` passes the first case and deletes
 *     the signal the sweep exists for. The second case is what refuses it.
 *   · a rule that never softened one passes the second and leaves the flake. The
 *     first case is what refuses that.
 *
 * The only thing separating them is a second read of the producer, so both cases
 * hand the runner the same exit code and the same document, and differ ONLY in
 * whether the row is still listed.
 */
describe("a row deleted between the list call and the read", () => {
  describe("when the producer still lists other rows", () => {
    // `agent list` publishes a doomed row once, then never again; any consumer
    // handed it answers `not-found` (4) with a NOT_FOUND document - which is
    // precisely what the live 404s were. Three leaves consume `agentId`.
    let run: Run;
    let summary: ReturnType<typeof counts>;

    beforeAll(async () => {
      const state = mkdtempSync(join(tmpdir(), "id-thread-race-"));
      run = await sweep({
        FAKE_MODE: "normal",
        FAKE_VANISH_PRODUCERS: "agent list",
        FAKE_STATE_DIR: state
      });
      summary = counts(run.stdout);
    }, SLOW_SWEEP);

    it("exits 0", () => {
      expect(run.code).toBe(0);
    });

    it("fails nothing", () => {
      expect(summary.failed).toBe(0);
    });

    it("counts nothing as vanished, because the row was re-threaded", () => {
      expect(summary.vanished).toBe(0);
    });

    // The three agentId consumers were re-threaded onto the surviving row and
    // actually invoked - not skipped, not tolerated. One `it` each, because a
    // mutant that unbinds ONE of them must not be able to shield the other two.
    it("REACHES agent-collection list", () => {
      expect(run.stdout).toMatch(/^REACHED\s+agent-collection list/m);
    });

    it("REACHES version list", () => {
      expect(run.stdout).toMatch(/^REACHED\s+version list/m);
    });

    it("REACHES agent-tool list", () => {
      expect(run.stdout).toMatch(/^REACHED\s+agent-tool list/m);
    });
  });

  /**
   * 🔴 THE RACE AT FULL STRENGTH, END TO END. The doomed row was the producer's
   * ONLY row, so the re-read that proves the deletion comes back empty —
   * byte-identical to a producer that simply has nothing. Reported as "returned
   * zero rows" this renders as the ordinary skip a reader scrolls past, which is
   * the fifth outcome being hollowed out in the one case it was added for.
   *
   * This `describe` is the worked example the file header generalises: it was
   * split first, and the N1/N2 measurements quoted up there were taken on it.
   */
  describe("when the race takes the last row", () => {
    let run: Run;
    let summary: ReturnType<typeof counts>;

    // ONE spawn for every arm below. `hookTimeout` is its own budget and does not
    // inherit the 90_000 the cases carry, so it is stated here.
    beforeAll(async () => {
      const state = mkdtempSync(join(tmpdir(), "id-thread-race-last-"));
      run = await sweep({
        FAKE_MODE: "normal",
        FAKE_VANISH_PRODUCERS: "agent list",
        FAKE_VANISH_LEAVES_NOTHING: "1",
        FAKE_STATE_DIR: state
      });
      summary = counts(run.stdout);
    }, SLOW_SWEEP);

    it("reports SKIPPED_ID_VANISHED for agent-collection list", () => {
      expect(run.stdout).toMatch(/^SKIPPED_ID_VANISHED\s+agent-collection list/m);
    });

    it("reports SKIPPED_ID_VANISHED for version list", () => {
      expect(run.stdout).toMatch(/^SKIPPED_ID_VANISHED\s+version list/m);
    });

    it("reports SKIPPED_ID_VANISHED for agent-skill list", () => {
      expect(run.stdout).toMatch(/^SKIPPED_ID_VANISHED\s+agent-skill list/m);
    });

    it("counts every agentId consumer as vanished", () => {
      // Four leaves take `agentId`, and none of them may be called a no-id skip.
      // The three named above are three of the four; this is the only arm that
      // sees the fourth, which is why it must be able to fail on its own.
      expect(summary.vanished).toBe(4);
    });

    it("fails nothing", () => {
      expect(summary.failed).toBe(0);
    });

    it("does NOT report the vanished row as SKIPPED_NO_ID", () => {
      // The whole point: this row is NOT the one that says "returned zero rows".
      expect(run.stdout).not.toMatch(/^SKIPPED_NO_ID\s+agent-collection list/m);
    });

    it("still reaches the producers the race did not touch", () => {
      expect(summary.reached).toBeGreaterThan(0);
    });
  });

  describe("when the row its own producer is STILL listing answers not-found", () => {
    // The negative control, and the whole reason the cure is a second READ and
    // not a tolerance. Same exit code, same document, same category - and the
    // row never vanishes, so nothing may retire the red.
    let run: Run;
    let summary: ReturnType<typeof counts>;

    beforeAll(async () => {
      run = await sweep({
        FAKE_MODE: "normal",
        FAKE_REFUSE_LEAVES: "collection get:4:NOT_FOUND"
      });
      summary = counts(run.stdout);
    }, SLOW_SWEEP);

    it("exits 1", () => {
      expect(run.code).toBe(1);
    });

    it("still FAILS the leaf", () => {
      expect(summary.failed).toBe(1);
    });

    it("retires nothing into the vanished count", () => {
      expect(summary.vanished).toBe(0);
    });

    it("puts the discriminator on the leaf's OWN row", () => {
      // ANCHORED to the leaf's own row rather than searched for anywhere in the
      // output. The note ends in a slice of a PRETTY-PRINTED error document, so a
      // free substring assertion would pass with the discriminator buried several
      // lines below the row a reader actually scans - which is where it landed
      // before it was moved to the front.
      expect(run.stdout).toMatch(
        /^FAILED\s+collection get\s+\[the id is STILL listed by its producer/m
      );
    });
  });
});

/**
 * A RE-READ THAT CANNOT BE PARSED IS EVIDENCE OF NOTHING — AND MUST NOT BLANK
 * EVERY LATER LEAF.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS THE SAME DEFECT THE PR EXISTS TO PREVENT, ARRIVING THROUGH THE CURE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `refreshProducers` stores a re-read into `bodyOf`, which is SHARED by every
 * leaf. Gating that write on the exit code alone lets a route answering 200 with
 * an error page replace a good stored list — and then later leaves that never
 * saw a not-found at all report `SKIPPED_NO_ID`, "returned zero rows", about a
 * producer whose good list this run is still holding.
 *
 * That is the exact substitution the fifth outcome was added to refuse, so a
 * test that only covers the vanish path leaves the same lie reachable one branch
 * over. The discriminator is `rowsFrom`: "parsed, and empty" PROVES the row is
 * gone, "did not parse" proves nothing.
 */
describe("a producer re-read that comes back unreadable", () => {
  // `agent list` publishes the doomed row once, so a consumer threads it and
  // gets a not-found — and the re-read that not-found triggers answers exit 0
  // with an error page. Three leaves consume `agentId`.
  let run: Run;
  let summary: ReturnType<typeof counts>;

  beforeAll(async () => {
    const state = mkdtempSync(join(tmpdir(), "id-thread-unreadable-"));
    run = await sweep({
      FAKE_MODE: "normal",
      FAKE_VANISH_PRODUCERS: "agent list",
      FAKE_UNREADABLE_REREAD: "agent list",
      FAKE_STATE_DIR: state
    });
    summary = counts(run.stdout);
  }, SLOW_SWEEP);

  // 🔴 THE WHOLE ASSERTION. Nothing here may be called an empty producer: the
  // run holds `agent list`'s good body and never stopped holding it.
  it("keeps the stored list rather than counting a no-id skip", () => {
    expect(summary.noId).toBe(0);
  });

  // ANCHORED per leaf rather than a free search for "returned zero rows" — the
  // notes carry pretty-printed error documents, so an unanchored negative can
  // pass for the wrong reason. One `it` per leaf, so a mutant that removes one
  // leaf cannot shield the other two negatives or anything below them.
  it("does not report agent-collection list as SKIPPED_NO_ID", () => {
    expect(run.stdout).not.toMatch(/^SKIPPED_NO_ID\s+agent-collection list/m);
  });

  it("does not report version list as SKIPPED_NO_ID", () => {
    expect(run.stdout).not.toMatch(/^SKIPPED_NO_ID\s+version list/m);
  });

  it("does not report agent-tool list as SKIPPED_NO_ID", () => {
    expect(run.stdout).not.toMatch(/^SKIPPED_NO_ID\s+agent-tool list/m);
  });

  // The re-read measured NOTHING, so the not-found is NOT retired into a race.
  // It stands as a failure, which is the conservative half of the same rule.
  it("retires nothing into the vanished count", () => {
    expect(summary.vanished).toBe(0);
  });

  it("FAILS agent-collection list", () => {
    expect(run.stdout).toMatch(/^FAILED\s+agent-collection list/m);
  });

  it("FAILS version list", () => {
    expect(run.stdout).toMatch(/^FAILED\s+version list/m);
  });

  it("FAILS agent-tool list", () => {
    expect(run.stdout).toMatch(/^FAILED\s+agent-tool list/m);
  });
});

/**
 * A RUN THAT REACHED ONE LEAF AND SKIPPED TWENTY-FIVE USED TO EXIT 0.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THESE CASES ARE ABOUT THE POPULATION AND NOT ABOUT THE NUMBER
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The floor sits on `provisioned` — `executable` minus `SKIPPED_NO_ID` — and the
 * whole design is which noun that is. Three properties, and each has a case
 * below that fails if the floor is moved onto `reached`:
 *
 *   · seeding a fixture RAISES provisioned, so the repair moves it the right way
 *   · fixing a route leaves it FLAT, so a cure cannot trip it
 *   · the concurrent-delete race CANNOT MOVE IT — a vanished row HAD a fixture
 *
 * The third is the discriminating one and it is live: `NOT_FOUND_REATTEMPTS`
 * bounds that race and does not remove it. `the floor does NOT fire on the
 * concurrent-delete race` below is the case that refuses a floor on `reached`,
 * and `exits 8` is the case that refuses a floor of zero. Neither one kills the
 * other's mutant, which is what makes them a pair rather than a duplicate.
 *
 * ── HOW A CASE LANDS AT A CHOSEN `provisioned` ──────────────────────────────
 *
 * 29 executable leaves. `tracks list` feeds 10 of them, `agent list` 4,
 * `collection list` 3, `execution list` 2, `document list` 2.
 * `FAKE_EMPTY_PRODUCERS` empties named
 * producers only, so the arithmetic is exact and the boundary is reachable from
 * both sides. Every case asserts the number it landed on rather than only the
 * exit code: a leaf added to the graph then reds these cases by NAME with the
 * new figure, instead of sliding one of them past the boundary in silence.
 */

/** 29 - (10 + 4 + 3 + 2) = 10, EXACTLY the floor, which must pass. */
const AT_FLOOR_PRODUCERS = "tracks list,agent list,collection list,execution list";
/** 29 - (10 + 4 + 3 + 2 + 2) = 8, under the floor, which must not. */
const BELOW_FLOOR_PRODUCERS = "tracks list,agent list,collection list,execution list,document list";

describe("the provisioned floor", () => {
  describe("when too few leaves had an id", () => {
    let run: Run;
    let summary: ReturnType<typeof counts>;
    let provisioned: ReturnType<typeof provisionedOf>;

    beforeAll(async () => {
      run = await sweep({
        FAKE_MODE: "normal",
        FAKE_EMPTY_PRODUCERS: BELOW_FLOOR_PRODUCERS
      });
      summary = counts(run.stdout);
      provisioned = provisionedOf(run.stdout);
    }, ONE_SWEEP);

    it("reports the provisioned population it landed on", () => {
      expect(provisioned).toEqual({ provisioned: 8, executable: 29, floor: 10 });
    });

    // Neither of the other two non-zero rungs applies, so 8 is the only code
    // that can be under test here — and each of those three facts is its own
    // block, because together they are what makes that true.
    it("reached 8", () => {
      expect(summary.reached).toBe(8);
    });

    it("fails nothing", () => {
      expect(summary.failed).toBe(0);
    });

    it("counts 21 no-id skips", () => {
      expect(summary.noId).toBe(21);
    });

    it("exits 8", () => {
      expect(run.code).toBe(8);
    });

    it("refuses on stderr with BELOW THE PROVISIONED FLOOR", () => {
      expect(run.stderr).toContain("BELOW THE PROVISIONED FLOOR");
    });

    it("is NOT the nothing-reached refusal, which is a different world", () => {
      expect(run.stderr).not.toContain("NONE was reached");
    });
  });

  describe("at EXACTLY the floor", () => {
    let run: Run;
    let summary: ReturnType<typeof counts>;
    let provisioned: ReturnType<typeof provisionedOf>;

    beforeAll(async () => {
      run = await sweep({
        FAKE_MODE: "normal",
        FAKE_EMPTY_PRODUCERS: AT_FLOOR_PRODUCERS
      });
      summary = counts(run.stdout);
      provisioned = provisionedOf(run.stdout);
    }, ONE_SWEEP);

    it("sits exactly on the floor, so the comparison is `<` and not `<=`", () => {
      expect(provisioned.provisioned).toBe(provisioned.floor);
    });

    it("reports the provisioned population it landed on", () => {
      expect(provisioned).toEqual({ provisioned: 10, executable: 29, floor: 10 });
    });

    it("fails nothing", () => {
      expect(summary.failed).toBe(0);
    });

    it("exits 0", () => {
      expect(run.code).toBe(0);
    });
  });

  describe("on the concurrent-delete race, however many rows it takes", () => {
    // 🔴 THE SELECTIVITY CASE. 21 leaves are SKIPPED_ID_VANISHED, so only 8 are
    // reached — UNDER the floor of 10 — and every one of those 21 HAD a
    // fixture, so provisioned is still the full 29 and the run passes. A floor
    // keyed on `reached` exits 8 here and calls a race a coverage outage.
    let run: Run;
    let summary: ReturnType<typeof counts>;

    beforeAll(async () => {
      const state = mkdtempSync(join(tmpdir(), "id-thread-floor-race-"));
      run = await sweep({
        FAKE_MODE: "normal",
        FAKE_VANISH_PRODUCERS: BELOW_FLOOR_PRODUCERS,
        FAKE_VANISH_LEAVES_NOTHING: "1",
        FAKE_STATE_DIR: state
      });
      summary = counts(run.stdout);
    }, SLOW_SWEEP);

    it("counts 21 rows as vanished", () => {
      expect(summary.vanished).toBe(21);
    });

    it("counts none of them as a no-id skip", () => {
      expect(summary.noId).toBe(0);
    });

    it("fails nothing", () => {
      expect(summary.failed).toBe(0);
    });

    it("reached 8", () => {
      // The half that makes this discriminating: fewer reached than the floor.
      expect(summary.reached).toBe(8);
    });

    it("reached FEWER than the floor, which is what makes the case discriminating", () => {
      // 🚨 AGAINST A LITERAL, NEVER AGAINST THE FLOOR THIS RUN PRINTED. Reading
      // it back off the subject couples THIS arm to the floor's VALUE — and then
      // the mutant that neuters the value to 0 kills this arm too, so the
      // population-swap mutant's kill set becomes a SUBSET of the value mutant's
      // and the pair stops proving anything the value mutant did not already
      // prove. Measured: with `toBeLessThan(provisionedOf(...).floor)` here, the
      // value mutant killed 4 arms including this one and the population mutant
      // killed only this one; without it, 3 and 1, disjoint.
      expect(summary.reached).toBeLessThan(10);
    });

    it("keeps the FULL provisioned population, because a vanished row HAD a fixture", () => {
      expect(provisionedOf(run.stdout).provisioned).toBe(29);
    });

    it("exits 0", () => {
      expect(run.code).toBe(0);
    });
  });

  describe("one namespace short", () => {
    // The floor is an ADDITION. A run one namespace short is still green, and
    // the disclosure that says which namespace is unexercised — and what share
    // of the harness's reach that is — must still be printed.
    let run: Run;
    let summary: ReturnType<typeof counts>;

    beforeAll(async () => {
      run = await sweep({ FAKE_MODE: "normal", FAKE_EMPTY_PRODUCERS: "tracks list" });
      summary = counts(run.stdout);
    }, ONE_SWEEP);

    it("exits 0", () => {
      expect(run.code).toBe(0);
    });

    it("reports the provisioned population it landed on", () => {
      expect(provisionedOf(run.stdout).provisioned).toBe(19);
    });

    it("keeps NOTHING EXISTED TO TEST WITH", () => {
      expect(run.stdout).toContain("NOTHING EXISTED TO TEST WITH");
    });

    it("names the unexercised namespace and its share of the harness", () => {
      expect(run.stdout).toMatch(/^\s+10 leaves in `tracks` unexercised - 34% of this harness/m);
    });

    it("names the remedy", () => {
      expect(run.stdout).toContain("seed-sweep-fixtures.sh");
    });

    // Three counters, still separate, still in the Summary line — so each is a
    // block of its own, which is what "separate" has to mean to be provable.
    it("keeps the no-id counter beside it", () => {
      expect(summary.noId).toBe(10);
    });

    it("keeps the vanished counter beside it", () => {
      expect(summary.vanished).toBe(0);
    });

    it("keeps the needs-input counter beside it", () => {
      expect(summary.needsInput).toBe(0);
    });
  });

  describe("the thin run against the total outage", () => {
    // The exit codes are a vocabulary and no two may mean two things. A total
    // outage and a thin run are different worlds, so they get different numbers
    // and different refusals.
    let outage: Run;
    let thin: Run;

    beforeAll(async () => {
      outage = await sweep({ FAKE_MODE: "empty" });
      thin = await sweep({
        FAKE_MODE: "normal",
        FAKE_EMPTY_PRODUCERS: BELOW_FLOOR_PRODUCERS
      });
    }, SLOW_SWEEP);

    it("gives the outage 7", () => {
      expect(outage.code).toBe(7);
    });

    it("gives the thin run 8", () => {
      expect(thin.code).toBe(8);
    });

    it("gives the thin run a code of its OWN", () => {
      expect(thin.code).not.toBe(outage.code);
    });

    it("refuses the outage with NONE was reached", () => {
      expect(outage.stderr).toContain("NONE was reached");
    });

    it("does NOT refuse the thin run with NONE was reached", () => {
      expect(thin.stderr).not.toContain("NONE was reached");
    });

    it("refuses the thin run with BELOW THE PROVISIONED FLOOR", () => {
      expect(thin.stderr).toContain("BELOW THE PROVISIONED FLOOR");
    });

    it("does NOT refuse the outage with BELOW THE PROVISIONED FLOOR", () => {
      expect(outage.stderr).not.toContain("BELOW THE PROVISIONED FLOOR");
    });
  });

  describe("a FAILED leaf on a run that is ALSO below the floor", () => {
    // 🚨 THE PRECEDENCE, PINNED. A broken route is a finding about the product;
    // the floor is a finding about the environment. The floor's only marginal
    // value is on a run that would otherwise be GREEN, so it must not overwrite
    // the one code a reader acts on. Moving it above this rung reds here.
    let run: Run;
    let summary: ReturnType<typeof counts>;

    beforeAll(async () => {
      run = await sweep({
        FAKE_MODE: "normal",
        FAKE_EMPTY_PRODUCERS: BELOW_FLOOR_PRODUCERS,
        FAKE_FAIL_LEAVES: "asset get"
      });
      summary = counts(run.stdout);
    }, ONE_SWEEP);

    it("counts the failure", () => {
      expect(summary.failed).toBe(1);
    });

    it("is genuinely below the floor, so both rungs are live at once", () => {
      expect(provisionedOf(run.stdout).provisioned).toBe(8);
    });

    it("keeps exit 1, never the floor's code", () => {
      expect(run.code).toBe(1);
    });

    it("NAMES the leaf that failed", () => {
      expect(run.stdout).toMatch(/^FAILED\s+asset get/m);
    });
  });
});
