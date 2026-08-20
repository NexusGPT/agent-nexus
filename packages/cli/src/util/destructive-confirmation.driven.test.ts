import { mkdirSync } from "node:fs";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "../exit-codes";

/**
 * EVERY DESTRUCTIVE COMMAND, DRIVEN WITH NO TERMINAL AND NO `--yes`.
 *
 * The rule, the derivation and the three named sets live in
 * `destructive-confirmation.scan.ts`; read its header first. This file is the
 * harness and the assertions.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE SPY DELEGATES TO THE REAL HELPER INSTEAD OF REPLACING IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Two different facts are needed and neither implies the other:
 *
 *   - DID THE ACTION ASK? Not "does the command declare `--yes`" — a flag can be
 *     declared and never read, which is the failure mode this gate was opened
 *     for. Only a call into `confirmDestructive` proves the action body reaches
 *     the confirmation, and which function a closure calls is invisible on the
 *     `Command` object. So the spy records the entry.
 *   - DID THE REFUSAL ACTUALLY REFUSE? A spy that returned a canned `false`
 *     would prove the caller honours a false return and would prove nothing
 *     about the helper — including whether it still refuses on a non-TTY at all.
 *     So the spy CALLS THROUGH, `process.stdin.isTTY` is forced false for the
 *     whole file, and the refusal is the shipped one.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE SANDBOX — this file RUNS REAL COMMANDS, INCLUDING `auth logout`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every candidate in `UNCONFIRMED_DESTRUCTIVE` does NOT stop: driven, it runs
 * its action to completion, because that is the very thing being measured.
 * `auth logout` deletes a stored profile and `vibe env rm` deletes one, so `HOME` moves
 * in `vi.hoisted` — before the imports, because `config.ts` computes its
 * directory from `os.homedir()` at module load — and every network seam is
 * stubbed. `process.cwd()` moves too: `claude-code install` unpacks a whole
 * `.claude/` tree relative to it.
 */

const SANDBOX = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/nexus-destructive-gate-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  process.env.NEXUS_API_KEY = "nxs_p_stubkeyforthegate";
  delete process.env.NEXUS_PROFILE;
  delete process.env.NEXUS_BASE_URL;
  delete process.env.NEXUS_ENV;
  delete process.env.NEXUS_ORGANIZATION_ID;
  return dir;
});

/** Requests the stubbed seams were asked to make, since the last reset. */
const requests = vi.hoisted(() => ({ count: 0 }));

/** Whether `confirmDestructive` was ENTERED since the last reset. */
const asked = vi.hoisted(() => ({ hit: false }));

const stubClient = vi.hoisted(() => {
  const callable = (): unknown =>
    new Proxy(function () {} as unknown as object, {
      get(_t, prop) {
        if (prop === "then") return undefined;
        return callable();
      },
      apply() {
        requests.count += 1;
        return Promise.resolve([]);
      }
    });
  return callable;
});

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return { ...actual, createClient: () => stubClient() };
});

vi.mock("../util/tenant-http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../util/tenant-http")>();
  return {
    ...actual,
    tenantRequest: async () => {
      requests.count += 1;
      return [];
    },
    tenantStream: async () => {
      requests.count += 1;
    }
  };
});

vi.mock("../util/admin-http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../util/admin-http")>();
  return {
    ...actual,
    adminRequest: async () => {
      requests.count += 1;
      return [];
    }
  };
});

vi.mock("node:child_process", () => ({
  exec: () => undefined,
  execSync: () => "",
  execFileSync: () => "",
  spawn: () => {
    throw new Error("spawn is blocked in the destructive-confirmation gate");
  },
  spawnSync: () => ({ status: 0, stdout: "", stderr: "" })
}));

/**
 * The spy: records the ENTRY, then runs the real helper.
 *
 * 🚨 `confirmable` AND `isConfirmable` MUST STAY THE ORIGINALS. They share a
 * `WeakSet` keyed on the `Command`, so a re-implementation here would be a
 * second registry that the production tree never writes to, and every
 * `isConfirmable` would read false.
 */
