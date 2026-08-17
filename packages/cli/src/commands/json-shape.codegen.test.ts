import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Command } from "commander";
import { describe, expect, it } from "vitest";

import { JSON_SHAPES } from "../json-shape.generated";
import { JSON_SHAPE_LINES, JSON_SHAPE_PREFIX } from "../json-shape-help";
import { buildRootProgram } from "../root-program";
import { projectJsonShapes, renderJsonShapeModule } from "./json-shape.project";

/**
 * THE GATE UNDER THE `--json` SHAPE LINE, IN THREE PARTS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * A GENERATED SENTENCE IS ONLY WORTH MORE THAN A HAND-WRITTEN ONE IF IT IS
 * RE-DERIVED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The whole argument for deriving each command's `--json` shape instead of
 * writing 383 sentences by hand is that a derivation cannot drift. That is only
 * true while something re-runs it. Otherwise the generated file is a hand-written
 * table with a misleading header, and the day someone swaps a `printTable` for a
 * `printList` the help keeps promising a bare array with generated authority
 * behind it.
 *
 * ── 1. FRESHNESS ────────────────────────────────────────────────────────────
 *
 * Recompute the projection and compare the whole module text. Byte equality
 * rather than key-by-key: the header carries the classified count and the
 * unclassified breakdown, and a shadow that grows silently is exactly the
 * reading this package refuses.
 *
 * ── 2. THE LINE REACHES THE REAL HELP ───────────────────────────────────────
 *
 * A map is not a help screen. `buildRootProgram()` is the object `index.ts`
 * runs, and the walk that installs these lines is registered on the FINISHED
 * tree — so a refactor that moves the call earlier would leave every line off
 * without changing this file. The cases below capture real `--help` output, one
 * leaf per shape, and read the sentence back.
 *
 * ── 3. THE CONTROL: PROSE MUST NOT CONTRADICT THE DERIVATION ────────────────
 *
 * 🚨 THIS IS THE HALF THAT FOUND A REAL DEFECT, AND IT IS DERIVED RATHER THAN
 * LISTED. Around forty commands already carry a hand-written sentence about
 * their own shape, written by people who ran the command. Those sentences are
 * an INDEPENDENT measurement of the same fact, so a disagreement means one of
 * the two is wrong — and either way it must not ship.
 *
 * Run against the first version of the scan, this comparison caught
 * `workspace search`: its action opens with `if (isJsonMode()) { … return; }`
 * and only then falls through to `printTable`, so the printer is real, in the
 * body, and unreachable under the one flag any of this is about. The derivation
 * said "a bare array"; the help said "the raw server object". The help was
 * right. `SELF_JSON_MARKERS` exists because of this case.
 *
 * ⚠️ THE CONTROL IS ONE-DIRECTIONAL AND SAYS SO. It can only speak about the
 * commands whose help happens to mention a shape. A wrong classification on a
 * command with no prose is invisible here, and no gate in this package can see
 * it — only running the command can. That is a limit, not a hole to paper over.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const GENERATED = path.resolve(here, "../json-shape.generated.ts");

/** The bytes a caller reads from `--help`. */
function helpText(command: Command): string {
  let captured = "";
  command.configureOutput({
    writeOut: (chunk: string) => {
      captured += chunk;
    },
    writeErr: (chunk: string) => {
      captured += chunk;
    }
  });
  command.outputHelp();
  return captured;
}

/**
 * The help MINUS the sentence this gate is checking.
 *
 * 🚨 STRIPPING ONLY THE LINE CARRYING THE PREFIX IS NOT ENOUGH, AND THAT COST A
 * FALSE RED ON 27 COMMANDS. The generated sentence is three lines, and its
 * SECOND line reads "This is NOT a bare array" — so a filter keyed on the
 * prefix leaves the phrase behind and the gate reads its own output as the
 * command's prose. Remove the whole sentence.
 */
