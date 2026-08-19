import type { Command } from "commander";

import { JSON_SHAPES } from "./json-shape.generated";

/**
 * THE `--json` SHAPE LINE, ON EVERY COMMAND WHOSE SHAPE CAN BE DERIVED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A LINE PER COMMAND AND NOT A PARAGRAPH ON THE ROOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `--json` is not uniformly wrapped, and the wrapping is not derivable from a
 * command's name: `agent list` answers `{data, meta}`, `task list` answers a
 * bare array, `agent create` answers `{success, …}` and `agent get` answers the
 * resource flat. So a caller who probes one command's shape has learned nothing
 * about the next.
 *
 * The cost of getting it wrong is SILENT, which is what makes it worth a line on
 * every screen rather than a rule on one. A `jq` path against the wrong pattern
 * returns `null` — an empty field, not a parse error — so the pipeline succeeds,
 * the script continues, and the value is simply gone. `.data[]` against a bare
 * array selects nothing; `.[]` against `{data, meta}` fails differently.
 *
 * A single paragraph on `nexus --help` cannot say any of that, because the
 * answer differs per command. That is the definition of what belongs in a
 * command's own help.
 *
 * ── WHERE THE ANSWER COMES FROM ─────────────────────────────────────────────
 *
 * `json-shape.generated.ts`, projected by `scripts/generate-json-shape.ts` from
 * `json-shape.scan.ts`. Nothing here is authored: the six shapes are six
 * functions in `output.ts`, each with one `if (_jsonMode)` branch, so "which
 * shape does this command print" is "which of the six does its action reach".
 * Read that file's header for what the derivation refuses to answer and why.
 *
 * 🚨 A COMMAND ABSENT FROM THE MAP GETS NO LINE, AND THAT IS THE POINT. Roughly
 * a quarter of the tree is not derivable — an action that composes its own
 * document, or branches to two shapes. A default would be a claim nobody
 * measured, which is the exact defect the `--help` completeness programme exists
 * to remove. Silence is the honest output.
 *
 * ⚠️ SOME COMMANDS ALSO CARRY A HAND-WRITTEN SENTENCE ABOUT THEIR SHAPE, and
 * that is deliberate rather than duplication left lying around. The generated
 * line states WHICH of the six; the hand-written note says why it surprises,
 * which sibling command differs, and what the wrong `jq` does. A prose note
 * cannot be generated and a generated line cannot be trusted to prose. What
 * keeps them honest is `json-shape.codegen.test.ts`, which reads the shipped
 * help of every classified leaf and fails when the prose contradicts the
 * derivation.
 */

/** The six shapes, keyed as the generated map spells them. */
export type JsonShapeId = "record" | "list" | "array" | "success" | "dryRun" | "envelope";

/**
 * The sentence for each shape.
 *
 * Exported so the gate asserts against THIS string rather than a second copy
 * typed into a test — a gate reading its own copy stays green while the line is
 * reworded into uselessness.
 *
 * ⚠️ THE `list` SENTENCE PROMISES `data` AND ONLY MENTIONS `meta`, DELIBERATELY.
 * `printList` emits `{ data, meta }`, and `JSON.stringify` DROPS a key whose
 * value is `undefined` — so a route reporting no paging counters produces
 * `{"data":[…]}` with no `meta` at all. `external-tool list` and
 * `html-template list` are both that shape and both say so in their own help,
 * which is how a first draft reading "the paging counters under .meta" was
 * caught: it would have contradicted two shipped notes and been wrong about the
 * commands they describe.
 */
export const JSON_SHAPE_LINES: Readonly<Record<JsonShapeId, string>> = {
  record:
    "OUTPUT --json: ONE FLAT OBJECT — this resource's own fields at the top\n" +
    "  level, with no {data, meta} envelope and no {success} wrapper. Read a\n" +
    "  field as .<name>; .data.<name> selects nothing and prints null.",
  list:
    "OUTPUT --json: {data: [...]} — the rows are under .data. NOT a bare array,\n" +
    "  so jq '.[]' selects nothing; iterate with jq '.data[]'. A \"meta\" key\n" +
    "  sits beside it carrying the paging counters, and is ABSENT on a route\n" +
    "  that reports none — so read meta.hasMore rather than assuming it.",
  array:
    "OUTPUT --json: A BARE ARRAY — the rows ARE the document. No envelope, no\n" +
    "  meta, [] when empty. jq '.data[]' selects nothing here; use jq '.[]'.",
  success:
    "OUTPUT --json: {success, message, ...} — a CONFIRMATION written by this\n" +
    "  CLI, not the stored resource. Read the object back with the matching\n" +
    '  "get" before trusting a write.',
  dryRun:
    "OUTPUT --json: {dryRun, message, ...} — nothing was changed. There is no\n" +
    '  "success" key, deliberately: a consumer switching on it sees a shape it\n' +
    "  does not recognise rather than one that lies.",
  envelope:
    "OUTPUT --json: THE SERVER'S OWN RESPONSE OBJECT, unnarrowed — the same\n" +
    '  document "nexus api GET <path>" returns for this route. The table above\n' +
    "  renders ONE key of it; the others are there and are not shown. NOT a bare\n" +
    "  array, so jq '.[]' selects nothing — name the key, e.g. jq '.folders[]'."
};

/** The stable prefix. The gate matches on this, so it must not be reworded lightly. */
export const JSON_SHAPE_PREFIX = "OUTPUT --json:";

/** The space-joined path of a command, from the root but without the root's own name. */
function pathOf(command: Command): string {
  const segments: string[] = [];
  let cursor: Command | null = command;

  while (cursor?.parent) {
    segments.unshift(cursor.name());
    cursor = cursor.parent;
  }

  return segments.join(" ");
}

/**
 * Install the shape line on every command the map classifies.
 *
 * Call LAST in `buildRootProgram`, after every registrar — the commands
 * registered afterwards are not in the tree this walks. `"after"` fires only on
 * the command it is registered on, which is exactly the per-command position,
 * and it lands above the known-issues pointer and the scope footer rather than
 * competing with them for the last slot.
 */
export function applyJsonShapeHelpLine(program: Command): void {
  const visit = (command: Command): void => {
    const children = command.commands as Command[];

    // Leaves only. A namespace prints no document of its own, and a line on one
    // would describe whichever subcommand the reader has not chosen yet.
    if (children.length === 0) {
      const shape = JSON_SHAPES[pathOf(command)];
      if (shape !== undefined) command.addHelpText("after", `\n${JSON_SHAPE_LINES[shape]}`);
      return;
    }

    for (const child of children) visit(child);
  };

  visit(program);
}
