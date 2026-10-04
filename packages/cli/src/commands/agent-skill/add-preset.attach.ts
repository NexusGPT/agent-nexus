import type { NexusClient } from "@agent-nexus/sdk";

import { color, isJsonMode, printSuccess } from "../../output";
import { formatBytes } from "../../util/skill-bundle.format-bytes";
import { toBlob } from "./_shared/to-blob";
import type { PresetBundle } from "./add-preset.bundles";

/**
 * Attach each packed preset to the agent, replacing a name collision only when
 * `--replace` was passed and skipping it otherwise.
 */
export async function attachPresetBundles(
  client: NexusClient,
  agentId: string,
  bundles: readonly PresetBundle[],
  replace: boolean
): Promise<void> {
  const existing = await client.agents.skills.list(agentId);
  const byName = new Map(existing.skills.map((s) => [s.name, s]));

  const attached: Record<string, unknown>[] = [];
  for (const { preset, zip, fileCount } of bundles) {
    const collision = byName.get(preset.name);
    if (collision && !replace) {
      if (!isJsonMode()) {
        console.log(
          color.yellow(
            `  ${preset.name} — already attached (${collision.id}); skipped. Re-run with --replace to overwrite.`
          )
        );
      }
      attached.push({ name: preset.name, id: collision.id, status: "skipped" });
      continue;
    }

    if (collision) {
      const result = await client.agents.skills.uploadZip(agentId, collision.id, toBlob(zip));
      attached.push({ name: preset.name, id: result.id, status: "replaced" });
      if (!isJsonMode()) {
        console.log(
          `  ${color.cyan(preset.name.padEnd(16))} replaced (${fileCount} files, ${formatBytes(zip.length)})`
        );
      }
      continue;
    }

    const created = await client.agents.skills.create(
      agentId,
      { name: preset.name, description: preset.description },
      toBlob(zip)
    );
    attached.push({ name: preset.name, id: created.id, status: "created" });
    if (!isJsonMode()) {
      console.log(
        `  ${color.cyan(preset.name.padEnd(16))} attached (${fileCount} files, ${formatBytes(zip.length)})`
      );
    }
  }

  if (isJsonMode()) {
    console.log(JSON.stringify({ success: true, agentId, skills: attached }, null, 2));
  } else {
    printSuccess(`${attached.length} skill(s) processed for agent ${agentId}.`);
  }
}
