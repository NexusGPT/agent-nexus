/**
 * `mcp-server list` COUNTS EVERY TOOL STATUS, AND THE COLUMN SET IS TOTAL.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS PROTECTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The table used to carry a hand-written `approved` / `pending` /
 * `drifted = changed + removed`. That is FOUR of the five `McpToolStatus`
 * members, and the one it dropped was `REJECTED` — a tool an administrator
 * answered NO to was uncounted in this view entirely, reachable only by running
 * `mcp-server get`. Nothing was red: the column list was hand-written, so the
 * missing status was a column nobody wrote rather than a value nobody read.
 *
 * `McpServerToolCountsSchema`'s own docblock names that hazard and solves it one
 * layer up — *"adding a status to `McpToolStatus` must not leave a count silently
 * uncollected"* — with `PUBLIC_TOOL_COUNT_KEY_BY_STATUS`, a
 * `Record<McpToolStatusValue, keyof McpServerToolCounts>` that fails to compile
 * when the enum grows. The CLI never re-established it, which is the whole
 * defect: the guarantee was solved one layer above the consumer that dropped it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 WHY A RUNTIME ARM, WHEN THE COLUMN MAP ALREADY `satisfies` THE KEY SET
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `satisfies Readonly<Record<keyof McpServerToolCounts, string>>` at the site is
 * the primary guard and it is a COMPILE-TIME one, so it holds only while the
 * CLI's types and the published schema are in one program. The CLI resolves that
 * type from `@agent-nexus/sdk`, which carries its OWN `McpServerToolCounts`
 * interface — pinned `Equals` to the v1 contract by the SDK's
 * `v1-response-types-match-the-contract.test.ts`, and a hand-written interface
 * all the same. So the chain a new PRISMA status travels is
 *
 *   schema.prisma -> McpToolStatusValue -> PUBLIC_TOOL_COUNT_KEY_BY_STATUS
 *                 -> McpServerToolCounts (types) -> McpServerToolCounts (SDK)
 *                 -> this table's column map
 *
 * and every link but the last is somebody else's file. This arm reads the
 * PUBLISHED schema's own shape at runtime and compares it with the columns the
 * table actually renders, so a status that reached the published surface and not
 * this table is a RED here rather than a column nobody noticed was missing.
 *
 * ⚠️ IT IS NOT A SUBSTITUTE FOR THE `satisfies`, AND NEITHER COVERS THE OTHER.
 * The `satisfies` catches a key the CLI can see and has no label for, at compile
 * time, before anything runs. This catches a key that exists in the published
 * schema while the SDK's mirror of it is stale — the case where the CLI compiles
 * perfectly and still drops a status, which is the case that actually happened.
 */
import { describe, expect, it } from "vitest";

import { PUBLISHED_TOOL_COUNT_KEYS } from "../../mcp-server-tool-counts.conformance";
import { MCP_SERVER_LIST_TOOL_COUNT_COLUMNS } from "./list.command";

/**
 * The published count names, read off the schema rather than restated — through
 * the conformance module, which is the only file allowed to import
 * `@nexus/types`. That module's header carries the three walls and what the pin
 * cannot see.
 */
const PUBLISHED_COUNT_KEYS = [...PUBLISHED_TOOL_COUNT_KEYS].sort();

const COLUMN_KEYS = MCP_SERVER_LIST_TOOL_COUNT_COLUMNS.map(({ key }) => String(key)).sort();

describe("mcp-server list counts every tool status", () => {
  it("derives a real population from the published schema", () => {
    // The vacuity control ahead of every arm below. `Object.keys` over a schema
    // whose `.shape` moved or disappeared returns `[]`, and `[]` would compare
    // equal to an empty column set — two broken things agreeing.
    expect(PUBLISHED_COUNT_KEYS.length).toBeGreaterThan(0);
    expect(PUBLISHED_COUNT_KEYS).toContain("rejected");
  });

  it("renders one column per published count, and no column for anything else", () => {
    // 🔴 THE ARM. Set EQUALITY in both directions, so this fails on a published
    // count with no column (the defect that shipped) and on a column keyed to a
    // count the surface does not publish (a label left behind after a rename).
    // A composite column such as `changed + removed` fails it too, which is
    // deliberate: that is the shape that hid `rejected`, and it renders two facts
    // as one number while belonging to neither.
    expect(COLUMN_KEYS).toEqual(PUBLISHED_COUNT_KEYS);
  });

  it("gives REJECTED a column a reader can see without running `get`", () => {
    // The status the hand-written list dropped, named rather than inferred from
    // the set arm above — so a reader of a failure knows which one went.
    const rejected = MCP_SERVER_LIST_TOOL_COUNT_COLUMNS.find(({ key }) => key === "rejected");

    expect(rejected).toBeDefined();
    expect(rejected?.label).toBe("REJECTED");
    // The header is the widest cell the column needs, so a narrower width would
    // truncate the only thing that names the status.
    expect(rejected?.width).toBeGreaterThanOrEqual("REJECTED".length);
  });

  it("gives every column a header wide enough to print, APPROVED included", () => {
    // The positive control for the width arm above: it holds for the column that
    // was always there, so a `toBeGreaterThanOrEqual` passing on `rejected` is
    // not passing because widths are unset and `undefined` compares oddly.
    for (const { label, width } of MCP_SERVER_LIST_TOOL_COUNT_COLUMNS) {
      expect(width, `${label} is narrower than its own header`).toBeGreaterThanOrEqual(
        label.length
      );
    }
    expect(MCP_SERVER_LIST_TOOL_COUNT_COLUMNS.map(({ label }) => label)).toContain("APPROVED");
  });
});
