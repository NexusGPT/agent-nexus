import fs from "node:fs";
import path from "node:path";

/** A file this scan deliberately does not read. */
function isScannable(file: string): boolean {
  const base = path.basename(file);
  return (
    base.endsWith(".ts") &&
    !base.endsWith(".test.ts") &&
    // Bundled skill markdown, embedded as string literals. Megabytes of other
    // people's shell scripts, none of it this CLI's control flow.
    !base.endsWith(".generated.ts") &&
    // This file and its gate describe the defect in prose and in fixtures.
    !base.startsWith("json-error-document.")
  );
}

/** Every scannable `.ts` under a directory. */
export function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return isScannable(full) ? [full] : [];
  });
}