function withoutGeneratedLine(help: string): string {
  let stripped = help;
  for (const line of Object.values(JSON_SHAPE_LINES)) stripped = stripped.split(line).join("");
  return stripped;
}

function resolve(root: Command, leafPath: string): Command | null {
  let cursor: Command = root;
  for (const segment of leafPath.split(/\s+/).filter(Boolean)) {
    const next = (cursor.commands as Command[]).find(
      (child) => child.name() === segment || child.aliases().includes(segment)
    );
    if (next === undefined) return null;
    cursor = next;
  }
  return cursor === root ? null : cursor;
}

describe("json-shape — the generated map is a projection, not a table", () => {
  it("matches a fresh projection byte for byte", async () => {
    const rendered = renderJsonShapeModule(await projectJsonShapes());
    expect(fs.readFileSync(GENERATED, "utf8")).toBe(rendered);
  }, 60_000);

  it("classifies enough of the tree to be worth shipping", () => {
    // A FLOOR, not an equality. Classifying MORE is always welcome; the number
    // dropping means a derivation that used to answer has stopped, which the
    // freshness case above reports as a diff rather than as a mystery.
    expect(Object.keys(JSON_SHAPES).length).toBeGreaterThanOrEqual(320);
  });

  it("names only shapes the help module can render", () => {
    for (const [leafPath, shape] of Object.entries(JSON_SHAPES)) {
      expect(JSON_SHAPE_LINES[shape], `${leafPath} -> ${shape}`).toBeDefined();
    }
  });
});

describe("json-shape — the line reaches the real --help", () => {
  const root = buildRootProgram("1.2.3");

  // One leaf per shape, resolved from the map rather than typed here, so a
  // renamed command cannot leave this case testing a path that no longer exists.
  const samples = (["record", "list", "array", "success"] as const).map((shape) => ({
    shape,
    leafPath: Object.entries(JSON_SHAPES).find(([, value]) => value === shape)?.[0]
  }));

  for (const { shape, leafPath } of samples) {
    it(`prints the ${shape} sentence on ${leafPath ?? "(no leaf!)"}`, () => {
      expect(leafPath, `no leaf classified as ${shape}`).toBeDefined();
      const command = resolve(root, leafPath as string);
      expect(command, `no command at ${leafPath}`).not.toBeNull();

      const help = helpText(command as Command);
      expect(help).toContain(JSON_SHAPE_PREFIX);
      // The first line of the sentence, which is the half that names the shape.
      expect(help).toContain(JSON_SHAPE_LINES[shape].split("\n")[0]);
    });
  }

  /**
   * The two shapes of self-json, each named by the command that exposed it.
   * Both were CLASSIFIED by an earlier version of this scan, and both would have
   * shipped a false sentence. They are here as regressions, not as examples.
   */
  const REFUSED: readonly { readonly leafPath: string; readonly why: string }[] = [
    {
      leafPath: "workspace search",
      why: "the ACTION opens with `if (isJsonMode()) { …; return; }`, so the printer below it is the human branch"
    },
    {
      leafPath: "role automation-settings",
      why: "a HELPER branches between printRecord and the literal document null, one call away from the action"
    },
    {
      leafPath: "workflow test",
      why: "it prints a record without --follow and streams NDJSON through runFollow with it, so the printer and the writer are on different branches"
    }
  ];

  /**
   * The other direction, and it is the one a refusal rule gets wrong quietly.
   *
   * `cloud-import`'s `printItems` / `printImportResult` call `printList`
   * UNCONDITIONALLY and consult `isJsonMode` only to suppress a human-only
   * footer underneath it. Treating that READ as an output decision dropped this
   * whole family from the map — a refusal is invisible in the help, so nothing
   * would have said so.
   */
  const CLASSIFIED_THROUGH_A_FOOTER_HELPER = [
    "cloud-import notion import",
    "cloud-import search"
  ] as const;

  for (const leafPath of CLASSIFIED_THROUGH_A_FOOTER_HELPER) {
    it(`CONTROL — ${leafPath} keeps its line (its helper READS the flag, it does not write a document)`, () => {
      expect(JSON_SHAPES[leafPath]).toBe("list");

      const command = resolve(root, leafPath);
      expect(command, `no command at ${leafPath}`).not.toBeNull();
      expect(helpText(command as Command)).toContain(JSON_SHAPE_PREFIX);
    });
  }

  for (const { leafPath, why } of REFUSED) {
    it(`CONTROL — ${leafPath} carries NO line (${why})`, () => {
      expect(JSON_SHAPES[leafPath]).toBeUndefined();

      const command = resolve(root, leafPath);
      expect(command, `no command at ${leafPath}`).not.toBeNull();
      expect(helpText(command as Command)).not.toContain(JSON_SHAPE_PREFIX);
    });
  }
});