vi.mock("../util/confirm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../util/confirm")>();
  return {
    ...actual,
    confirmDestructive: async (
      question: string,
      opts: { yes?: boolean; force?: boolean; rerun?: string }
    ): Promise<boolean> => {
      asked.hit = true;
      return actual.confirmDestructive(question, opts);
    }
  };
});

import {
  type CandidateRun,
  carriesDestructiveVerb,
  CONFIRMS_BEFORE_ACTING,
  DESTRUCTIVE_VERBS,
  destructiveCandidates,
  everyCommand,
  NOT_DESTRUCTIVE,
  runDestructiveConfirmationScan,
  UNCONFIRMED_DESTRUCTIVE
} from "./destructive-confirmation.scan";
import { buildCommandTree } from "./global-option-shadowing";

const NAMED = [
  ...CONFIRMS_BEFORE_ACTING,
  ...Object.keys(NOT_DESTRUCTIVE),
  ...Object.keys(UNCONFIRMED_DESTRUCTIVE)
].sort();

let candidates: string[];
let runs: Map<string, CandidateRun>;

beforeAll(async () => {
  mkdirSync(SANDBOX, { recursive: true });
  globalThis.fetch = (async () => {
    requests.count += 1;
    throw new Error("the network is blocked in the destructive-confirmation gate");
  }) as typeof fetch;

  // The whole file runs as a SCRIPT would — the one condition that guarantees
  // nobody is present to notice a missing question.
  Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

  const { buildRootProgram } = await import("../root-program");
  candidates = destructiveCandidates(buildCommandTree());

  const previousCwd = process.cwd();
  process.chdir(SANDBOX);
  try {
    runs = await runDestructiveConfirmationScan(NAMED, {
      buildProgram: () => buildRootProgram(),
      sandboxDir: SANDBOX,
      wasAsked: () => asked.hit,
      requestCount: () => requests.count,
      reset: () => {
        asked.hit = false;
        requests.count = 0;
      }
    });
  } finally {
    process.chdir(previousCwd);
  }
}, 600_000);

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLS — every assertion below is over a DERIVED set, so both derivations
// have to be shown to produce something before any of them means anything.
// ─────────────────────────────────────────────────────────────────────────────

