import { describe, expect, it } from "vitest";

import {
  type BlockerEdgeRow,
  type BlockerTaskRow,
  explainUnreadyTasks,
  RECONSTRUCTION_CAVEAT
} from "./track-blockers";

/**
 * THE RECONSTRUCTION AGREES WITH THE SERVER STATEMENT, OR IT IS WORSE THAN
 * NOTHING.
 *
 * A composition that explains a stuck board WRONGLY is more expensive than one
 * that does not exist: the reader stops looking for the real edge. So every case
 * below is written against `TrackStore.findReadyTasks`'s predicate, and the ones
 * that matter carry their NEGATIVE CONTROL in the same test — the fixture that
 * separates the correct implementation from the plausible wrong one.
 *
 * The three plausible wrong implementations, each with its case here:
 *
 *  1. reading only the edges that name the task ITSELF. It is the reading the
 *     edge list invites, and it misses every edge hung on a section parent —
 *     which is the shape a plan import produces and the shape the production
 *     report was about.
 *  2. judging a STRUCTURE blocker by its own tick. A parent is structure, not
 *     work: it is finished when the work beneath it is, and a board that ticked
 *     every leaf would otherwise stay held forever with nothing to close.
 *  3. releasing a structure blocker with NO work beneath it. `bool_and` over an
 *     empty set is not `false`, and reading it as one hands out genuinely
 *     blocked work.
 */

const task = (over: Partial<BlockerTaskRow> & { id: string }): BlockerTaskRow => ({
  parentTaskId: null,
  kind: "STEP",
  title: over.id,
  doneAt: null,
  ...over
});

const edge = (blockerTaskId: string, blockedTaskId: string): BlockerEdgeRow => ({
  blockerTaskId,
  blockedTaskId
});

/** Ids of the rows the reconstruction says are held, in report order. */
const heldIds = (report: { unready: readonly { id: string; reason: string }[] }): string[] =>
  report.unready.filter((row) => row.reason === "BLOCKED").map((row) => row.id);

describe("an edge hung on an ancestor", () => {
  /**
   * 🔴 THE CASE THE PUBLISHED PROSE LOSES. `leaf`'s own edge list is EMPTY; the
   * edge names its parent. An implementation that looks up
   * `edges.filter(e => e.blockedTaskId === leaf.id)` reports `leaf` as
   * unexplained, and the reader concludes the board is stuck for no reason.
   */
  it("holds every row beneath the ancestor the edge names", () => {
    const tasks = [
      task({ id: "section" }),
      task({ id: "leaf", parentTaskId: "section" }),
      task({ id: "blocker", title: "Decide the storage shape", kind: "DECISION" })
    ];
    const report = explainUnreadyTasks(tasks, [edge("blocker", "section")], [], false);

    expect(heldIds(report)).toEqual(["leaf"]);
    const [held] = report.unready.filter((row) => row.reason === "BLOCKED");
    expect(held.blockers).toHaveLength(1);
    expect(held.blockers[0].taskId).toBe("blocker");
    expect(held.blockers[0].viaAncestorTaskId).toBe("section");
    expect(held.blockers[0].isWork).toBe(false);

    // THE NEGATIVE CONTROL. Same plan, the edge moved onto the leaf itself. A
    // task-only implementation passes THIS one, which is why it cannot be the
    // only case in the file — and `viaAncestorTaskId` is what tells them apart.
    const direct = explainUnreadyTasks(tasks, [edge("blocker", "leaf")], [], false);
    expect(heldIds(direct)).toEqual(["leaf"]);
    expect(
      direct.unready.find((row) => row.id === "leaf")?.blockers[0].viaAncestorTaskId
    ).toBeNull();
  });
});

describe("a structure blocker", () => {
  /**
   * 🔴 THE PRODUCTION DEFECT, IN FOUR ROWS. Every leaf under `section` is done,
   * so the board reads 100% and `section` itself was never ticked because the
   * product calls it structure. An implementation judging the blocker by its own
   * `doneAt` holds `waiter` forever with nothing left to close.
   */
  it("is satisfied by its subtree, not by its own tick", () => {
    const tasks = [
      task({ id: "section" }),
      task({ id: "under", parentTaskId: "section", doneAt: "2026-08-30T00:00:00.000Z" }),
      task({ id: "waiter" })
    ];
    const report = explainUnreadyTasks(tasks, [edge("section", "waiter")], ["waiter"], false);

    expect(heldIds(report)).toEqual([]);
    expect(report.reconstructedReadyIds).toEqual(["waiter"]);
    expect(report.disagreesWithServer).toBe(false);
  });

  it("still holds while one work leaf beneath it is open", () => {
    // The control for the case above: the SAME plan with one leaf reopened must
    // hold, or the test above proves only that the function returns an empty
    // list for everything.
    const tasks = [
      task({ id: "section" }),
      task({ id: "done-one", parentTaskId: "section", doneAt: "2026-08-30T00:00:00.000Z" }),
      task({ id: "open-one", parentTaskId: "section" }),
      task({ id: "waiter" })
    ];
    const report = explainUnreadyTasks(tasks, [edge("section", "waiter")], [], false);

    expect(heldIds(report)).toEqual(["waiter"]);
    expect(report.unready.find((row) => row.id === "waiter")?.blockers[0].hold).toBe(
      "SUBTREE_OPEN"
    );
  });

  /**
   * THE LEAF RULE, WHICH IS NOT "HAS NO CHILDREN". Leaf-ness is judged over the
   * WORK rows alone, so a `STEP` carrying only a `DEFINITION` underneath is a
   * work leaf and is judged by its own tick. An implementation testing for any
   * child at all calls this row structure and then judges it by a subtree it
   * does not have.
   */
  it("is a WORK leaf when its only child is content, and is judged by its own tick", () => {
    const tasks = [
      task({ id: "section" }),
      task({ id: "note", parentTaskId: "section", kind: "DEFINITION" }),
      task({ id: "waiter" })
    ];
    const report = explainUnreadyTasks(tasks, [edge("section", "waiter")], [], false);

    expect(heldIds(report)).toEqual(["waiter"]);
    expect(report.unready.find((row) => row.id === "waiter")?.blockers[0].hold).toBe("OPEN");
    expect(report.unready.find((row) => row.id === "waiter")?.blockers[0].isStructure).toBe(false);
  });

  /**
   * 🔴 THE VACUITY GUARD, AND IT FAILS CLOSED. A structure row whose subtree
   * this read cannot enumerate has an EMPTY set of work leaves, and "every
   * member of an empty set is done" is vacuously true. Reading it that way
   * releases work that is genuinely blocked, which is the one direction an
   * anti-join must never fail in.
   *
   * On the server the empty case arises from ancestry drift. On the client it
   * arises from the parent links themselves looping — the same defect one layer
   * down, and the only way to reach this branch here.
   */
  it("with a subtree this read cannot enumerate holds rather than releasing", () => {
    const tasks = [
      task({ id: "section", parentTaskId: "kid" }),
      task({ id: "kid", parentTaskId: "section" }),
      task({ id: "waiter" })
    ];
    const report = explainUnreadyTasks(tasks, [edge("section", "waiter")], [], false);

    expect(report.ancestryLooped).toBe(true);
    expect(heldIds(report)).toContain("waiter");
    expect(report.unready.find((row) => row.id === "waiter")?.blockers[0].hold).toBe(
      "NO_WORK_BENEATH"
    );
  });
});

