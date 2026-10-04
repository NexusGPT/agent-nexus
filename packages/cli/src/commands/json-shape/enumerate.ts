import fs from "node:fs";
import path from "node:path";

/** A file this scan does not read. */
export function isScannable(file: string): boolean {
  const base = path.basename(file);
  return base.endsWith(".ts") && !base.endsWith(".test.ts") && !base.endsWith(".generated.ts");
}

export function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return isScannable(full) ? [full] : [];
  });
}
