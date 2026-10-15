import path from "node:path";
import { fileURLToPath } from "node:url";

import { deriveCommandNodes } from "../../command-universe";
import type { JsonShapeId } from "../../json-shape-help";
import { scanJsonShapes } from "../json-shape.scan";
import { bestMatch } from "./best-match";
import { type Projection, SHAPE_OF, type UnclassifiedReason } from "./projection";

/**
 * The scan's default root: this package's `src`.
 *
 * 🚨 TWO `..` SEGMENTS, AND THE COUNT IS A PROPERTY OF THIS FILE'S DEPTH RATHER
 * THAN OF THE ANSWER. The resolver is module-relative, so moving it one
 * directory deeper moves the scan root with it — `src/` becomes
 * `src/commands/` — and every count this projection reports STAYS IDENTICAL,
 * because every `.command()` registration already lives under `commands/`. The
 * only tell is a lost path prefix in what the scan reports. It read `".."` while
 * it sat in `commands/json-shape.project.ts`; it reads `"..", ".."` here, the
 * same spelling `status-verdict/finding.ts` and
 * `envelope-narrowing/narrowing.ts` carry for the same reason.
 */
export function defaultSourceRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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
