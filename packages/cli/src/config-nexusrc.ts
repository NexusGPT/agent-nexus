import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// .nexusrc — directory pinning
// ---------------------------------------------------------------------------

const NEXUSRC_FILENAME = ".nexusrc";

/** Contents of a .nexusrc file. */
export interface NexusRcFile {
  profile: string;
}

/**
 * Walk up from `startDir` looking for a `.nexusrc` file.
 * Returns the parsed profile name and path, or null if not found.
 */
export function findNexusRc(
  startDir: string = process.cwd()
): { profile: string; rcPath: string } | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (true) {
    const rcPath = path.join(dir, NEXUSRC_FILENAME);
    try {
      const raw = fs.readFileSync(rcPath, "utf-8");
      const parsed = JSON.parse(raw) as NexusRcFile;
      if (parsed.profile && typeof parsed.profile === "string") {
        return { profile: parsed.profile, rcPath };
      }
    } catch {
      // Not found or invalid — keep walking
    }

    if (dir === root) break;
    dir = path.dirname(dir);
  }

  return null;
}

/** Write a `.nexusrc` file in the given directory. */
export function writeNexusRc(dir: string, profile: string): void {
  const rcPath = path.join(dir, NEXUSRC_FILENAME);
  fs.writeFileSync(rcPath, JSON.stringify({ profile }, null, 2) + "\n");
}

/** Remove a `.nexusrc` file from the given directory. Returns true if it existed. */
export function removeNexusRc(dir: string): boolean {
  const rcPath = path.join(dir, NEXUSRC_FILENAME);
  try {
    fs.unlinkSync(rcPath);
    return true;
  } catch {
    return false;
  }
}