describe("json-shape — hand-written prose agrees with the derivation", () => {
  const root = buildRootProgram("1.2.3");

  /**
   * A phrase in a command's own help, and the shape it ASSERTS.
   *
   * 🚨 EACH PATTERN HAS TO CARRY THE ASSERTION, NOT THE VOCABULARY. `/bare
   * array/` alone flagged 27 commands on its first run, every one of them a
   * FALSE red: the sentences that mention the phrase mostly NEGATE it —
   * "--json IS {data: […]}, NOT A BARE ARRAY" — so the word appears on exactly
   * the commands whose shape is the other one. So each pattern anchors on
   * `--json … IS`, which a negation cannot satisfy.
   */
  const ASSERTIONS: readonly { readonly pattern: RegExp; readonly shape: string }[] = [
    { pattern: /--json\s+(?:here\s+)?is\s+a\s+bare\s+array/i, shape: "array" },
    { pattern: /--json\s+(?:here\s+)?is\s+\{\s*data\s*:?\s*\[/i, shape: "list" },
    { pattern: /--json\s+here\s+is\s+\{data,\s*meta\}/i, shape: "list" },
    // A route under {data} that reports no paging counters. Still `list` — the
    // printer is the same and `JSON.stringify` simply drops the undefined key.
    { pattern: /--json\s+prints\s+\{data:\s*\[\.\.\.\]\}\s+and\s+no\s+meta/i, shape: "list" },
    // A command that can answer the literal document `null` has no single shape
    // at all. `role automation-settings` reads this way and must be refused, not
    // classified as the object its other branch prints.
    { pattern: /emits\s+the\s+literal\s+document\s+null/i, shape: "(none)" },
    // NDJSON is a stream of documents, not one — every printer here emits one.
    { pattern: /--json\s+emits\s+ndjson/i, shape: "(none)" }
  ];

  it("finds no command whose prose contradicts its derived shape", () => {
    const contradictions: string[] = [];

    for (const [leafPath, shape] of Object.entries(JSON_SHAPES)) {
      const command = resolve(root, leafPath);
      if (command === null) continue;

      const help = withoutGeneratedLine(helpText(command));

      for (const { pattern, shape: asserted } of ASSERTIONS) {
        if (!pattern.test(help)) continue;
        if (asserted !== shape) {
          contradictions.push(`${leafPath}: help asserts ${asserted}, derived ${shape}`);
        }
      }
    }

    expect(contradictions).toEqual([]);
  }, 60_000);

  it("CONTROL — the comparison discriminates", () => {
    // A pattern that matches nothing would make the case above vacuous. This
    // asserts the vocabulary is really present somewhere in the shipped help,
    // so a green above means "no contradiction" rather than "nothing looked".
    const matched = Object.keys(JSON_SHAPES).filter((leafPath) => {
      const command = resolve(root, leafPath);
      if (command === null) return false;
      const help = withoutGeneratedLine(helpText(command));
      return ASSERTIONS.some(({ pattern }) => pattern.test(help));
    });
    expect(matched.length).toBeGreaterThan(0);
  }, 60_000);
});
