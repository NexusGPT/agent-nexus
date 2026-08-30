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
  gate: false
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
    seams.listReadyTasks.mockResolvedValue({ tasks: [readyTask], hasMore: true });
    const out = await drive(false, ["tracks", "task", "ready", TRACK]);

    expect(out).toContain("1 row(s) shown. MORE TASKS ARE READY — raise --limit and re-read.");
  });

  it("QUIET: a complete set prints NO footer — and the table still rendered", async () => {
    seams.listReadyTasks.mockResolvedValue({ tasks: [readyTask], hasMore: false });
    const out = await drive(false, ["tracks", "task", "ready", TRACK]);

    expect({
      footer: out.includes("MORE TASKS ARE READY"),
      table: out.includes("Extract the lifecycle skeleton")
    }).toEqual({ footer: false, table: true });
  });

  it("the truncation footer and the empty-set pointer are INDEPENDENT, not chained", async () => {
    // An `else if` would drop one of them. An empty page that is also cut is not
    // reachable through the server's own clamp, but that is a property of the
    // SERVER — encoding it as client control flow is what this asserts against.
    seams.listReadyTasks.mockResolvedValue({ tasks: [], hasMore: true });
    const out = await drive(false, ["tracks", "task", "ready", TRACK]);

    expect({
      pointer: out.includes("why-not-ready"),
      footer: out.includes("MORE TASKS ARE READY")
    }).toEqual({ pointer: true, footer: true });
  });

  it("--json carries hasMore and is NOT contaminated by the footer", async () => {
    seams.listReadyTasks.mockResolvedValue({ tasks: [readyTask], hasMore: true });
    const out = await drive(true, ["tracks", "task", "ready", TRACK]);

    expect({ wire: out.includes('"hasMore"'), leak: out.includes("MORE TASKS ARE READY") }).toEqual(
      {
        wire: true,
        leak: false
      }
    );
  });
});

describe("why-not-ready reads the wire field, not a length inference", () => {
  /**
   * The envelope is built so the two DISAGREE, which is the whole point.
   *
   * One ready row is far below `READY_SET_CEILING` (200), so the old
   * `ready.tasks.length >= READY_SET_CEILING` inference reads "complete". The
   * server says `hasMore: true`. That page is exactly what the server produces
   * when it clamps below what was requested — the case the inference gets wrong.
   *
   * A truncated server answer makes `disagreesWithServer` NULL: a shorter list is
   * not a disagreement. Read the inference instead and it is non-null, because the
   * reconstruction finds two ready leaves against the server's one.
   */
  const arrange = (hasMore: boolean): void => {
    seams.listReadyTasks.mockResolvedValue({ tasks: [readyTask], hasMore });
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
