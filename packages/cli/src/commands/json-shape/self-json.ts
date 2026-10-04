import ts from "typescript";

import { dottedName } from "./calls";
import { ERROR_EMITTERS, SELF_JSON_MARKERS } from "./markers";
import { markSeen, shortName, type SourceIndex, type WalkStep } from "./module-index";
import { PRINTER_SET } from "./printers";
import { resolveDeclaration } from "./resolve-declaration";

/**
 * 🚨 `JSON.stringify` IS DELIBERATELY NOT A MARKER ON ITS OWN, AND THAT IS
 * MEASURED. Actions call it to serialise a `--body` argument or to build an
 * error hint; treating every one of those as an output decision marked 481 of
 * 481 joined leaves as self-json and classified NOTHING. Only the shape that
 * actually WRITES a document counts, detected structurally: `console.log` (or
 * `process.stdout.write`) whose argument IS a `JSON.stringify` call.
 */
export function bodyWritesJsonItself(body: ts.Node): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const name = dottedName(node.expression);
      const short = name.includes(".") ? (name.split(".").pop() as string) : name;
      if (SELF_JSON_MARKERS.has(name) || SELF_JSON_MARKERS.has(short)) {
        found = true;
        return;
      }
      if (
        (name === "console.log" || name === "process.stdout.write") &&
        node.arguments.some(
          (arg) => ts.isCallExpression(arg) && dottedName(arg.expression) === "JSON.stringify"
        )
      ) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

/**
 * Does this action, or anything it calls short of a printer, decide its own
 * `--json` output?
 *
 * 🚨 READING THE ACTION'S OWN BODY ALONE IS NOT ENOUGH, AND THE SECOND DEFECT
 * FOUND IN THIS SCAN WAS EXACTLY THAT SHAPE. `role automation-settings` calls
 * `printStatedOrNothing`, a helper in the same file whose body is
 *
 *     if (value !== null) { printRecord(value, fields); return true; }
 *     if (isJsonMode()) { console.log(JSON.stringify(null, null, 2)); }
 *
 * so the command answers a flat object OR the literal document `null`. Reading
 * only the action's body sees `printRecord` through the helper and nothing else,
 * and the line then promises "ONE FLAT OBJECT" for a command whose own help
 * correctly says it can emit `null`. Three reads in `role` share that helper.
 *
 * ⚠️ AND IT IS NOT ENOUGH TO ASK ONLY WHETHER A HELPER IS SELF-CONTRADICTORY.
 * A first version required a helper's own body to call a printer AND write a
 * document, on the reasoning that a write-only helper leaves the action with no
 * printer at all. `workflow test` breaks that: it prints a record WITHOUT
 * `--follow` and streams NDJSON through `runFollow` WITH it, so the action
 * reaches one printer and one write-only helper on different branches. It was
 * classified `record` while its own help said "--json EMITS NDJSON — one JSON
 * object per node state change, not one document". The contradiction control
 * caught it.
 *
 * So the question is asked at the ACTION: does anything it reaches, short of a
 * printer or an error emitter, write a document itself? Both terminal sets are
 * load-bearing — printers all consult the json flag internally, and every
 * `catch` block reaches `emitDocument` through `handleError`.
 */
export function reachesSelfJson(
  seed: ReadonlySet<string>,
  file: string,
  index: SourceIndex,
  ownBody: ts.Node
): boolean {
  if (bodyWritesJsonItself(ownBody)) return true;

  const seen = new Map<string, Set<string>>();
  const queue: WalkStep[] = [...seed].map((call) => ({ file, call }));

  while (queue.length > 0) {
    const step = queue.pop() as WalkStep;
    const short = shortName(step.call);

    if (PRINTER_SET.has(step.call) || PRINTER_SET.has(short)) continue;
    if (ERROR_EMITTERS.has(step.call) || ERROR_EMITTERS.has(short)) continue;

    const site = resolveDeclaration(index, step.file, step.call);
    if (site === null) continue;

    if (!markSeen(seen, site)) continue;

    const declaring = index.get(site.file);
    if (declaring === undefined) continue;

    for (const declared of declaring.bodies.get(site.name) ?? []) {
      if (bodyWritesJsonItself(declared)) return true;
    }

    for (const next of declaring.calls.get(site.name) ?? []) {
      queue.push({ file: site.file, call: next });
    }
  }

  return false;
}
