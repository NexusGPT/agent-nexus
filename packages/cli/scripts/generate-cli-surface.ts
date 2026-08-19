#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { projectCliSurface, renderCliSurfaceModule } from "../src/cli-surface.project";

/**
 * Write `src/cli-surface.generated.ts` — the CLI's whole public surface.
 *
 *   pnpm --filter @agent-nexus/cli run gen:cli-surface
 *
 * The output path is resolved from THIS FILE rather than from the working
 * directory, so the command is right from anywhere. A `--out` resolved against
 * the cwd is how the docs generator once wrote 47 pages into a phantom tree and
 * reported success; there is no reason to repeat that shape for one file.
 *
 * `--check` writes nothing and exits 1 when the file on disk differs, naming
 * the command that fixes it. `cli-surface.codegen.test.ts` is the half CI runs;
 * this is the half a person runs.
 */

const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/cli-surface.generated.ts"
);

async function main(): Promise<void> {
  const projection = await projectCliSurface();
  const rendered = renderCliSurfaceModule(projection);

  if (process.argv.includes("--check")) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (current === rendered) {
      console.log(`up to date — ${projection.leaves.length} leaves`);
      return;
    }
    console.error("STALE: src/cli-surface.generated.ts");
    console.error("  fix: pnpm --filter @agent-nexus/cli run gen:cli-surface");
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(OUT, rendered);
  console.log(
    `wrote ${projection.leaves.length} leaves of ${projection.nodeCount} nodes;` +
      ` unjoined ${JSON.stringify(projection.unjoined)};` +
      ` shape collisions ${projection.shapeCollisions.length}`
  );
}

void main();
