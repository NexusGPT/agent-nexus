import { isIgnored } from "./skill-bundle.ignored-segments";
import { readTarGz } from "./tar";
import type { ZipEntry } from "./zip";

/**
 * Pull one skill's files out of a repo tarball, stripping the archive's
 * generated root directory (`<repo>-<ref>/`) and the skill's own path prefix so
 * `SKILL.md` lands at the root of the resulting bundle.
 */
export function extractPresetFromTarball(tarball: Buffer, repoPath: string): ZipEntry[] {
  const entries = readTarGz(tarball);
  if (entries.length === 0) {
    throw new Error("Downloaded archive contained no files.");
  }

  // GitHub wraps everything in one generated top-level directory whose name
  // encodes the ref, so it cannot be hardcoded — take it from the first entry.
  const root = entries[0].path.split("/")[0];
  const prefix = `${root}/${repoPath}/`;

  const files: ZipEntry[] = [];
  for (const entry of entries) {
    if (!entry.path.startsWith(prefix)) continue;
    const relative = entry.path.slice(prefix.length);
    if (relative.length === 0) continue;
    if (relative.split("/").some((segment) => isIgnored(segment))) continue;
    files.push({ path: relative, content: entry.content });
  }

  if (files.length === 0) {
    throw new Error(
      `"${repoPath}" was not found in the downloaded archive. It may have been renamed or moved upstream.`
    );
  }
  if (!files.some((file) => file.path === "SKILL.md")) {
    throw new Error(`"${repoPath}" has no SKILL.md at its root — it is not a valid skill folder.`);
  }
  return files;
}
