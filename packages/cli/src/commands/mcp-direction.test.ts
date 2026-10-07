import type { Command } from "commander";
import { describe, expect, it } from "vitest";

import { captureHelp } from "../command-universe";
import { buildRootProgram } from "../index";
import { MCP_INBOUND_DIRECTION, MCP_OUTBOUND_DIRECTION } from "./mcp-direction";

/**
 * THE GATE UNDER THE ONE SENTENCE THAT KEEPS `nexus mcp` AND `nexus mcp-server`
 * APART.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A SENTENCE IN `--help` NEEDS A GATE AT ALL
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The two namespaces are opposite directions of one protocol and their names
 * differ by one suffix. An operator who reaches for the wrong one is not told:
 * `nexus mcp tools list` answers a catalog, with exit 0, that STRUCTURALLY cannot
 * contain a tool from a connected MCP server — it is generated from the Nexus
 * Public API's own routes and reads no `McpServerTool` row. A complete-looking
 * answer to a question nobody asked is the symptom-versus-cause mismatch the
 * outbound surface was built to remove, so shipping it one layer out would be
 * self-defeating.
 *
 * 🚨 AND NOTHING ELSE IN THIS PACKAGE WOULD NOTICE IF THE SENTENCE WENT.
 * `cli-surface.generated.ts` records each leaf's flags, args, disposition and
 * `--json` shape — never its help PROSE — so deleting either direction block
 * leaves the surface manifest byte-identical, the docs projection regenerates
 * happily around it, and every one of this package's ~4,290 tests stays green.
 * Measured by deleting each block in turn before this file existed.
 *
 * ── WHY IT RENDERS THE TREE RATHER THAN READING THE SOURCE ──────────────────
 *
 * A `grep` over `commands/mcp.ts` proves a string is in a file. It does not
 * prove the string reaches a reader: `addHelpText` has to be CALLED, on the right
 * command, with the block actually interpolated into the template. Each of those
 * can be wrong while the constant sits in the module looking correct.
 *
 * So the subject is `captureHelp(buildRootProgram(…))` — the real configured root
 * this binary parses with, through the one funnel every derived capture in this
 * package uses. {@link helpRendersItsAfterBlocks} is the control that makes it
 * worth anything: `helpInformation()` renders a complete-looking help screen with
 * every `addHelpText` block MISSING, and a walk over one of those would satisfy
 * every assertion below having read none of the prose under test.
 */

/** One namespace's rendered `--help`, or a throw naming the namespace. */
function helpFor(namespace: string): string {
  const root = buildRootProgram("0.0.0-test");
  const found = root.commands.find((command: Command) => command.name() === namespace);
  if (found === undefined) {
    throw new Error(
      `no top-level command named "${namespace}" — it was renamed or removed, and ` +
        "a direction sentence on a namespace nobody can type reaches no operator."
    );
  }
  return captureHelp(found);
}

const INBOUND = helpFor("mcp");
const OUTBOUND = helpFor("mcp-server");

describe("both MCP namespaces say which direction they are", () => {
  /**
   * THE ANTI-VACUITY CONTROL, and it is not decoration: every assertion in this
   * file is a substring test over a rendered screen, and the one way to get a
   * screen with none of the prose on it is to render `helpInformation()` instead
   * of going through `captureHelp`. Both halves are needed — the second proves
   * the haystack can carry a sentence from an `addHelpText` block at all, which
   * is the property the direction assertions below rest on.
   */
  it("CONTROL: the capture includes the after-help blocks, not just the usage lines", () => {
    expect(INBOUND).toContain("Usage:");
    expect(INBOUND).toContain("ONE ENDPOINT SITS BEHIND ALL OF THIS");
    expect(OUTBOUND).toContain("Usage:");
    expect(OUTBOUND).toContain("ONLY AN APPROVED TOOL IS CALLABLE");
  });

  /**
   * The two blocks are DIFFERENT and neither is empty.
   *
   * 🔴 Without this, emptying both constants satisfies every `toContain` below
   * for free — `"".includes("")` is true and so is `anything.includes("")` — and
   * a mutation that deletes the whole of `mcp-direction.ts`'s content would score
   * as survived. Asserting the pair is DISTINCT also refuses the copy-paste
   * failure this module exists to prevent: one direction's prose on both screens
   * is worse than none, because it is confidently wrong on one of them.
   */
  it("CONTROL: the two blocks are non-empty and are not each other", () => {
    expect(MCP_INBOUND_DIRECTION.trim().length).toBeGreaterThan(200);
    expect(MCP_OUTBOUND_DIRECTION.trim().length).toBeGreaterThan(200);
    expect(MCP_INBOUND_DIRECTION).not.toBe(MCP_OUTBOUND_DIRECTION);
  });

  /**
   * ⚠️ ASSERTED AS THE WHOLE BLOCK, never as a phrase from it.
   *
   * A phrase assertion passes for the wrong reason by default: "MCP SERVER"
   * appears in both screens for honest reasons, and a reworded block would keep
   * satisfying a short needle while saying something else. The block is the unit
   * that was written, so it is the unit asserted — and because it is interpolated
   * verbatim, a drift between the constant and what renders is the only thing
   * this can fail on.
   */
  it("nexus mcp carries the INBOUND block, verbatim", () => {
    expect(INBOUND).toContain(MCP_INBOUND_DIRECTION);
  });

  it("nexus mcp-server carries the OUTBOUND block, verbatim", () => {
    expect(OUTBOUND).toContain(MCP_OUTBOUND_DIRECTION);
  });

  /** Neither screen may carry the other's block. See the distinctness control. */
  it("neither namespace carries the other's block", () => {
    expect(INBOUND).not.toContain(MCP_OUTBOUND_DIRECTION);
    expect(OUTBOUND).not.toContain(MCP_INBOUND_DIRECTION);
  });

  /**
   * THE PROPERTY AN OPERATOR ACTUALLY NEEDS, and the one a block could satisfy
   * every assertion above without having: being told where to go instead.
   *
   * A screen that says "this is the client direction" and stops leaves a reader
   * who guessed wrong exactly where they started. Each one has to NAME the other
   * command, spelled as it is typed.
   */
  it("each namespace names the other, spelled as it is typed", () => {
    expect(INBOUND).toContain('"nexus mcp-server"');
    expect(OUTBOUND).toContain('"nexus mcp"');
  });

  /**
   * And the cross-reference has to resolve. A sentence pointing at a command that
   * does not exist is worse than silence: it sends an operator to a refusal.
   *
   * `helpFor` throws on an absent namespace, so reaching this line at all is half
   * the proof; the names are asserted explicitly so a red says WHICH one moved.
   */
  it("both namespaces the sentences name are real top-level commands", () => {
    const names = buildRootProgram("0.0.0-test").commands.map((command: Command) => command.name());
    expect(names).toContain("mcp");
    expect(names).toContain("mcp-server");
  });
});
