import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * THE READY READS MUST SAY WHEN A PAGE WAS CUT — AND STAY SILENT WHEN IT WAS NOT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS FOR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Both ready responses now carry `hasMore`, read one row past the page. Before
 * it, a full page and a complete set were the same output in EVERY channel —
 * these routes carry no total and no cursor, so `--json` could not see it either.
 *
 * ── THE QUIET CASE IS THE LOAD-BEARING ONE ──────────────────────────────────
 *
 * A footer that renders on a complete set is not merely noise: it teaches the
 * reader to skim the footer, so on the day it carries the warning it does not get
 * read. The fix would defeat itself. So the quiet case is asserted, not assumed.
 *
 * 🔴 AND IT IS ASSERTED WITH ITS OWN POSITIVE CONTROL IN THE SAME ASSERTION.
 * "Footer absent" is satisfied by a command that printed NOTHING AT ALL — a
 * thrown action, a mock returning undefined, a table that never rendered. Absence
 * proves nothing on its own. Each quiet case asserts the PAIR: footer absent AND
 * the table present.
 */

const TRACK = "22222222-2222-4222-8222-222222222222";

const readyTrack = {
  id: "11111111-1111-4111-8111-111111111111",
  number: 7,
  slug: "ship-the-thing",
  title: "Ship the thing",
  shortTitle: null,
  currentStep: null,
  nextOwner: "CUE"
};

const readyTask = {
  id: "t1",
  title: "Extract the lifecycle skeleton",
  shortTitle: null,
  acceptance: null,
  gate: false,
  nextOwner: "CUE" as const
};

/** Unblocked, and not the agent's turn — the row the second table exists for. */
const waitingTask = {
  id: "t9",
  title: "Pick the empty-state copy",
  shortTitle: null,
  acceptance: null,
  gate: false,
  nextOwner: "USER" as const
};

const seams = vi.hoisted(() => ({
  listReady: vi.fn(),
  listReadyTasks: vi.fn(),
  listTasks: vi.fn(),
  listTaskEdges: vi.fn()
}));

vi.mock("../client", () => ({ createClient: () => ({ tracks: seams }) }));

import { registerTracksCommands } from "./tracks";

async function drive(json: boolean, argv: string[]): Promise<string> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerTracksCommands(program);
  setJsonMode(json);

  const chunks: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => {
    chunks.push(args.map(String).join(" "));
  };
  try {
    await program.parseAsync(["node", "nexus", ...argv]);
  } finally {
    console.log = log;
    setJsonMode(false);
  }
  return chunks.join("\n");
}

afterEach(() => {
  vi.clearAllMocks();
  setJsonMode(false);
});

describe("tracks ready renders the truncation signal", () => {
  it("LOUD: a cut page says so and names the action", async () => {
    seams.listReady.mockResolvedValue({ tracks: [readyTrack], hasMore: true });
    const out = await drive(false, ["tracks", "ready"]);

    expect(out).toContain("1 row(s) shown. MORE TRACKS ARE READY — raise --limit and re-read.");
  });

  it("QUIET: a complete set prints NO footer — and the table still rendered", async () => {
    // The pair is the assertion. "No footer" alone is satisfied by a command that
    // printed nothing at all, which is the empty-haystack false green.
    seams.listReady.mockResolvedValue({ tracks: [readyTrack], hasMore: false });
    const out = await drive(false, ["tracks", "ready"]);

    expect({
      footer: out.includes("MORE TRACKS ARE READY"),
      table: out.includes("ship-the-thing")
    }).toEqual({ footer: false, table: true });
  });

  it("--json carries hasMore and is NOT contaminated by the footer", async () => {
    seams.listReady.mockResolvedValue({ tracks: [readyTrack], hasMore: true });
    const out = await drive(true, ["tracks", "ready"]);

    expect({
      wire: out.includes('"hasMore"'),
      leak: out.includes("MORE TRACKS ARE READY")
    }).toEqual({
      wire: true,
      leak: false
    });
  });
});

