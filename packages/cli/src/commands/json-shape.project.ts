import path from "node:path";
import { fileURLToPath } from "node:url";

import { deriveCommandNodes } from "../command-universe";
import type { JsonShapeId } from "../json-shape-help";
import { scanJsonShapes, type ScannedLeaf, type ShapePrinter } from "./json-shape.scan";

/**
 * JOIN THE SCAN ONTO THE REAL COMMAND TREE — one projection, two readers.
 *
 * `scripts/generate-json-shape.ts` writes the result; `json-shape.codegen.test.ts`
 * recomputes it and fails on any difference. Both call THIS function, so the
 * generator and its gate cannot answer differently — two walks of one tree
 * disagreeing is the defect `command-universe.ts` already documents next door.
 *
 * ── WHY THE JOIN IS ON THE PATH SUFFIX, NOT ON THE SOURCE MODULE ────────────
 *
 * The scan reads a registration's path RELATIVE to whatever `Command` its
 * registrar was handed — `node get`, never `workflow node get` — because the
 * absolute prefix is decided by the caller at runtime. The real tree knows the
 * absolute path. So a scanned entry belongs to the leaf whose path ENDS WITH
 * it, taking the longest match: `node get` beats a bare `get`.
 *
 * 🚨 THE SOURCE MODULE IS NOT PART OF THE KEY, AND THAT WAS MEASURED RATHER
 * THAN ASSUMED. A `CommandNode`'s `sourceModule` is the module whose registrar
 * produced the ROOT of its tree, so every `workflow node …` leaf reports
 * `workflow.ts` while its registration is written in `workflow-builder.ts`.
 * Keying on it dropped 68 leaves, including all 21 of `admin vibe-*`.
 *
 * Dropping it is safe here because it was checked in both directions: keying on
 * the module classified 368 leaves, dropping it classified 410, and the two
 * AGREED on all 368 — 0 disagreements. A cross-module join is therefore purely
 * additive on this tree, and an ambiguous longest match is refused rather than
 * guessed.
 */

/** Every printer's shape id. Exhaustive by construction — `tsc` refuses a gap. */
const SHAPE_OF: Readonly<Record<ShapePrinter, JsonShapeId>> = {
  printRecord: "record",
  printList: "list",
  printTable: "array",
  printSuccess: "success",
  printDryRun: "dryRun",
  printEnvelope: "envelope"
};

export interface Projection {
  /** Leaf path -> shape, for every leaf the derivation can answer for. */
  readonly shapes: Readonly<Record<string, JsonShapeId>>;
  /** Every leaf in the tree, so a reader can size the silence. */
  readonly leafCount: number;
  /**
   * Leaves with no entry, and why — for the generated file's header, so the
   * shadow is a figure rather than an absence.
   */
  readonly unclassified: Readonly<Record<UnclassifiedReason, number>>;
}

export type UnclassifiedReason =
  /** No scanned registration whose relative path is a suffix of this leaf's. */
  | "no-registration"
  /** Two registrations tie at the longest match; guessing would be worse. */
  | "ambiguous"
  /** The action writes its own JSON, so the printer it reaches is the human branch. */
  | "writes-its-own-json"
  /** The action reaches none of the six. */
  | "no-printer"
  /** The action reaches more than one — the shape depends on a branch. */
  | "branches";

/** The scan's default root: this package's `src`. */
export function defaultSourceRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function bestMatch(pool: readonly ScannedLeaf[], leafPath: string): ScannedLeaf[] {
  const candidates = pool.filter(
    (entry) => leafPath === entry.relativePath || leafPath.endsWith(` ${entry.relativePath}`)
  );
  if (candidates.length === 0) return [];

  const depth = (entry: ScannedLeaf): number => entry.relativePath.split(" ").length;
  const longest = Math.max(...candidates.map(depth));
  return candidates.filter((entry) => depth(entry) === longest);
}

export async function projectJsonShapes(sourceRoot = defaultSourceRoot()): Promise<Projection> {
  const scanned = scanJsonShapes(sourceRoot);
  const leaves = (await deriveCommandNodes()).filter((node) => node.isLeaf);

  const shapes: Record<string, JsonShapeId> = {};
  const unclassified: Record<UnclassifiedReason, number> = {
    "no-registration": 0,
    ambiguous: 0,
    "writes-its-own-json": 0,
    "no-printer": 0,
    branches: 0
  };

  for (const leaf of leaves) {
    const best = bestMatch(scanned, leaf.path);

    if (best.length === 0) {
      unclassified["no-registration"] += 1;
      continue;
    }
    if (best.length > 1) {
      unclassified.ambiguous += 1;
      continue;
    }

    const entry = best[0];
    if (entry.selfJson) {
      unclassified["writes-its-own-json"] += 1;
      continue;
    }
    if (entry.printers.length === 0) {
      unclassified["no-printer"] += 1;
      continue;
    }
    if (entry.printers.length > 1) {
      unclassified.branches += 1;
      continue;
    }

    shapes[leaf.path] = SHAPE_OF[entry.printers[0]];
  }

  return { shapes, leafCount: leaves.length, unclassified };
}

/** The generated module's text. One function, so the writer and the gate share it. */
export function renderJsonShapeModule(projection: Projection): string {
  const entries = Object.entries(projection.shapes).sort(([left], [right]) =>
    left.localeCompare(right)
  );

  const shadow = Object.entries(projection.unclassified)
    .map(([reason, count]) => ` *   ${String(count).padStart(4)}  ${reason}`)
    .join("\n");

  return `import type { JsonShapeId } from "./json-shape-help";

/**
 * GENERATED by \`scripts/generate-json-shape.ts\`. DO NOT EDIT.
 *
 * Which of the five \`--json\` shapes each command prints, derived from the
 * printer its action reaches. \`commands/json-shape.scan.ts\` holds the
 * derivation and what it refuses to answer; \`json-shape-help.ts\` holds the
 * sentence each shape renders into \`--help\`.
 *
 * ${entries.length} of ${projection.leafCount} leaves are answered here. The
 * rest carry NO shape line, which is the honest output rather than a gap:
 *
${shadow}
 *
 * \`json-shape.codegen.test.ts\` recomputes this file and fails on any
 * difference, so a command whose printer changes turns the build red instead of
 * shipping a \`--help\` line that describes the old shape.
 */
export const JSON_SHAPES: Readonly<Record<string, JsonShapeId>> = {
${entries.map(([leafPath, shape]) => `  ${JSON.stringify(leafPath)}: "${shape}"`).join(",\n")}
};
`;
}
