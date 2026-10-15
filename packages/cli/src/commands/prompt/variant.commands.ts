import type { Command } from "commander";

import { registerPromptVariantArchiveCommand } from "./variant-archive.command";
import { registerPromptVariantCreateCommand } from "./variant-create.command";
import { registerPromptVariantListCommand } from "./variant-list.command";
import { registerPromptVariantRenameCommand } from "./variant-rename.command";

/**
 * `nexus prompt variant` — the branch namespace, and its four leaves.
 *
 * Registered in the order the pre-split file declared them, because the order
 * commander renders subcommands in is part of the published `--help` surface.
 */
export function registerPromptVariantCommands(prompt: Command, program: Command): void {
  const variant = prompt.command("variant").description("Manage prompt variants (branches)");

  registerPromptVariantListCommand(variant, program);
  registerPromptVariantCreateCommand(variant, program);
  registerPromptVariantRenameCommand(variant, program);
  registerPromptVariantArchiveCommand(variant, program);
}
