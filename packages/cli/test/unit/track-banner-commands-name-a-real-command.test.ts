import { renderTrackBanner, TRACK_BANNER_COMMANDS } from "@nexus/types/domain";
import { describe, expect, it } from "vitest";

import { deriveCommandLeaves } from "../../src/command-universe";

/**
 * THE DRIFT GATE FOR THE COLLISION BANNER.
 *
 * 🔴 A BANNER NAMING A COMMAND THE CLI DOES NOT REGISTER IS AN INSTRUCTION THAT
 * FAILS IN THE READER'S HANDS. The banner is the ONLY place that instruction
 * lives — not the docs, not a skill, not a system prompt — so there is no second
 * copy for a reader to fall back on, and a rename that silently breaks it costs
 * the whole collision-avoidance mechanism on the one read that mattered.
 *
 * `generate-track-banner-commands.ts` refuses at GENERATION time. This file is
 * the other half: it refuses at BUILD time, so a committed map that stopped
 * matching the tree cannot pass CI merely because nobody re-ran the generator.
 *
 * Both directions, plus a floor, in the shape `help-truth.test.ts` uses.
 *
 * ⚠️ IT LIVES IN `test/unit/` AND NOT IN `src/`, AND THAT IS NOT FILING. The
 * package's `tsconfig.json` sets `rootDir: src` and includes only `src`, so a
 * file there may not import across the package boundary at all — the same
 * import from `src/` fails `tsc` with TS6059 while vitest runs it happily, which
 * is a green test and a red build.
 *
 * `@nexus/types` is imported BY NAME rather than by source path because
 * `vitest.config.ts` aliases that specifier to `../types/src/index.ts`. So this
 * gate reads the SOURCE of the generated map, not a `dist/` copy that could be
 * behind it — a drift test comparing the tree against a stale build of itself
 * would be green for the wrong reason.
 */

/**
 * The command path a banner string names, as commander spells it — the words
 * before the first placeholder, with the program name dropped.
 *
 * Parsed from the STRING rather than taken from a second table: the string is
 * what a reader actually pastes, so it is what must resolve.
 */
function commandPathOf(invocation: string): string {
  return invocation
    .split(/\s+/)
    .slice(1)
    .filter((word) => !word.startsWith("<") && !word.startsWith("[") && !word.startsWith("-"))
    .join(" ");
}

/** Every command string a banner can render, taken from the renderer itself. */
function everyRenderedBanner(): readonly string[] {
  const now = new Date("2026-08-18T12:00:40.000Z");
  return [
    renderTrackBanner({ holder: null, now }),
    renderTrackBanner({
      holder: { agentName: "an-agent", lastHeardAt: new Date("2026-08-18T12:00:00.000Z") },
      now
    })
  ];
}

describe("every track banner names a command this CLI registers", () => {
  it("the leaf walk found the whole tree, not a fragment", async () => {
    const leaves = await deriveCommandLeaves();

    // 🔴 THE CONTROL, AND WITHOUT IT EVERY ASSERTION BELOW IS VACUOUS. A broken
    // walk recognises nothing, so the reverse direction would report "the CLI
    // does not register this command" for a command that is registered
    // perfectly — the same red a genuine rename produces, pointing at the wrong
    // file. A floor rather than an exact count: an exact count is a second
    // inventory to maintain.
    expect(leaves.length).toBeGreaterThan(400);
  });

  it("REVERSE — every row resolves to a command the CLI registers", async () => {
    const leaves = new Set(await deriveCommandLeaves());
    const rows = Object.entries(TRACK_BANNER_COMMANDS);

    // The map is not empty. An empty map satisfies the loop having checked
    // nothing, and it is what a generator bug would produce.
    expect(rows.length).toBeGreaterThan(0);

    for (const [action, invocation] of rows) {
      const path = commandPathOf(invocation);
      expect({ action, path, registered: leaves.has(path) }).toEqual({
        action,
        path,
        registered: true
      });
    }
  });

  it("FORWARD — every command a banner renders has a row in the map", () => {
    const known = new Set(Object.values(TRACK_BANNER_COMMANDS));

    for (const banner of everyRenderedBanner()) {
      // Each rendered form must carry at least one KNOWN command. A new banner
      // form built from a hand-typed string fails here rather than shipping an
      // instruction nothing generated.
      const carried = [...known].filter((invocation) => banner.includes(invocation));
      expect({ banner, carried: carried.length }).toEqual({ banner, carried: 1 });
    }
  });

  it("FORWARD — no banner names a `nexus` command the map does not hold", () => {
    const known = [...Object.values(TRACK_BANNER_COMMANDS)];

    for (const banner of everyRenderedBanner()) {
      // Strip every known command, then look for a surviving `nexus …`. That is
      // a hand-typed invocation, which is precisely what rule 2 forbids.
      let residue = banner;
      for (const invocation of known) residue = residue.split(invocation).join("");
      expect({ banner, strayCommand: /\bnexus\s+\S/.test(residue) }).toEqual({
        banner,
        strayCommand: false
      });
    }
  });

  it("BOTH FORMS carry a command — a form 2 with none informs and strands", () => {
    const [ready, held] = everyRenderedBanner();

    // The take-over form needs the command MORE than the ready form does: an
    // agent that reads "last heard 4h ago", judges the holder gone, and is
    // handed nothing to act on has been informed and stranded.
    expect(ready).toContain(TRACK_BANNER_COMMANDS.claimTask);
    expect(held).toContain(TRACK_BANNER_COMMANDS.claimTask);

    // And they name the SAME command, because a claim on a held task succeeds
    // and overwrites — claiming and taking over are one operation.
    expect(commandPathOf(TRACK_BANNER_COMMANDS.claimTask)).toBe("tracks task claim");
  });
});
