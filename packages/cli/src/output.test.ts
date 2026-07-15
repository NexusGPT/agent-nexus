import { afterEach, describe, expect, it, vi } from "vitest";

import { printTable, setJsonMode } from "./output";

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
    expect(out).toContain("c053ea31-b");
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
