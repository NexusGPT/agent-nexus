#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderResponseContractModule } from "./response-contract.project";

/**
 * Write `src/response-contract.generated.ts`.
 *
 *   pnpm --filter @agent-nexus/sdk run gen:response-contract
 *
 * The output path is resolved from THIS FILE, never from the working directory.
 * A `--out` resolved against the cwd is how this repository's docs generator
 * once wrote 47 pages into a phantom tree and reported success.
 *
 * `--check` writes nothing and exits 1 when the file on disk differs, naming
 * the command that fixes it. `response-contract.codegen.test.ts` runs the same
 * comparison inside the suite — this is the half a person runs, that is the
 * half CI runs, and both call the SAME renderer so neither can drift.
 */

const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/response-contract.generated.ts"
);

function main(): void {
  const rendered = renderResponseContractModule();

  if (process.argv.includes("--check")) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (current === rendered) {
      console.log("up to date — src/response-contract.generated.ts");
      return;
    }
    console.error("STALE: src/response-contract.generated.ts");
    console.error("  fix: pnpm --filter @agent-nexus/sdk run gen:response-contract");
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(OUT, rendered);
  console.log(`wrote ${OUT}`);
}

main();