describe("tracks task ready renders the truncation signal", () => {
  it("LOUD: a cut page says so", async () => {
    seams.listReadyTasks.mockResolvedValue({ workable: [readyTask], waiting: [], hasMore: true });
    const out = await drive(false, ["tracks", "task", "ready", TRACK]);

    expect(out).toContain("1 row(s) shown. MORE ROWS ARE READY — raise --limit and re-read.");
  });

  it("QUIET: a complete set prints NO footer — and the table still rendered", async () => {
    seams.listReadyTasks.mockResolvedValue({ workable: [readyTask], waiting: [], hasMore: false });
    const out = await drive(false, ["tracks", "task", "ready", TRACK]);

    expect({
      footer: out.includes("MORE ROWS ARE READY"),
      table: out.includes("Extract the lifecycle skeleton")
    }).toEqual({ footer: false, table: true });
  });

  it("the truncation footer and the empty-set pointer are INDEPENDENT, not chained", async () => {
    // An `else if` would drop one of them. An empty page that is also cut is not
    // reachable through the server's own clamp, but that is a property of the
    // SERVER — encoding it as client control flow is what this asserts against.
    seams.listReadyTasks.mockResolvedValue({ workable: [], waiting: [], hasMore: true });
    const out = await drive(false, ["tracks", "task", "ready", TRACK]);

    expect({
      pointer: out.includes("why-not-ready"),
      footer: out.includes("MORE ROWS ARE READY")
    }).toEqual({ pointer: true, footer: true });
  });

  it("--json carries hasMore and is NOT contaminated by the footer", async () => {
    seams.listReadyTasks.mockResolvedValue({ workable: [readyTask], waiting: [], hasMore: true });
    const out = await drive(true, ["tracks", "task", "ready", TRACK]);

    expect({ wire: out.includes('"hasMore"'), leak: out.includes("MORE ROWS ARE READY") }).toEqual({
      wire: true,
      leak: false
    });
  });
});

describe("why-not-ready reads the wire field, not a length inference", () => {
  /**
   * The envelope is built so the two DISAGREE, which is the whole point.
   *
   * One ready row is far below `READY_SET_CEILING` (200), so the old
   * `ready.workable.length >= READY_SET_CEILING` inference reads "complete". The
   * server says `hasMore: true`. That page is exactly what the server produces
   * when it clamps below what was requested — the case the inference gets wrong.
   *
   * A truncated server answer makes `disagreesWithServer` NULL: a shorter list is
   * not a disagreement. Read the inference instead and it is non-null, because the
   * reconstruction finds two ready leaves against the server's one.
   */
  const arrange = (hasMore: boolean): void => {
    seams.listReadyTasks.mockResolvedValue({ workable: [readyTask], waiting: [], hasMore });
    seams.listTasks.mockResolvedValue({
      tasks: [
        { id: "t1", parentTaskId: null, kind: "STEP", title: "One", doneAt: null },
        { id: "t2", parentTaskId: null, kind: "STEP", title: "Two", doneAt: null }
      ]
    });
    seams.listTaskEdges.mockResolvedValue({ edges: [] });
  };

  it("a truncated ready set is not reported as a disagreement", async () => {
    arrange(true);
    const doc = JSON.parse(await drive(true, ["tracks", "task", "why-not-ready", TRACK]));

    expect(doc.disagreesWithServer).toBeNull();
  });

  it("CONTROL: an untruncated ready set DOES report the disagreement", async () => {
    // Without this, the assertion above is satisfied by a build that reports null
    // unconditionally — which would be a different defect wearing the same green.
    arrange(false);
    const doc = JSON.parse(await drive(true, ["tracks", "task", "why-not-ready", TRACK]));

    expect(doc.disagreesWithServer).toBe(true);
  });
});

/**
 * THE SURFACE A PERSON READS IS WHERE THE TICKET'S DEFECT ACTUALLY HAPPENED.
 *
 * The wire refuses to hand a caller one summable array. That is worth nothing if
 * the CLI renders both halves back into a single table with a `WAITING ON`
 * column — 29 rows under one heading, six of them workable, and a reader counting
 * by eye lands exactly where the board did.
 */
