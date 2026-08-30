import { beforeAll, describe, expect, it } from "vitest";

import {
  backendScopeIndex,
  type ClaimReport,
  commandTrie,
  runHelpClaimScan
} from "./help-claims-scan";
import { buildProgram, descriptorIndex, walkTree } from "./help-truth-scan";

/**
 * THE GATE OVER `help-claims-scan.ts`. Zero violations, and every floor met.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * NO LEDGER, DELIBERATELY — AND THAT IS A STRONGER RATCHET, NOT A WEAKER ONE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `help-truth.ledger.ts` exists because R0-R6 landed on a tree that already
 * carried 117 shipped defects; a gate that refused them all on day one would
 * have been reverted. These three rules were measured against the whole tree
 * BEFORE they were written and the tree is clean, so there is nothing to record
 * and the assertion is simply zero. A ledger with no rows is a suppression
 * mechanism waiting for its first row.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE FLOORS ARE THE POINT, BECAUSE EVERY RULE HERE IS CLEAN
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A clean rule and a rule whose population silently became empty produce the
 * identical empty violation list. Each floor below is a count taken INSIDE the
 * walk that produces the verdict — never by calling the extractor a second time,
 * which proves the extractor and not that it is wired in. The numbers are the
 * measurement rounded DOWN, so ordinary growth never reds them and a collapse
 * always does.
 */

/**
 * FLOORS, not counts — every value below is asserted with
 * `toBeGreaterThanOrEqual`, never with equality.
 *
 * 🚨 **Do not "correct" one of these to a freshly measured number.** They are
 * the measurement rounded DOWN so ordinary growth never reds them, exactly as
 * the header above says. Replacing a floor with today's exact count turns a
 * robust vacuity guard into a gate that reds on the next legitimate route
 * anyone adds — and an author under that pressure raises the number rather
 * than reading it, which is how a floor quietly becomes a rubber stamp.
 *
 * Each doc comment records the reading the floor was cut from, and every one
 * carries its date. An UNDATED reading reads as a live fact and rots into one:
 * a nearby audit took the `470 routes` note below for a current count and
 * filed it as stale, when the only thing wrong with it was that it did not say
 * when it was taken. The floors themselves were correct throughout.
 */
const MEASURED = {
  /** Cut from 3041 citations resolved, measured 2026-08-20. */
  citations: 2500,
  /** Cut from 29 bounds and defaults judged, measured 2026-08-20. */
  bounds: 20,
  /** Cut from 25 scope claims joined to a backend route, measured 2026-08-20. */
  scopeClaims: 20,
  /** Cut from 470 routes across 64 controllers, measured 2026-08-20. */
  backendRoutes: 400,
  backendControllers: 50,
  /** Cut from 501 leaves in the tree, measured 2026-08-20. */
  leaves: 400
} as const;

describe("a help sentence's mechanical referents resolve", () => {
  let report: ClaimReport;

  beforeAll(async () => {
    report = await runHelpClaimScan();
  }, 120_000);

  it("VERDICT — no command citation, bound, default or scope claim is wrong", () => {
    const rendered = report.violations.map(
      (v) => `${v.rule}\n  ${v.command}\n  ${v.where}\n  ${v.detail}`
    );
    expect(rendered).toEqual([]);
  });

  // ── FLOORS ────────────────────────────────────────────────────────────────

  it("FLOOR 1 — rule 1 resolved a real population of citations", () => {
    expect(report.citationsChecked).toBeGreaterThanOrEqual(MEASURED.citations);
  });

  it("FLOOR 2 — rule 2 put a real population of bounds to a schema", () => {
    expect(report.boundsJudged).toBeGreaterThanOrEqual(MEASURED.bounds);
  });

  it("FLOOR 3 — rule 3 joined a real population of scope claims to a route", () => {
    expect(report.scopeClaimsJudged).toBeGreaterThanOrEqual(MEASURED.scopeClaims);
  });

  it("FLOOR 4 — rule 3's backend oracle is populated", () => {
    expect(report.backendControllersRead).toBeGreaterThanOrEqual(MEASURED.backendControllers);
    expect(report.backendRoutesIndexed).toBeGreaterThanOrEqual(MEASURED.backendRoutes);
  });

  it("FLOOR 5 — the tree the scan walked is the whole tree", () => {
    expect(report.leafCount).toBeGreaterThanOrEqual(MEASURED.leaves);
    expect(report.nodeCount).toBeGreaterThan(report.leafCount);
  });

  // ── CONTROLS — each oracle can distinguish a right answer from a wrong one ──

  it("CONTROL 1 — the command trie resolves what exists and refuses what cannot", () => {
    const trie = commandTrie(walkTree(buildProgram()));
    expect(trie.children.get("tracks")?.children.get("task")?.children.has("claim")).toBe(true);
    // An alias, which a name-only trie would report as a citation of nothing.
    expect(trie.children.get("skills")?.children.has("install")).toBe(true);
    expect(trie.children.has("tracks-that-cannot-exist")).toBe(false);
    expect(trie.children.get("tracks")?.children.has("redy")).toBe(false);
  });

  it("CONTROL 2 — the backend scope index found the right thing, and not everything", () => {
    const { index } = backendScopeIndex();
    expect(index.get("GET /public/v1/tracks/ready")).toBe("tracks:read");
    expect(index.get("POST /public/v1/tracks/tasks/:taskId/toggle")).toBe("track_tasks:write");
    expect(index.get("DELETE /public/v1/tracks/:trackId/memory/:key")).toBe("track_memory:delete");
    expect(index.has("GET /public/v1/a-route-that-cannot-exist")).toBe(false);
  });

  it("CONTROL 3 — the backend index and the v1 contract describe the same routes", () => {
    // Neither side is a copy of the other: one is read off NestJS decorators in
    // `apps/backend`, the other off the Zod descriptors in `@nexus/types`. An
    // overlap this large is what makes the join in rule 3 meaningful; a refactor
    // that breaks either spelling drops it.
    const { index } = backendScopeIndex();
    const contract = new Set(
      [...descriptorIndex().values()].map((d) => `${d.method.toUpperCase()} ${d.path}`)
    );
    const shared = [...index.keys()].filter((k) => contract.has(k));
    expect(shared.length).toBeGreaterThanOrEqual(MEASURED.backendRoutes);
  });

  // ── ABSTENTIONS — reported, because an abstention is not a pass ─────────────

  it("REPORT — every bound and scope claim this scan declined to judge", () => {
    // Not an assertion on the count: an abstention is coverage this gate does not
    // have, and printing it where a reader sees it is the whole obligation. It
    // fails only if the list stops being readable.
    for (const line of [...report.boundsAbstained, ...report.scopeClaimsAbstained]) {
      expect(line).toMatch(/\S/);
    }
    process.stdout.write(
      `\n  help-claims abstentions — ${report.boundsAbstained.length} bound(s), ` +
        `${report.scopeClaimsAbstained.length} scope claim(s)\n` +
        [...report.boundsAbstained, ...report.scopeClaimsAbstained]
          .map((l) => `    ${l}\n`)
          .join("")
    );
  });
});
