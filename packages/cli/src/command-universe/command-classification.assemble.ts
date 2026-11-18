/**
 * THE UNION OF THE DECLARED SLICES, AND THE REFUSAL THAT MAKES SLICING SAFE.
 *
 * `COMMAND_CLASSIFICATION` is ONE table with one denominator — `classify.ts`
 * diffs the derived tree against it, and an unclassified leaf is a failure
 * rather than a default. Holding it as several `command-classification.*.ts`
 * slices keeps that property only because this function is the single place
 * they meet.
 *
 * 🚨 A PLAIN SPREAD WOULD NOT. `{ ...a, ...b }` lets `b` silently win a key `a`
 * already declared, so one leaf could carry two dispositions and the later one
 * would just take effect — no error, no warning, and the gate still reporting
 * the leaf as classified. Measured with the repo's own compiler: a duplicate
 * key inside ONE object literal is `ts(1117)`, a hard error, while the same key
 * in two literals merged by spread produced NO diagnostic at all. So the
 * compile-time guarantee the single literal got for free does not survive the
 * split, and this function is what replaces it.
 *
 * ⚠️ IT REPLACES IT AT A DIFFERENT MOMENT, WHICH IS THE ONE REAL COST OF THE
 * SPLIT. `ts(1117)` refused at typecheck; this throws at MODULE LOAD. Every
 * spec that touches the command universe imports this module, so a duplicate
 * reds the suite on the first test that runs — but `tsc` alone will not catch
 * it, and that is a weakening rather than a wash.
 *
 * WHAT BELONGS HERE: the union, and refusals about the SHAPE of the slices.
 * WHAT DOES NOT: a leaf. Every path lives in a slice; one declared here would
 * be a declaration no slice can see.
 */

import type { CommandDisposition } from "./disposition";

/** One `command-classification.*.ts` slice, carrying the name of its own file. */
export interface ClassificationSlice {
  /**
   * The slice module's basename. Carried rather than derived so a collision
   * refusal can name two files a reader can open, instead of two array indices.
   */
  readonly file: string;
  /** That slice's leaves, exactly as it declares them. */
  readonly entries: Readonly<Record<string, CommandDisposition>>;
}

/**
 * Union every slice into the one declared table, refusing a leaf that appears
 * in more than one.
 *
 * The FIRST declaration of a colliding path is the one kept, so the thrown
 * state is deterministic — but the throw is unconditional, so no caller ever
 * observes it.
 *
 * @throws if any leaf is declared by two slices
 */
export function assembleClassification(
  slices: readonly ClassificationSlice[]
): Readonly<Record<string, CommandDisposition>> {
  const merged: Record<string, CommandDisposition> = {};
  const declaredIn = new Map<string, string>();
  const collisions: string[] = [];

  for (const slice of slices) {
    for (const [path, disposition] of Object.entries(slice.entries)) {
      const already = declaredIn.get(path);
      if (already !== undefined) {
        collisions.push(`  "${path}" — declared in ${already}, re-declared in ${slice.file}`);
        continue;
      }
      declaredIn.set(path, slice.file);
      merged[path] = disposition;
    }
  }

  if (collisions.length > 0) {
    throw new Error(
      `COMMAND_CLASSIFICATION: ${collisions.length} leaf/leaves declared in two slices.\n` +
        `${collisions.join("\n")}\n` +
        `A leaf has exactly one disposition. Delete whichever line is wrong — never ` +
        `both, and never reconcile them by widening one: the two values are a ` +
        `disagreement about what may be DONE with that command, and only one of them ` +
        `is the answer the sweep should act on.`
    );
  }

  return merged;
}