describe("tracks task ready prints the two halves as two tables", () => {
  it("renders a workable row and a waiting row in SEPARATE sections", async () => {
    seams.listReadyTasks.mockResolvedValue({
      workable: [readyTask],
      waiting: [waitingTask],
      hasMore: false
    });
    const out = await drive(false, ["tracks", "task", "ready", TRACK]);

    const workable = out.indexOf("Extract the lifecycle skeleton");
    const heading = out.indexOf("WAITING ON SOMEBODY ELSE");
    const waiting = out.indexOf("Pick the empty-state copy");

    // Both rows are on screen — the waiting one is published, never filtered.
    expect({ workable: workable > -1, waiting: waiting > -1 }).toEqual({
      workable: true,
      waiting: true
    });

    // 🔴 THE ORDER IS THE ASSERTION. The heading must sit BETWEEN them, which is
    // what makes them two tables rather than one list a reader sums. Both rows
    // being present is satisfied by a single merged table.
    expect(workable).toBeLessThan(heading);
    expect(heading).toBeLessThan(waiting);
  });

  it("prints NO waiting section when nothing is waiting", async () => {
    // An always-present empty section is a heading readers learn to skip — so on
    // the day it carries rows it does not get read.
    seams.listReadyTasks.mockResolvedValue({
      workable: [readyTask],
      waiting: [],
      hasMore: false
    });
    const out = await drive(false, ["tracks", "task", "ready", TRACK]);

    expect({
      heading: out.includes("WAITING ON SOMEBODY ELSE"),
      table: out.includes("Extract the lifecycle skeleton")
    }).toEqual({ heading: false, table: true });
  });

  it("points at why-not-ready when NOTHING is workable, even with waiting rows on screen", async () => {
    // 🔴 THE POINTER ASKS ABOUT `workable` ALONE. A board whose every ready row is
    // parked on a person offers the agent nothing, and that is a case somebody
    // needs to be told about — not one to suppress because the second table
    // happens to be non-empty.
    seams.listReadyTasks.mockResolvedValue({
      workable: [],
      waiting: [waitingTask],
      hasMore: false
    });
    const out = await drive(false, ["tracks", "task", "ready", TRACK]);

    expect({
      pointer: out.includes("why-not-ready"),
      waitingRow: out.includes("Pick the empty-state copy")
    }).toEqual({ pointer: true, waitingRow: true });
  });

  it("counts the PAGE in the truncation footer, across both halves", async () => {
    seams.listReadyTasks.mockResolvedValue({
      workable: [readyTask],
      waiting: [waitingTask],
      hasMore: true
    });
    const out = await drive(false, ["tracks", "task", "ready", TRACK]);

    // Two rows shown, not one: the page is one query over both halves, and this
    // line is the only place the sum is the right number.
    expect(out).toContain("2 row(s) shown. MORE ROWS ARE READY");
  });

  it("--json carries BOTH halves and is not contaminated by either footer", async () => {
    seams.listReadyTasks.mockResolvedValue({
      workable: [readyTask],
      waiting: [waitingTask],
      hasMore: false
    });
    const out = await drive(true, ["tracks", "task", "ready", TRACK]);
    const doc = JSON.parse(out);

    expect(doc.workable).toHaveLength(1);
    expect(doc.waiting).toHaveLength(1);
    expect(doc.waiting[0].nextOwner).toBe("USER");
    // A script's document must not carry the human channel's prose.
    expect(out).not.toContain("WAITING ON SOMEBODY ELSE");
  });
});

describe("why-not-ready cross-checks against BOTH halves", () => {
  it("does not report a waiting row as unready", async () => {
    // 🔴 THE TRAP THE SPLIT OPENS. A `waiting` row has every blocker satisfied, so
    // feeding only `workable` into the reconstruction puts it in the unready set
    // with an EMPTY `blockedBy` — a well-formed, plausible, entirely wrong
    // diagnosis, and nothing would go red.
    seams.listReadyTasks.mockResolvedValue({
      workable: [{ ...readyTask, id: "t1" }],
      waiting: [{ ...waitingTask, id: "t2" }],
      hasMore: false
    });
    seams.listTasks.mockResolvedValue({
      tasks: [
        { id: "t1", parentTaskId: null, kind: "STEP", title: "One", doneAt: null },
        { id: "t2", parentTaskId: null, kind: "STEP", title: "Two", doneAt: null }
      ]
    });
    seams.listTaskEdges.mockResolvedValue({ edges: [] });

    const doc = JSON.parse(await drive(true, ["tracks", "task", "why-not-ready", TRACK]));

    // 🔴 THE LOAD-BEARING ASSERTION: the waiting row is in the server-ready set the
    // report cross-checks against. Narrow the union to `workable` and `t2` drops
    // out of this list.
    expect([...doc.serverReadyIds].sort()).toEqual(["t1", "t2"]);

    // And it is therefore NOT reported as an open row nothing accounts for. This
    // is the false diagnosis the union prevents: `t2` has no blockers at all, so a
    // report naming it would have to give it an EMPTY `blockedBy` — plausible,
    // well-formed and wrong.
    expect(doc.unready.map((row: { id: string }) => row.id)).toEqual([]);

    // `false`, never `null`: the answer was not truncated (`hasMore: false`), so
    // the field is a real comparison rather than a withheld one, and it says the
    // reconstruction and the server name the SAME set.
    expect(doc.disagreesWithServer).toBe(false);
  });
});
