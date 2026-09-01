import { describe, expect, it } from "vitest";

import type { ThreadableLeaf } from "./id-graph.model";
import { planThread } from "./id-graph.thread";

/**
 * WHAT A LEAF IS ABOUT TO BE INVOKED WITH, AND WHY IT SOMETIMES IS NOT.
 *
 * These four blocked reasons are opposite facts sharing one shape, and the
 * runner reports them as three different statuses. Getting one wrong is not a
 * cosmetic error: `FAILED` sends somebody to debug a healthy route, and
 * `SKIPPED_NO_ID` on a producer that DOES have rows hides a live race behind a
 * sentence that is simply untrue.
 */

const leafWith = (sources: ThreadableLeaf["sources"]): ThreadableLeaf => ({
  path: "agent-collection list",
  method: "GET",
  route: "/public/v1/agents/:agentId/collections",
  sources,
  fullyResolved: true
});

const AGENT_SOURCE = {
  kind: "producer-leaf" as const,
  param: "agentId",
  leaf: "agent list",
  route: "/public/v1/agents"
};

const body = (rows: readonly unknown[]): string => JSON.stringify({ success: true, data: rows });

describe("planThread", () => {
  it("threads the first id the producer offers", () => {
    const plan = planThread(
      leafWith([AGENT_SOURCE]),
      new Map([["agent list", body([{ id: "a-1" }, { id: "a-2" }])]]),
      new Map()
    );

    expect(plan.kind).toBe("ready");
    expect(plan.kind === "ready" && plan.args).toEqual(["a-1"]);
    // The threaded record is what the race re-check is later asked about, so it
    // has to carry the producer and the param, not just the value.
    expect(plan.kind === "ready" && plan.threaded).toEqual([
      { param: "agentId", producer: "agent list", id: "a-1" }
    ]);
  });

  it("skips an id already proven to have vanished and takes the next", () => {
    const plan = planThread(
      leafWith([AGENT_SOURCE]),
      new Map([["agent list", body([{ id: "a-1" }, { id: "a-2" }])]]),
      new Map(),
      new Map([["agent list", new Set(["a-1"])]])
    );

    expect(plan.kind === "ready" && plan.args).toEqual(["a-2"]);
  });

  it("says SKIPPED_NO_ID when the producer genuinely has no rows", () => {
    const plan = planThread(
      leafWith([AGENT_SOURCE]),
      new Map([["agent list", body([])]]),
      new Map()
    );

    expect(plan.kind === "blocked" && plan.status).toBe("SKIPPED_NO_ID");
    expect(plan.kind === "blocked" && plan.note).toContain("returned zero rows");
  });

  it("says SKIPPED_ID_VANISHED — never SKIPPED_NO_ID — when rows exist and all raced away", () => {
    // 🚨 THE CASE THAT MUST NOT COLLAPSE INTO THE ONE ABOVE. The producer has
    // rows; every one of them was deleted underneath this leaf. Reporting that
    // as "returned zero rows" would be a false sentence in a report whose whole
    // job is telling untested apart from broken.
    const plan = planThread(
      leafWith([AGENT_SOURCE]),
      new Map([["agent list", body([{ id: "a-1" }, { id: "a-2" }])]]),
      new Map(),
      new Map([["agent list", new Set(["a-1", "a-2"])]])
    );

    expect(plan.kind === "blocked" && plan.status).toBe("SKIPPED_ID_VANISHED");
    expect(plan.kind === "blocked" && plan.note).toContain("deleted mid-sweep");
    expect(plan.kind === "blocked" && plan.note).not.toContain("zero rows");
  });

  it("says SKIPPED_ID_VANISHED when the re-read that PROVED the deletion is itself empty", () => {
    // 🔴 THE RACE AT FULL STRENGTH, AND THE CASE A `offered.length === 0` TEST
    // GETS EXACTLY BACKWARDS. The producer's last row was the one that vanished,
    // so the fresh body is empty — and "empty" is precisely what an untouched
    // producer with nothing in it looks like. Only the record of what THIS
    // producer lost separates them, and this is the single case the fifth
    // outcome exists for: reported as "returned zero rows", it renders as the
    // ordinary skip a reader scrolls past.
    const plan = planThread(
      leafWith([AGENT_SOURCE]),
      new Map([["agent list", body([])]]),
      new Map(),
      new Map([["agent list", new Set(["a-1"])]])
    );

    expect(plan.kind === "blocked" && plan.status).toBe("SKIPPED_ID_VANISHED");
    expect(plan.kind === "blocked" && plan.note).not.toContain("zero rows");
  });

  it("still says SKIPPED_NO_ID for a producer that lost nothing, while a SIBLING producer raced", () => {
    // The other direction, and the reason the record is keyed by PRODUCER. A
    // flat "has anything vanished" flag would call this a race — it is not: B
    // genuinely has no rows, and only A lost one. Over-reporting the fifth
    // outcome would hollow it out exactly as under-reporting does.
    const second = {
      kind: "producer-leaf" as const,
      param: "toolId",
      leaf: "tool list",
      route: "/public/v1/tools"
    };
    const plan = planThread(
      leafWith([second]),
      new Map([["tool list", body([])]]),
      new Map(),
      new Map([["agent list", new Set(["a-1"])]])
    );

    expect(plan.kind === "blocked" && plan.status).toBe("SKIPPED_NO_ID");
    expect(plan.kind === "blocked" && plan.note).toContain("zero rows");
  });

  it("says FAILED when the producer itself errored, never SKIPPED", () => {
    // An ERRORED producer is not an EMPTY one. Conflating them reports a broken
    // list route as "nothing to test with" and the run exits 0.
    const plan = planThread(
      leafWith([AGENT_SOURCE]),
      new Map(),
      new Map([["agent list", "connect ECONNREFUSED"]])
    );

    expect(plan.kind === "blocked" && plan.status).toBe("FAILED");
    expect(plan.kind === "blocked" && plan.note).toContain("connect ECONNREFUSED");
  });

  it("blocks on the FIRST unusable source and does not thread a partial argv", () => {
    // A leaf taking two ids must be invoked with both or not at all; a partial
    // argv would shift the second id into the first positional.
    const second = {
      kind: "producer-leaf" as const,
      param: "toolId",
      leaf: "tool list",
      route: "/public/v1/tools"
    };
    const plan = planThread(
      leafWith([AGENT_SOURCE, second]),
      new Map([
        ["agent list", body([{ id: "a-1" }])],
        ["tool list", body([])]
      ]),
      new Map()
    );

    expect(plan.kind).toBe("blocked");
  });
});