describe("what is never offered", () => {
  it("reports a content row as CONTENT and a parent as STRUCTURE, never as blocked", () => {
    const tasks = [
      task({ id: "section" }),
      task({ id: "leaf", parentTaskId: "section" }),
      task({ id: "rule", kind: "DEFINITION" })
    ];
    const report = explainUnreadyTasks(tasks, [], ["leaf"], false);

    expect(report.unready.map((row) => [row.id, row.reason])).toEqual([
      ["section", "STRUCTURE"],
      ["rule", "CONTENT"]
    ]);
    expect(report.reconstructedReadyIds).toEqual(["leaf"]);
  });

  it("leaves a done row out of the answer entirely", () => {
    const tasks = [task({ id: "closed", doneAt: "2026-08-30T00:00:00.000Z" })];
    expect(explainUnreadyTasks(tasks, [], [], false).unready).toEqual([]);
  });

  it("treats a done blocker as satisfied", () => {
    const tasks = [
      task({ id: "blocker", doneAt: "2026-08-30T00:00:00.000Z" }),
      task({ id: "waiter" })
    ];
    const report = explainUnreadyTasks(tasks, [edge("blocker", "waiter")], ["waiter"], false);
    expect(heldIds(report)).toEqual([]);
  });
});

describe("the cross-check against the server", () => {
  it("reports a disagreement rather than a verdict", () => {
    const tasks = [task({ id: "a" }), task({ id: "b" })];
    // The server offered nothing; the reconstruction believes both are offerable.
    const report = explainUnreadyTasks(tasks, [], [], false);
    expect(report.disagreesWithServer).toBe(true);

    // The control: the same plan with the server agreeing must NOT report one,
    // or the flag is true for every input and says nothing.
    expect(explainUnreadyTasks(tasks, [], ["a", "b"], false).disagreesWithServer).toBe(false);
  });

  it("withholds the comparison when the server's answer was truncated", () => {
    const tasks = [task({ id: "a" }), task({ id: "b" })];
    expect(explainUnreadyTasks(tasks, [], ["a"], true).disagreesWithServer).toBeNull();
  });
});

describe("data this read cannot trust", () => {
  it("terminates on a parent loop and publishes that it happened", () => {
    const tasks = [
      task({ id: "one", parentTaskId: "two" }),
      task({ id: "two", parentTaskId: "one" })
    ];
    const report = explainUnreadyTasks(tasks, [], [], false);
    expect(report.ancestryLooped).toBe(true);

    // The control: a healthy plan must NOT raise it.
    expect(
      explainUnreadyTasks(
        [task({ id: "root" }), task({ id: "kid", parentTaskId: "root" })],
        [],
        [],
        false
      ).ancestryLooped
    ).toBe(false);
  });

  it("names an edge pointing outside the plan instead of dropping it", () => {
    const tasks = [task({ id: "waiter" })];
    const report = explainUnreadyTasks(tasks, [edge("ghost", "waiter")], [], false);

    expect(heldIds(report)).toEqual(["waiter"]);
    expect(report.unready[0].blockers[0].hold).toBe("UNKNOWN_TASK");
    expect(report.unready[0].blockers[0].kind).toBeNull();
  });
});

describe("the caveat", () => {
  it("says the answer is a reconstruction and names the authority", () => {
    // The output is only honest while these words are in it. A rendering that
    // drops them turns a client-side derivation into "the server's reason".
    expect(RECONSTRUCTION_CAVEAT).toContain("Reconstructed on the client");
    expect(RECONSTRUCTION_CAVEAT).toContain("NOT the server's own reason");
    expect(RECONSTRUCTION_CAVEAT).toContain("parentTaskId");
    expect(RECONSTRUCTION_CAVEAT).toContain("nexus tracks task ready");
  });
});
