import path from "node:path";

import { color, isJsonMode } from "../../output";
import { formatBytes } from "../../util/skill-bundle.format-bytes";
import type { PresetBundle, PresetSource } from "./add-preset.bundles";

/**
 * Report what `--dry-run` would have attached, and return without any Nexus
 * call. The bundles are already packed by the time this runs, which is why the
 * plan can carry real file counts and sizes.
 */
export function printDryRunPlan(
  agentId: string,
  bundles: readonly PresetBundle[],
  source: PresetSource
): void {
  const plan = bundles.map(({ preset, zip, fileCount }) => ({
    name: preset.name,
    description: preset.description,
    source: source.fromDir
      ? path.join(source.fromDir, preset.repoPath)
      : `${source.repo}@${source.ref}:${preset.repoPath}`,
    files: fileCount,
    zipBytes: zip.length
  }));

  if (isJsonMode()) {
    console.log(JSON.stringify({ dryRun: true, agentId, skills: plan }, null, 2));
    return;
  }

  console.log(color.bold(`\nWould attach ${plan.length} skill(s) to ${agentId}:\n`));
  for (const item of plan) {
    console.log(
      `  ${color.cyan(item.name.padEnd(16))} ${item.files} files, ${formatBytes(item.zipBytes)}`
    );
    console.log(`  ${"".padEnd(16)} ${color.dim(item.source)}`);
  }
  console.log();
}
