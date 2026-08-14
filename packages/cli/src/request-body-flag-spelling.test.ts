import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Command } from "commander";
import { describe, expect, it } from "vitest";

import { buildRootProgram } from "./root-program";

/**
 * THE ROOT EPILOGUE NAMES THE COMMANDS THAT SPELL THE BODY FLAG `--data`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `--help` is written to be pasteable into an agent prompt as the ONLY source,
 * so a fact stated there is acted on without being checked. This one was false:
 *
 *   "nexus ticket create" and "nexus ticket update" take --data, not --body.
 *   This is the only namespace that does.
 *
 * FIVE commands across THREE namespaces take `--data` — `ticket create`,
 * `ticket update`, `credential update`, `access-card create` and
 * `access-card update`. Two of the three were absent from the sentence that
 * claimed to enumerate them, and the word "only" is what turned an incomplete
 * list into a wrong one: a reader who believes it does not go looking, reaches
 * for `--body` on `access-card create`, and gets `unknown option '--body'` from
 * a help page that told them the flag was universal outside `ticket`.
 *
 * The same claim had been copied into `util/body-satisfies-required.ts` and into
 * `content/docs/cli/troubleshooting.mdx`. One fact, three hand-maintained
 * copies, all three wrong — which is the argument for deriving it here rather
 * than for correcting it three times and hoping.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS CAN AND CANNOT SEE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The population is DERIVED from the real commander tree, so a command that
 * starts or stops spelling it `--data` moves this set without anyone editing a
 * list. What it checks is that the epilogue NAMES each member and names no
 * ex-member — both directions, because a list that has gone stale by omission
 * and one that has gone stale by accretion read identically on the page.
 *
 * It does NOT read the surrounding prose, so it cannot tell you the sentence is
 * well written or that its explanation is right. It refuses the specific defect
 * that shipped: a set of commands stated on the page that is not the set of
 * commands in the tree.
 */

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/** The epilogue is registered in `index.ts`, and read here as text. */
const INDEX = readFileSync(join(SRC_DIR, "index.ts"), "utf8");

/**
 * Every command in the tree, root included, depth first — the same walk
 * `body-satisfies-required.ts` performs, kept local so this spec has no opinion
 * about that module's exports.
 */
function everyCommand(root: Command): Command[] {
  const out: Command[] = [root];
  for (const child of root.commands) out.push(...everyCommand(child));
  return out;
}

/** `nexus ticket create` → `ticket create`. The root's own name is dropped. */
function commandPath(command: Command): string {
  const parts: string[] = [];
  let node: Command | null = command;
  while (node !== null && node.parent !== null) {
    parts.unshift(node.name());
    node = node.parent;
  }
  return parts.join(" ");
}

/**
 * Commands whose JSON REQUEST BODY is spelled `--data`.
 *
 * The `<json` placeholder test is load-bearing in both directions, and each side
 * of it has a live counterexample in this tree:
 *
 *   · `ticket comment --body <text-or-->` is a comment's TEXT, not a body.
 *   · `html-template render --data <json>` IS a `<json>` flag and is NOT a
 *     request body — it is the data a template renders against, on a namespace
 *     whose create and update take `--body`. It is in this set by shape, and the
 *     epilogue names it separately for exactly that reason.
 */
function dataFlagCommands(): string[] {
  return everyCommand(buildRootProgram())
    .filter((command) =>
      command.options.some((option) => option.long === "--data" && /<json/.test(option.flags))
    )
    .map(commandPath)
    .sort();
}

/** The epilogue's SENDING A BODY block — the paragraph making the claim. */
function sendingABodyBlock(): string {
  const start = INDEX.indexOf("SENDING A BODY");
  const end = INDEX.indexOf("SCOPES AND WHO YOU ARE", start);
  return start === -1 || end === -1 ? "" : INDEX.slice(start, end);
}

describe("the root epilogue's --data list is the tree's --data list", () => {
  it("read a real epilogue and a real tree", () => {
    // Anti-vacuity, both inputs. An empty block or an empty command set makes
    // every assertion below pass by checking nothing, and an empty scan reports
    // success identically to a clean one.
    expect(sendingABodyBlock().length).toBeGreaterThan(200);
    expect(dataFlagCommands().length).toBeGreaterThan(3);
  });

  it("names every command that spells the body flag --data", () => {
    const block = sendingABodyBlock();
    const missing = dataFlagCommands().filter((path) => !block.includes(`"${path}"`));
    expect(missing).toEqual([]);
  });

  it("names no command that has stopped spelling it --data", () => {
    // The other direction. A command renamed or switched to `--body` leaves its
    // name on the page, where it reads exactly like a fact still holding.
    const block = sendingABodyBlock();
    const live = new Set(dataFlagCommands());
    const quoted = [...block.matchAll(/"((?:[a-z][a-z-]*)(?: [a-z][a-z-]*)+)"/g)].map(
      (match) => match[1] as string
    );

    // Only names that ARE commands are judged; the block legitimately quotes
    // other things, and this spec is not the place to police those.
    const paths = new Set(everyCommand(buildRootProgram()).map(commandPath));
    const stale = quoted.filter((name) => paths.has(name) && !live.has(name));
    expect(stale).toEqual([]);
  });

  it("does not claim a single namespace owns the exception", () => {
    // The exact word that made an incomplete list into a false one. Three
    // namespaces do it, so any sentence scoping it to one is wrong however it
    // is phrased.
    expect(sendingABodyBlock()).not.toMatch(/only namespace/i);

    const namespaces = new Set(dataFlagCommands().map((path) => path.split(" ")[0]));
    expect(namespaces.size).toBeGreaterThan(1);
  });
});
