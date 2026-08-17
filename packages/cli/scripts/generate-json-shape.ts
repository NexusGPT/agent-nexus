#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { projectJsonShapes, renderJsonShapeModule } from "../src/commands/json-shape.project";

/**
 * Write `src/commands/json-shape.generated.ts`.
 *
 *   pnpm --filter @agent-nexus/cli exec tsx scripts/generate-json-shape.ts
 *
 * The output path is resolved from THIS FILE rather than from the working
 * directory, so the command is right from anywhere. A `--out` resolved against
 * the cwd is how the docs generator once wrote 47 pages into a phantom tree and
 * reported success; there is no reason to repeat that shape for one file.
 *
 * `--check` writes nothing and exits 1 when the file on disk differs, naming
 * the command that fixes it. The spec beside the module is the half CI runs;
 * this is the half a person runs.
 */

const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/json-shape.generated.ts"
);

async function main(): Promise<void> {
  const projection = await projectJsonShapes();
  const rendered = renderJsonShapeModule(projection);

  if (process.argv.includes("--check")) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (current === rendered) {
      console.log(`up to date — ${Object.keys(projection.shapes).length} classified`);
      return;
    }
    console.error("STALE: src/json-shape.generated.ts");
    console.error("  fix: pnpm --filter @agent-nexus/cli exec tsx scripts/generate-json-shape.ts");
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(OUT, rendered);
  console.log(
    `wrote ${Object.keys(projection.shapes).length} of ${projection.leafCount} leaves;` +
      ` unclassified ${JSON.stringify(projection.unclassified)}`
  );
}

void main();
