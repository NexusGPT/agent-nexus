import path from "node:path";

/** Two named files with one base name would overwrite each other under `out`. */
export function duplicateBaseName(files: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const file of files) {
    const base = path.basename(file);
    if (seen.has(base)) return base;
    seen.add(base);
  }
  return undefined;
}