describe("controls", () => {
  it("walks a tree that actually has commands", () => {
    expect(everyCommand(buildCommandTree()).length).toBeGreaterThan(400);
  });

  it("the candidate derivation finds a population, and finds it BOTH ways", () => {
    expect(candidates.length).toBeGreaterThan(50);
    // A leaf only the VERB reaches — it declares no --yes at all.
    expect(candidates).toContain("tracing delete");
    // A leaf only the FLAG reaches — "buy" is in no destructive vocabulary.
    expect(candidates).toContain("phone-number buy");
  });

  it("the verb matcher reads the leaf's own words, not its namespace", () => {
    // Without this the matcher could be inverted, match everything, and the
    // partition below would still balance — over a population meaning nothing.
    expect(carriesDestructiveVerb("agent delete")).toBe(true);
    expect(carriesDestructiveVerb("tool delete-credential")).toBe(true);
    expect(carriesDestructiveVerb("agent list")).toBe(false);
    // `delete` in the NAMESPACE must not drag a read in with it.
    expect(carriesDestructiveVerb("delete list")).toBe(false);
    expect(DESTRUCTIVE_VERBS).toContain("delete");
  });

  it("the scan drove every named leaf, and none of them timed out", () => {
    expect(runs.size).toBe(NAMED.length);
    const stuck = [...runs.values()].filter((run) => run.timedOut).map((run) => run.leaf);
    expect(stuck, "a leaf that never finished measured nothing").toEqual([]);
  });

  it("no run was refused by commander — that would be the HARNESS, not a finding", () => {
    // A synthesized argv commander rejects never reaches an action, so it can
    // neither ask nor act. Reported as a harness fault so it cannot pass for one.
    const rejected = [...runs.values()].filter((run) => run.refusedByCommander).map((r) => r.leaf);
    expect(rejected).toEqual([]);
  });

  it("the spy is wired: at least one driven command was OBSERVED asking", () => {
    // Without this, a mock that failed to attach would report `asked: false`
    // everywhere and the obligation set would red as 44 broken commands rather
    // than as one broken harness.
    expect([...runs.values()].filter((run) => run.asked).length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE PARTITION — the half that makes the NEXT one impossible
// ─────────────────────────────────────────────────────────────────────────────

describe("every destructive candidate is accounted for by name", () => {
  it("no candidate is missing from all three named sets", () => {
    const named = new Set(NAMED);
    const unaccounted = candidates.filter((leaf) => !named.has(leaf)).sort();

    expect(
      unaccounted,
      "This command's name carries a destructive verb, or it declares --yes, and no " +
        "list in destructive-confirmation.scan.ts names it. Put it in exactly one:\n" +
        "  CONFIRMS_BEFORE_ACTING   — and make the action call confirmDestructive(), so\n" +
        "                             a script without --yes refuses instead of destroying.\n" +
        "  NOT_DESTRUCTIVE          — with a written reason nothing stored can be lost.\n" +
        "  UNCONFIRMED_DESTRUCTIVE  — it destroys and does not ask. Debt, and it is read.\n" +
        "The first is the answer for a new command. The other two exist so the gate can " +
        "be honest about what is already here, not so a new one can dodge it."
    ).toEqual([]);
  });

  it("no named entry has stopped existing in the tree", () => {
    const live = new Set(everyCommand(buildCommandTree()).map(([path]) => path));
    const stale = NAMED.filter((leaf) => !live.has(leaf));

    expect(
      stale,
      "This path is named in destructive-confirmation.scan.ts and is not in the command " +
        "tree. A rename is an edit here; a removal is a deletion here. A list that keeps " +
        "an entry for a command nobody can run is a list nobody is reading."
    ).toEqual([]);
  });

  it("no leaf is named twice — the three sets are a PARTITION, not three opinions", () => {
    const seen = new Set<string>();
    const duplicated = NAMED.filter((leaf) => {
      if (seen.has(leaf)) return true;
      seen.add(leaf);
      return false;
    });
    expect(duplicated).toEqual([]);
  });

  it("no named entry has fallen out of the candidate set", () => {
    // The other direction of the same fact: a command that loses its --yes AND
    // its verb would quietly leave the population, taking its own case with it.
    const derived = new Set(candidates);
    expect(NAMED.filter((leaf) => !derived.has(leaf))).toEqual([]);
  });

  it("every exemption and every debt entry states a real reason", () => {
    const thin = Object.entries({ ...NOT_DESTRUCTIVE, ...UNCONFIRMED_DESTRUCTIVE })
      .filter(([, reason]) => reason.trim().length < 20)
      .map(([leaf]) => leaf);
    expect(thin, "a one-word reason is not a reason").toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE OBLIGATION — driven, and judged on what the command DID
// ─────────────────────────────────────────────────────────────────────────────

describe("a destructive command asks before it acts", () => {
  it.each(eachOrRefuse([...CONFIRMS_BEFORE_ACTING], "CONFIRMS_BEFORE_ACTING"))(
    "%s refuses with no terminal and no --yes",
    (leaf) => {
      const run = runs.get(leaf);
      expect(run, `${leaf} was never driven`).toBeDefined();
      if (run === undefined) return;

      expect(
        run.asked,
        `${leaf} ran its whole action without reaching confirmDestructive(). ` +
          `Declaring --yes is not confirming: the flag documents a question the ` +
          `command never asks, and a script that omits it destroys the resource ` +
          `with nobody warned. argv was: ${run.argv.join(" ")}`
      ).toBe(true);

      expect(
        run.exitCode,
        `${leaf} asked, was refused, and did not report the refusal. ` +
          `confirmDestructive sets process.exitCode; a caller that swallows the ` +
          `false return leaves a pipeline reading success. stderr: ${run.stderr}`
        // `invalid-input`, not a bare 1: the invocation was refused before
        // anything was sent, and the remedy is an argument (`--yes`). See
        // `src/exit-codes.ts`; it read 1 until the taxonomy existed.
      ).toBe(EXIT_CODES["invalid-input"]);

      expect(
        run.requests,
        `${leaf} was refused and then went to the network anyway — ${run.requests} ` +
          `request(s). "I could not ask" has to resolve to "I did not act".`
      ).toBe(0);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// THE OTHER TWO SETS — driven too, so neither can rot in silence
// ─────────────────────────────────────────────────────────────────────────────

describe("the debt ledger still describes the tree", () => {
  /**
   * 🚨 ONE TEST OVER THE ROWS, NEVER `.each` OVER THE LEDGER — AND
   * `emptyTableIsExpected` DOES NOT MAKE `.each` SAFE HERE EITHER.
   *
   * `UNCONFIRMED_DESTRUCTIVE` is a DEBT list and this file calls it one: every
   * entry is a destructive leaf that acts without asking, and the job is to
   * empty it. `eachOrRefuse` stood here and THROWS at collection on an empty
   * table, so the person who finally makes the last one ask would take this
   * whole file down — the debt sweep, the exemption sweep and the
   * `CONFIRMS_BEFORE_ACTING` sweep with it.
   *
   * `emptyTableIsExpected` silences that throw and does not fix the shape.
   * Measured on vitest 3.2.4 and 4.1.6: an empty `.each` registers no test, and
   * a `describe` left with NO test fails with `No test found in suite`. At file
   * level, beside a sibling `it`, the same empty table passes — so the hazard is
   * the `describe` wrapper, which is the shape every ledger sweep in this
   * repository uses.
   *
   * Collecting offenders into one array and expecting `[]` is green on an empty
   * ledger in every runner, and it prints every paid-off entry at once instead
   * of one failing case each.
   *
   * `eachOrRefuse` stays on `CONFIRMS_BEFORE_ACTING` above, where it belongs: an
   * empty list of commands that DO ask is a broken harness, never a success.
   */
  it("every entry is still a leaf that acts without asking", () => {
    const undriven = Object.keys(UNCONFIRMED_DESTRUCTIVE).filter((leaf) => !runs.has(leaf));

    const paidOff = Object.keys(UNCONFIRMED_DESTRUCTIVE)
      .map((leaf) => ({ leaf, run: runs.get(leaf) }))
      .filter((row) => row.run !== undefined && row.run.asked)
      .map((row) => row.leaf);

    expect(
      { undriven, paidOff },
      `Every leaf named here must still act without asking.\n` +
        `  undriven — named in UNCONFIRMED_DESTRUCTIVE and never driven at all.\n` +
        `  paidOff  — now asks before acting. Delete its line from ` +
        `UNCONFIRMED_DESTRUCTIVE and add it to CONFIRMS_BEFORE_ACTING; a ledger that ` +
        `keeps a paid-off entry is a ledger nobody trusts the rest of.`
    ).toEqual({ undriven: [], paidOff: [] });
  });
});

describe("the exemptions are still exemptions", () => {
  /**
   * The blessed exemption list is the LEAST likely of the three to empty, and it
   * gets the same shape for the same reason: the failure was at COLLECTION, so
   * it took the two sweeps above down with it rather than failing on its own.
   * A list of leaves that genuinely ask nothing reaching zero is a tree where
   * every destructive-looking leaf turned out to be destructive — unlikely is
   * not the same as forbidden.
   */
  it("every exempt leaf still legitimately asks nothing", () => {
    const undriven = Object.keys(NOT_DESTRUCTIVE).filter((leaf) => !runs.has(leaf));

    const nowAsking = Object.keys(NOT_DESTRUCTIVE)
      .map((leaf) => ({ leaf, run: runs.get(leaf) }))
      .filter((row) => row.run !== undefined && row.run.asked)
      .map((row) => `${row.leaf} (exempted because: "${NOT_DESTRUCTIVE[row.leaf]}")`);

    expect(
      { undriven, nowAsking },
      `An exemption claims the leaf asks nothing BECAUSE there is nothing to ask ` +
        `about.\n` +
        `  undriven  — named in NOT_DESTRUCTIVE and never driven at all.\n` +
        `  nowAsking — asks before acting, which contradicts the reason it was ` +
        `exempted for. Move it to CONFIRMS_BEFORE_ACTING.`
    ).toEqual({ undriven: [], nowAsking: [] });
  });
});
