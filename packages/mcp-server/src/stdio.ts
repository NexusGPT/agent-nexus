#!/usr/bin/env node
import { startStdioProxy } from "./proxy";

async function main() {
  await startStdioProxy();
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
