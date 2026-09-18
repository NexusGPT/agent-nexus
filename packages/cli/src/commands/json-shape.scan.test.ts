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

/**
 * A REGISTRATION'S PATH IS RESOLVED AS FAR UP AS THE SOURCE SAYS, AND NO FURTHER.
 *
 * A leaf registered on a handed-in namespace used to scan as its bare name —
 * `list` — which suffix-matches every `… list` leaf in the tree, so a leaf with
 * no registration of its own adopted a stranger's shape. Each case below pins
 * one rule of the resolution, one property per `it`, so a mutant that breaks one
 * rule is scored against that rule alone:
 *
 *   · `carries the namespace`       -> revert the call-site prefix: `list`, not `ns list`
 *   · `refuses a disputed prefix`   -> take the first call site instead of refusing
 *   · `each registrar's own const`  -> resolve `const` file-wide: both at `x trigger`
 *   · `a parameter shadows`         -> ignore parameters: `role get`, not `get`
 *   · `a builder chain on the var`  -> match only `<name>.action(…)`: no leaf at all
 */
describe("json-shape scan resolves a registration's path through its registrar's call site", () => {
  it("carries the namespace a nested registrar was handed", () => {
    const leaves = scanFixture({
      "root.ts": `
        import { registerLeaf } from "./leaf";
        export function registerNs(program: any): void {
          const ns = program.command("ns").description("a namespace");
          registerLeaf(ns, program);
        }
      `,
      "leaf.ts": `
        import { printList } from "./output";
        export function registerLeaf(ns: any, program: any): any {
          const leaf = ns.command("list").action(async () => {
            printList([], {}, []);
          });
          return leaf;
        }
      `
    });

    expect(leafAt(leaves, "ns list").printers).toEqual(["printList"]);
  });

  it("refuses a prefix its call sites disagree about", () => {
    const leaves = scanFixture({
      "root.ts": `
        import { registerLeaf } from "./leaf";
        export function registerA(program: any): void {
          registerLeaf(program.command("a"), program);
        }
        export function registerB(program: any): void {
          registerLeaf(program.command("b"), program);
        }
      `,
      "leaf.ts": `
        import { printList } from "./output";
        export function registerLeaf(ns: any, program: any): void {
          ns.command("list").action(async () => {
            printList([], {}, []);
          });
        }
      `
    });

    expect(leafAt(leaves, "list").printers).toEqual(["printList"]);
  });

  it("resolves each registrar's own const when two in one file share the name", () => {
    const leaves = scanFixture({
      "sweeps.ts": `
        import { printRecord, printSuccess } from "./output";
        export function registerX(admin: any): void {
          const sweep = admin.command("x");
          sweep.command("trigger").action(async () => {
            printRecord({});
          });
        }
        export function registerY(admin: any): void {
          const sweep = admin.command("y");
          sweep.command("trigger").action(async () => {
            printSuccess("done", {});
          });
        }
      `
    });

    expect(leafAt(leaves, "y trigger").printers).toEqual(["printSuccess"]);
  });

  it("lets a parameter shadow a same-named const elsewhere in the file", () => {
    const leaves = scanFixture({
      "role.ts": `
        import { printRecord } from "./output";
        export function registerRoot(program: any): void {
          const role = program.command("role");
          role.description("the namespace");
        }
        export function registerGet(role: any, program: any): void {
          role.command("get").action(async () => {
            printRecord({});
          });
        }
      `
    });

    expect(leafAt(leaves, "get").printers).toEqual(["printRecord"]);
  });

  it("finds an action written as a builder chain on the variable", () => {
    const leaves = scanFixture({
      "overview.ts": `
        import { printRecord } from "./output";
        export function register(parent: any): void {
          const overview = parent.command("overview").description("x");
          overview
            .addHelpText("after", "y")
            .action(async () => {
              printRecord({});
            });
        }
      `
    });

    expect(leafAt(leaves, "overview").printers).toEqual(["printRecord"]);
  });
});
