import type { Command } from "commander";
import { describe, expect, it } from "vitest";

import { buildRootProgram } from "../root-program";
import { ROLE_NAMESPACE_AREAS, ROLE_NAMESPACE_INDEX } from "./role-body-shapes";

/**
 * THE GATE UNDER `nexus role --help`'s GROUPED INDEX.
 *
 * `nexus role` registers dozens of verbs and commander prints them in ONE
 * alphabetical block, so the namespace reads flatter and larger than it is.
 * `ROLE_NAMESPACE_INDEX` is the grouping that block cannot carry.
 *
 * 🚨 A HAND-MAINTAINED SECOND LIST OF THE SAME THINGS IS A LIE WAITING FOR THE
 * NEXT COMMIT, AND NOTHING RENDERS DIFFERENTLY WHEN IT ARRIVES. Register a verb
 * without claiming it, and the help page still prints — one line short, with no
 * signal anywhere. This file is why the index is allowed to exist at all: it
 * compares the areas against the LIVE commander tree, in BOTH directions.
 *
 * The comparison is against `buildRootProgram()`, never a hand-built `Command`,
 * for the reason `help-suggestions.ledger.test.ts` gives: a throwaway program
 * carries none of the decorations `index.ts` installs after every registrar.
 */

function roleVerbs(): readonly string[] {
  const root = buildRootProgram("1.2.3");
  const role = root.commands.find((child: Command) => child.name() === "role");

  // A missing `role` namespace must FAIL rather than yield an empty list — an
  // empty tree satisfies "no unclaimed verb" perfectly and would read green.
  expect(role).toBeDefined();

  return (role as Command).commands
    .map((child: Command) => child.name())
    .filter((name: string) => name !== "help");
}

const claimed = ROLE_NAMESPACE_AREAS.flatMap((area) => area.verbs);

describe("the role namespace index describes the commands that exist", () => {
  it("claims every registered verb exactly once", () => {
    const registered = roleVerbs();

    // Direction 1: a verb somebody registered and no area claims. This is the
    // one that happens — a new command lands, the index silently omits it.
    const unclaimed = registered.filter((name) => !claimed.includes(name));
    expect(unclaimed).toEqual([]);

    // Direction 2: an area naming a verb the tree no longer has, which is what
    // a rename leaves behind. The index would then point at nothing.
    const stale = claimed.filter((name) => !registered.includes(name));
    expect(stale).toEqual([]);

    // And no verb sits in two areas — that would inflate the rendered count and
    // make the two directions above pass while the index double-counts.
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(claimed.length).toBe(registered.length);
  });

  /**
   * The rendered count is derived, and this is the case that proves it is
   * derived from THIS list rather than typed beside it.
   */
  it("prints the count it actually claims", () => {
    expect(ROLE_NAMESPACE_INDEX).toContain(`The ${claimed.length} verbs are`);
    expect(ROLE_NAMESPACE_INDEX).toContain(`${ROLE_NAMESPACE_AREAS.length} areas:`);
  });

  /**
   * The index has to REACH the help, not merely exist. A constant that is never
   * interpolated satisfies every case above.
   */
  it("reaches the real --help of the namespace", () => {
    const root = buildRootProgram("1.2.3");
    const role = root.commands.find((child: Command) => child.name() === "role") as Command;

    let captured = "";
    role.configureOutput({
      writeOut: (str: string) => {
        captured += str;
      },
      writeErr: (str: string) => {
        captured += str;
      }
    });
    role.outputHelp();

    expect(captured).toContain(
      "THAT LIST IS ALPHABETICAL, WHICH IS NOT AN ORDER ANYONE READS IT IN"
    );
    for (const area of ROLE_NAMESPACE_AREAS) {
      expect(captured).toContain(area.label);
    }

    // The control: the probe above is the namespace's and no leaf's, so a
    // `find` that returned the wrong command cannot satisfy both halves.
    const attach = role.commands.find((child: Command) => child.name() === "attach") as Command;
    let leafHelp = "";
    attach.configureOutput({
      writeOut: (str: string) => {
        leafHelp += str;
      },
      writeErr: (str: string) => {
        leafHelp += str;
      }
    });
    attach.outputHelp();
    expect(leafHelp).not.toContain("THAT LIST IS ALPHABETICAL");
  });
});
