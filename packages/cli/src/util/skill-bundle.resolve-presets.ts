import { SKILL_PRESET_GROUPS, SKILL_PRESETS, type SkillPreset } from "./skill-bundle.presets";

/**
 * Expand preset names and group aliases into a deduplicated preset list,
 * preserving the order the user asked for.
 */
export function resolvePresets(names: readonly string[]): SkillPreset[] {
  const resolved: SkillPreset[] = [];
  const seen = new Set<string>();

  for (const raw of names) {
    const key = raw.trim().toLowerCase();
    const expanded = SKILL_PRESET_GROUPS[key] ?? [key];
    for (const presetName of expanded) {
      const preset = SKILL_PRESETS[presetName];
      if (!preset) {
        const known = [...Object.keys(SKILL_PRESETS), ...Object.keys(SKILL_PRESET_GROUPS)].join(
          ", "
        );
        throw new Error(`Unknown preset "${raw}". Available: ${known}`);
      }
      if (seen.has(preset.name)) continue;
      seen.add(preset.name);
      resolved.push(preset);
    }
  }

  if (resolved.length === 0) {
    throw new Error("No presets requested.");
  }
  return resolved;
}
