import { markSeen, shortName, type SourceIndex, type WalkStep } from "./module-index";
import { DOMINANT_PRINTER, PRINTER_SET } from "./printers";
import { resolveDeclaration } from "./resolve-declaration";

/**
 * Which of the six does this set of calls reach, transitively?
 *
 * The six are TERMINALS: reaching one records it and stops. See the header for
 * why expanding `printList` classifies all 53 list commands as ambiguous.
 */
export function reachedPrinters(
  seed: ReadonlySet<string>,
  file: string,
  index: SourceIndex
): Set<string> {
  const seen = new Map<string, Set<string>>();
  const found = new Set<string>();
  const queue: WalkStep[] = [...seed].map((call) => ({ file, call }));

  while (queue.length > 0) {
    const step = queue.pop() as WalkStep;

    // A method call (`this.render`, `client.agents.get`) is keyed by its last
    // segment, because that is how the function is DECLARED.
    const short = shortName(step.call);

    if (PRINTER_SET.has(step.call)) {
      found.add(step.call);
      continue;
    }
    if (PRINTER_SET.has(short)) {
      found.add(short);
      continue;
    }

    const site = resolveDeclaration(index, step.file, step.call);
    if (site === null) continue;

    if (!markSeen(seen, site)) continue;

    for (const next of index.get(site.file)?.calls.get(site.name) ?? []) {
      queue.push({ file: site.file, call: next });
    }
  }

  return found.has(DOMINANT_PRINTER) ? new Set([DOMINANT_PRINTER]) : found;
}
