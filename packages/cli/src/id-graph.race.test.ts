import { describe, expect, it } from "vitest";

import { EXIT_CODES } from "./exit-codes";
import { isNotFound, raceVerdict, type ThreadedId } from "./id-graph.race";

/**
 * THE RACE VERDICT, OVER EVERY SHAPE A RE-READ CAN COME BACK IN.
 *
 * The end-to-end pair in `test/id-thread/` proves the runner is WIRED to this
 * and that the exit codes follow. This covers what a spawned sweep cannot reach
 * cheaply: the bodies a producer answers with when it is not simply healthy, and
 * the direction each one must fail in.
 *
 * 🚨 EVERY CASE HERE THAT ASSERTS `unmeasured` IS ASSERTING A **RED**. The
 * runner turns anything but `vanished` into FAILED, so a rule that leaked one of
 * these into `vanished` would retire a genuine not-found and reintroduce exactly
 * the false green this module exists to refuse. They are not edge cases; they
 * are the safety property.
 */

const AGENT: ThreadedId = { param: "agentId", producer: "agent list", id: "a-1" };

const body = (rows: readonly unknown[]): string => JSON.stringify({ success: true, data: rows });

describe("isNotFound", () => {
  it("is the taxonomy's own not-found code and nothing else", () => {
    expect(isNotFound(EXIT_CODES["not-found"])).toBe(true);
    // Every other category must be excluded, enumerated from the declaration so
    // a new one cannot join silently. A 403 or a 500 says nothing about whether
    // the row exists, and must never reach the re-check.
    for (const [category, code] of Object.entries(EXIT_CODES)) {
      if (category === "not-found") continue;
      expect(isNotFound(code)).toBe(false);
    }
    // An UNDECLARED code is not a not-found either.
    expect(isNotFound(99)).toBe(false);
  });
});

describe("raceVerdict", () => {
  it("says VANISHED when the producer no longer lists the threaded id", () => {
    const verdict = raceVerdict([AGENT], new Map([["agent list", body([{ id: "a-2" }])]]));
    expect(verdict.kind).toBe("vanished");
    expect(verdict.kind === "vanished" && verdict.gone).toEqual([AGENT]);
  });

  it("says VANISHED when the producer is now empty", () => {
    // Parsed and empty PROVES absence. This is the one case where "no rows" is
    // evidence rather than a dead end.
    expect(raceVerdict([AGENT], new Map([["agent list", body([])]])).kind).toBe("vanished");
  });

  it("says STILL-LISTED when the row is right there and the route still 404s", () => {
    const verdict = raceVerdict(
      [AGENT],
      new Map([["agent list", body([{ id: "a-1" }, { id: "a-2" }])]])
    );
    expect(verdict.kind).toBe("still-listed");
  });

  it("prefers the param-named field over `id`, exactly as the threading does", () => {
    // `idsFrom` threads `record[param] ?? record.id`. If this asked a different
    // question it could call an id gone that the next attempt would thread again.
    const bySlug: ThreadedId = { param: "slug", producer: "workspace list", id: "mine" };
    const rows = body([{ id: "not-this", slug: "mine" }]);
    expect(raceVerdict([bySlug], new Map([["workspace list", rows]])).kind).toBe("still-listed");
  });

  it("is UNMEASURED when the re-read did not succeed", () => {
    const verdict = raceVerdict([AGENT], new Map([["agent list", undefined]]));
    expect(verdict.kind).toBe("unmeasured");
  });

  it("is UNMEASURED when the producer was never re-read at all", () => {
    expect(raceVerdict([AGENT], new Map()).kind).toBe("unmeasured");
  });

  it("is UNMEASURED on a body that will not parse", () => {
    // The trap this whole split exists for: `idsFrom` renders an unparseable
    // body and an empty list identically as `[]`, and here they are opposites.
    expect(raceVerdict([AGENT], new Map([["agent list", "<html>502</html>"]])).kind).toBe(
      "unmeasured"
    );
  });

  it("is UNMEASURED on JSON that is not a row list", () => {
    for (const shape of ['{"success":true}', '{"data":{"id":"a-1"}}', '"a-1"', "null"]) {
      expect(raceVerdict([AGENT], new Map([["agent list", shape]])).kind).toBe("unmeasured");
    }
  });

  it("is UNMEASURED when it was handed no threaded id", () => {
    expect(raceVerdict([], new Map()).kind).toBe("unmeasured");
  });

  it("is UNMEASURED as soon as ONE of several producers cannot be read", () => {
    // A leaf can thread more than one id. One unreadable producer means absence
    // was never established for that id, and a partial proof is not a proof -
    // even when the other producer is loudly missing its row.
    const other: ThreadedId = { param: "toolId", producer: "tool list", id: "t-1" };
    const verdict = raceVerdict(
      [AGENT, other],
      new Map([
        ["agent list", body([])],
        ["tool list", undefined]
      ])
    );
    expect(verdict.kind).toBe("unmeasured");
  });

  it("names every id that vanished when several did", () => {
    const other: ThreadedId = { param: "toolId", producer: "tool list", id: "t-1" };
    const verdict = raceVerdict(
      [AGENT, other],
      new Map([
        ["agent list", body([{ id: "a-2" }])],
        ["tool list", body([{ id: "t-2" }])]
      ])
    );
    expect(verdict.kind === "vanished" && verdict.gone.map((entry) => entry.id)).toEqual([
      "a-1",
      "t-1"
    ]);
  });
});
