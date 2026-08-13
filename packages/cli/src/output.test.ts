import { afterEach, describe, expect, it, vi } from "vitest";

import {
  absent,
  fitCell,
  printList,
  printRecord,
  printSuccess,
  printTable,
  renderCell,
  setJsonMode
} from "./output";

const UUID = "c053ea31-be30-479d-8aca-0b1d02a49156";

function captureTable(columns: Parameters<typeof printTable>[1]): string {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  printTable([{ id: UUID, name: "hello-vibe" }], columns);
  spy.mockRestore();
  return lines.join("\n");
}

afterEach(() => {
  setJsonMode(false);
  vi.restoreAllMocks();
});

describe("printTable", () => {
  /**
   * The load-bearing property behind full ids in `vibe` lists. A column's
   * `width` is a hard `slice`, so a `width: 10` on an id column silently
   * cuts a uuid down to something the API rejects with a 500 — and the list
   * is the only place a user gets that id. Omitting `width` must print it
   * whole.
   */
  it("prints a uuid in full when the column sets no width", () => {
    const out = captureTable([
      { key: "id", label: "Id" },
      { key: "name", label: "Name" }
    ]);

    expect(out).toContain(UUID);
  });

  it("truncates to width when one is set — the behavior that made ids unusable", () => {
    const out = captureTable([
      { key: "id", label: "Id", width: 10 },
      { key: "name", label: "Name" }
    ]);

    expect(out).not.toContain(UUID);
    // 9 characters of value plus the ellipsis: the cut is still a cut, and it
    // now says so. Before this it read as a complete 10-char value.
    expect(out).toContain("c053ea31-…");
  });

  it("caps an unbounded column at 50 chars, which still fits a 36-char uuid", () => {
    const out = captureTable([{ key: "id", label: "Id" }]);

    expect(out).toContain(UUID);
    expect(UUID.length).toBeLessThan(50);
  });

  it("emits raw json in json mode, where ids are always full", () => {
    setJsonMode(true);
    const out = captureTable([{ key: "id", label: "Id", width: 10 }]);

    expect(out).toContain(UUID);
  });
});

/**
 * NEX-3628 at the level the defect actually lives: `printSuccess` renders ONE
 * object down two channels, so a `?? "(none)"` written for the terminal also
 * replaces the `null` a script parses. `absent()` is the split.
 */
