#!/usr/bin/env tsx
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { deriveIdGraph } from "../src/id-graph";

/**
 * Regenerate the shrink-only ledger of leaves the id-threading harness cannot
 * reach.
 *
 *   pnpm --filter @agent-nexus/cli run gen:id-graph-ledger
 *
 * See `src/id-graph.uncovered.generated.ts` for what the ledger is FOR. This
 * script only writes it; `id-graph.ledger.test.ts` is what makes it a ratchet.
 */
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "id-graph.uncovered.generated.ts"
);

const graph = deriveIdGraph();
const rows = [...graph.excluded]
  .sort((left, right) => left.path.localeCompare(right.path))
  .map((leaf) => `  ["${leaf.path}", "${leaf.why}"]`);

const header = `// GENERATED FILE - DO NOT EDIT BY HAND.
// Regenerate: pnpm --filter @agent-nexus/cli run gen:id-graph-ledger
//
// THE LEAVES THE ID-THREADING HARNESS CANNOT REACH, AND WHY. A RATCHET.
//
// Each row is a leaf that takes a required id and cannot be swept: either no
// contract binding proves it is a read, or the contract says it mutates.
//
// \`id-graph.ledger.test.ts\` fails when a leaf appears here that this file does
// not already list. So a NEW command that takes an id and carries no
// \`bindCommand\` call turns the build red rather than joining a silent backlog -
// which is the whole difference between a harness that holds its coverage and
// one that decays back to nothing over a year.
//
// TO CLEAR A ROW, ADD THE BINDING, then regenerate. Rows LEAVING is always
// fine and never needs an edit here beyond the regeneration.
//
// TO ADD A ROW you must regenerate deliberately, which is the moment to ask
// whether the leaf should simply be bound instead. Adding one is not forbidden;
// it is just not silent.
//
// 🚨 REGENERATING IS NOT A WAY TO CLEAR A RED BUILD. A row that appears because
// somebody landed an unbound read is a coverage regression, and the fix is the
// \`bindCommand\` call, not this file.

/** \`[leaf path, why it cannot be reached]\`, sorted by path. */
export const ID_GRAPH_UNCOVERED: readonly (readonly [string, string])[] = [
`;

writeFileSync(OUT, `${header}${rows.join(",\n")}\n];\n`);
process.stdout.write(`wrote ${graph.excluded.length} rows to ${OUT}\n`);
