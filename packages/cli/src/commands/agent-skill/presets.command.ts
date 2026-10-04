import type { Command } from "commander";

import { color, isJsonMode } from "../../output";
import {
  DEFAULT_PRESET_REPO,
  SKILL_PRESET_GROUPS,
  SKILL_PRESETS
} from "../../util/skill-bundle.presets";

/** `nexus agent-skill presets` */
export function registerAgentSkillPresetsCommand(skill: Command): Command {
  const leaf = skill
    .command("presets")
    .description("List the baseline skills 'add-preset' can install")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-skill presets
  $ nexus agent-skill presets --json

Notes:
  THESE ARE NOT BUNDLED WITH THIS CLI. They are Anthropic's skills, fetched from
  their GitHub repository on demand, so this listing describes what "add-preset"
  would go and get rather than what this binary already holds. That is the
  opposite of "nexus claude-code list", which lists skills baked into the binary.
  IT PRINTS TWO KINDS OF NAME AND add-preset TAKES EITHER. The first block is
  individual presets; the second is GROUPS, each expanding to the members listed
  beside it — "nexus agent-skill add-preset <agent-id> office" installs a whole
  group in one call.
  --json returns the source repo alongside both sets, which the printed form
  shows only in its header line.`
    )
    .action(() => {
      if (isJsonMode()) {
        console.log(
          JSON.stringify(
            {
              repo: DEFAULT_PRESET_REPO,
              presets: Object.values(SKILL_PRESETS),
              groups: SKILL_PRESET_GROUPS
            },
            null,
            2
          )
        );
        return;
      }
      console.log(color.bold(`\nBaseline skills (from github.com/${DEFAULT_PRESET_REPO}):\n`));
      for (const preset of Object.values(SKILL_PRESETS)) {
        console.log(`  ${color.cyan(preset.name.padEnd(16))} ${preset.description}`);
      }
      console.log(color.bold("\nGroups:\n"));
      for (const [group, members] of Object.entries(SKILL_PRESET_GROUPS)) {
        console.log(`  ${color.cyan(group.padEnd(16))} ${members.join(", ")}`);
      }
      console.log(
        color.dim(
          `\nThese are Anthropic's skills, fetched from their repository on demand rather than\n` +
            `bundled with this CLI. Install with: nexus agent-skill add-preset <agent-id> office\n`
        )
      );
    });

  return leaf;
}