describe("printSuccess and absent()", () => {
  function capture(data: object): string {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    printSuccess("Done.", data);
    spy.mockRestore();
    return lines.join("\n");
  }

  it("emits a literal null under --json, never the display copy", () => {
    setJsonMode(true);

    const parsed = JSON.parse(capture({ owner: absent("(none)") })) as Record<string, unknown>;

    // `message` rides beside the data now — the human sentence and the machine
    // document carry the same diagnostic. `toEqual` and not a subset match, so
    // a key appearing or vanishing from this envelope has to be decided here
    // rather than noticed by a consumer.
    expect(parsed).toEqual({ success: true, message: "Done.", owner: null });
    // The symbol the text rides on is invisible to JSON.stringify, so an
    // unmapped AbsentValue would serialize as `{}` — a shape that reads as
    // "present, and an object" to every consumer.
    expect(JSON.stringify(parsed)).not.toContain("(none)");
    expect(JSON.stringify(parsed)).not.toContain("{}");
  });

  it("prints the sentence in the human rendering, which is where it reads well", () => {
    setJsonMode(false);

    expect(capture({ owner: absent("(none)") })).toContain("(none)");
  });

  it("leaves every ordinary value alone on both channels", () => {
    setJsonMode(true);
    expect(JSON.parse(capture({ id: UUID, count: 0, flag: false, nested: { a: 1 } }))).toEqual({
      success: true,
      message: "Done.",
      id: UUID,
      count: 0,
      flag: false,
      nested: { a: 1 }
    });

    setJsonMode(false);
    expect(capture({ id: UUID })).toContain(UUID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The two printer-level classes. Both are properties of THE PRINTER, not of a
// command, so one test here covers every table and every record in the CLI —
// including the ones nobody has written yet.
// ═══════════════════════════════════════════════════════════════════════════

/** Capture everything a printer writes to stdout. */
function capturePrinter(run: () => void): string {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(" "));
  });
  try {
    run();
  } finally {
    spy.mockRestore();
  }
  return lines.join("\n");
}

/**
 * `nexus workspace status` rendered four distinct mounts as one identical path,
 * because the 50-char auto-cap cut them inside a shared prefix and said nothing.
 * An operator picking a mount from that list picks blind, and there is no signal
 * anywhere in the output that a choice is even being made.
 *
 * The property is not "do not truncate" — a table has to fit a terminal. It is
 * "a cut is never silent", and it is enforced on the printer so no column array
 * anywhere can opt out of it.
 */
describe("truncation is always visible", () => {
  const PREFIX = "/Users/nab/Library/Application Support/nexus-workspaces/";

  it("keeps four mounts under one long prefix distinguishable", () => {
    const rows = ["acme", "globex", "initech", "umbrella"].map((slug) => ({
      mountPath: `${PREFIX}${slug}`
    }));
    const out = capturePrinter(() =>
      printTable(rows, [{ key: "mountPath", label: "Mount point" }])
    );

    const cells = out
      .split("\n")
      .slice(2)
      .map((l) => l.trim());
    expect(cells).toHaveLength(4);
    expect(new Set(cells).size).toBe(4);
  });

  it("marks every cut cell, and only the cut ones", () => {
    const cases: [string, number][] = [
      ["short", 20],
      ["exactly-ten", 11],
      ["far-too-long-for-this-column", 12],
      ["ab", 1],
      ["ab", 2]
    ];
    for (const [text, width] of cases) {
      const cell = fitCell(text, width);
      expect(cell.length).toBe(width);
      if (text.length > width) {
        expect(cell.endsWith("…")).toBe(true);
      } else {
        expect(cell.trimEnd()).toBe(text);
        expect(cell).not.toContain("…");
      }
    }
  });

  it("truncates an over-wide HEADER too, so the columns stay aligned", () => {
    const out = capturePrinter(() =>
      printTable(
        [{ a: "x", b: "y" }],
        [
          { key: "a", label: "A VERY LONG HEADER", width: 6 },
          { key: "b", label: "B", width: 3 }
        ]
      )
    );
    const [header, rule] = out.split("\n");
    // Header row and separator row must be the same width, or every column to
    // the right of the overflow is misaligned for the whole table.
    expect(header.length).toBe(rule.length);
    expect(header).toContain("…");
  });
});

/**
 * `String(someObject)` is `"[object Object]"`. It typechecks, it lints clean, it
 * satisfies any test asserting the column is present, and it is unreadable.
 * `analytics overview` shipped five such fields and `access-card get` shipped
 * `policies` — the field whose entire purpose is that you read its key set.
 *
 * Every printer routes its values through one renderer, so this is a property of
 * the CLI rather than of the commands audited today.
 */
describe("no printer can emit [object Object]", () => {
  const NESTED = {
    id: "abc",
    tokenUsage: { input: 10, output: 20 },
    byChannel: [{ channel: "web", count: 3 }],
    policies: {},
    empty: [],
    missing: null
  };

  it("renderCell turns an object into readable JSON, never [object Object]", () => {
    expect(renderCell({ input: 10 })).toBe('{"input":10}');
    expect(renderCell([1, 2])).toBe("[1,2]");
    expect(renderCell({})).toBe("{}");
    expect(renderCell([])).toBe("[]");
    expect(renderCell(null)).toBe("");
    expect(renderCell(undefined)).toBe("");
    expect(renderCell(0)).toBe("0");
    expect(renderCell(false)).toBe("false");
    expect(renderCell("plain")).toBe("plain");
  });

  it("never falls back to [object Object] on a value JSON cannot take", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(renderCell(circular)).not.toContain("[object");
    expect(renderCell({ big: 1n })).not.toContain("[object");
  });

  it("holds for printTable", () => {
    const out = capturePrinter(() =>
      printTable(
        [NESTED],
        [
          { key: "tokenUsage", label: "TOKENS" },
          { key: "byChannel", label: "CHANNELS" },
          { key: "policies", label: "POLICIES" }
        ]
      )
    );
    expect(out).not.toContain("[object Object]");
    expect(out).toContain('"input"');
  });

  it("holds for printRecord with no field list — the analytics overview path", () => {
    const out = capturePrinter(() => printRecord(NESTED));
    expect(out).not.toContain("[object Object]");
    expect(out).toContain('"input":10');
    expect(out).toContain('"channel":"web"');
  });

  it("holds for printRecord WITH a field list — the access-card get path", () => {
    const out = capturePrinter(() =>
      printRecord(NESTED, [
        { key: "id", label: "ID" },
        { key: "policies", label: "Policies" }
      ])
    );
    expect(out).not.toContain("[object Object]");
  });

  it("holds for printList and printSuccess", () => {
    expect(
      capturePrinter(() => printList([NESTED], undefined, [{ key: "tokenUsage", label: "TOKENS" }]))
    ).not.toContain("[object Object]");
    expect(
      capturePrinter(() => printSuccess("done", { tokenUsage: NESTED.tokenUsage }))
    ).not.toContain("[object Object]");
  });

  it("leaves --json untouched — a script still gets the real nested object", () => {
    setJsonMode(true);
    const out = capturePrinter(() => printList([NESTED], undefined, [{ key: "id", label: "ID" }]));
    expect(JSON.parse(out).data[0].tokenUsage).toEqual({ input: 10, output: 20 });
  });
});
