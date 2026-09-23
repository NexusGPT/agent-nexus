import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Unpacks the bundle into `dir` with the system `tar`. Entries live under
 * `package/`, like any npm tarball, so the first path component is stripped.
 */
export function extractBundle(bytes: Buffer, dir: string): void {
  const scratch = mkdtempSync(join(tmpdir(), "nexus-app-starter-"));
  try {
    const archive = join(scratch, "bundle.tgz");
    writeFileSync(archive, bytes);
    execFileSync("tar", ["-xzf", archive, "-C", dir, "--strip-components=1"], {
      stdio: ["ignore", "ignore", "pipe"]
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
