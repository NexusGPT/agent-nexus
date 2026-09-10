import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { scanJsonShapes, type ScannedLeaf } from "./json-shape.scan";

/**
 * THE CALL GRAPH IS KEYED BY FILE AND NAME, NOT BY NAME.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY EVERY CASE HERE MINTS THE SAME NAME IN TWO FILES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The defect this file guards is a COLLISION, so a fixture whose names are all
 * unique passes against the broken scanner and the fixed one alike and proves
 * nothing. Each case below therefore declares one name TWICE — once in a module
 * the action can reach, once in a module it demonstrably cannot — and asserts
 * the scanner answered from the reachable one.
 *
 * 🚨 THE ASSERTIONS ARE ON A DIFFERENT PRINTER PER SIDE, DELIBERATELY. A
 * stranger declaring a helper that reaches the SAME printer is invisible to any
 * assertion, because both keyings then agree. The stranger reaches a printer the
 * reachable side does not, so a walk that falls into it changes the answer and
 * the case can fail.
 *
 * ── WHAT EACH CASE KILLS ────────────────────────────────────────────────────
 *
 * Reverting the file-qualified index to the previous tree-wide, bare-name map:
 *
 *   · `does not adopt a stranger's printer`  -> two printers, refused as a branch
 *   · `does not adopt a stranger's own-json` -> selfJson true, the line deleted
 *   · `does not resolve a method call`       -> a printer from an unreachable body
 *
 * ⚠️ `follows a genuinely imported helper` is a POSITIVE CONTROL and is NOT
 * discriminating — it passes under both keyings, and it is here for the opposite
 * risk: a repair that made resolution file-LOCAL would keep every case above
 * green while silently dropping every cross-module edge in the package. That
 * would read as a fix and would quietly delete help lines.
 */

const FIXTURES: string[] = [];

afterEach(() => {
  while (FIXTURES.length > 0) {
    const dir = FIXTURES.pop() as string;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** Write a throwaway source tree and scan it, exactly as the generator would. */
function scanFixture(files: Readonly<Record<string, string>>): ScannedLeaf[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "json-shape-scan-"));
  FIXTURES.push(dir);
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body);
  }
  return scanJsonShapes(dir);
}

/**
 * The one leaf at `relativePath`.
 *
 * 🚨 REFUSING ABSENCE IS LOAD-BEARING. A fixture the scan cannot tie to a path
 * yields NO leaf, and a case that read `leaf?.printers` would then compare
 * `undefined` and pass for the wrong reason — the exact vacuous shape this file
 * exists to rule out.
 */
function leafAt(leaves: readonly ScannedLeaf[], relativePath: string): ScannedLeaf {
  const found = leaves.filter((leaf) => leaf.relativePath === relativePath);
  expect(
    found.map((leaf) => leaf.sourceModule),
    `expected exactly one scanned leaf at "${relativePath}"`
  ).toHaveLength(1);
  return found[0];
}

describe("json-shape scan resolves a call in the file that wrote it", () => {
  it("does not adopt a stranger's printer", () => {
    const leaves = scanFixture({
      "reachable.ts": `
        import { printRecord } from "./output";
        function render(row: Record<string, unknown>): void {
          printRecord(row, []);
        }
        export function register(parent: any): void {
          parent.command("alpha").action(async () => {
            render({});
          });
        }
      `,
      // Never imported by reachable.ts, so `render` there is unreachable from
      // `alpha`. Under a bare-name graph the two are one node.
      "stranger.ts": `
        import { printTable } from "./output";
        function render(rows: unknown[]): void {
          printTable(rows, []);
        }
        export function unrelated(): void {
          render([]);
        }
      `
    });

    expect(leafAt(leaves, "alpha").printers).toEqual(["printRecord"]);
  });

  it("does not adopt a stranger's own-json write", () => {
    const leaves = scanFixture({
      "reachable.ts": `
        import { printRecord } from "./output";
        function emit(row: Record<string, unknown>): void {
          printRecord(row, []);
        }
        export function register(parent: any): void {
          parent.command("beta").action(async () => {
            emit({});
          });
        }
      `,
      // This is the shape that really fired: `printProvisionOutcome` is declared
      // in both `apps.ts` and `admin-vibe-tenant-cluster.ts`, and the former's
      // `JSON.stringify` write suppressed the latter's correct `record` line.
      "stranger.ts": `
        export function emit(value: unknown): void {
          console.log(JSON.stringify(value, null, 2));
        }
      `
    });

    const leaf = leafAt(leaves, "beta");
    expect(leaf.selfJson).toBe(false);
    expect(leaf.printers).toEqual(["printRecord"]);
  });

  it("does not resolve a method call onto a same-named free function", () => {
    const leaves = scanFixture({
      // `transport` is opaque to a syntactic walk, so `transport.send` must end
      // the walk. This is the live collision the ticket was filed on: `mcp.ts`
      // was classified from a `send` declared in the agent-eval command module.
      "caller.ts": `
        export function register(parent: any): void {
          parent.command("gamma").action(async () => {
            const transport: any = makeTransport();
            transport.send({});
          });
        }
      `,
      "sender.ts": `
        import { printSuccess } from "./output";
        function send(payload: unknown): void {
          printSuccess("sent", payload);
        }
        export function unrelated(): void {
          send({});
        }
      `
    });

    expect(leafAt(leaves, "gamma").printers).toEqual([]);
  });

  it("follows a genuinely imported helper across files", () => {
    const leaves = scanFixture({
      "consumer.ts": `
        import { renderList } from "./helper";
        export function register(parent: any): void {
          parent.command("delta").action(async () => {
            renderList();
          });
        }
      `,
      "helper.ts": `
        import { printList } from "./output";
        export function renderList(): void {
          printList([], {}, []);
        }
      `
    });

    expect(leafAt(leaves, "delta").printers).toEqual(["printList"]);
  });

  it("follows an aliased import to the name declared at the far end", () => {
    const leaves = scanFixture({
      "consumer.ts": `
        import { renderList as draw } from "./helper";
        export function register(parent: any): void {
          parent.command("epsilon").action(async () => {
            draw();
          });
        }
      `,
      "helper.ts": `
        import { printList } from "./output";
        export function renderList(): void {
          printList([], {}, []);
        }
      `,
      // A local `draw` in an unrelated module must not win over the alias.
      "stranger.ts": `
        import { printTable } from "./output";
        function draw(): void {
          printTable([], []);
        }
        export function unrelated(): void {
          draw();
        }
      `
    });

    expect(leafAt(leaves, "epsilon").printers).toEqual(["printList"]);
  });
});
