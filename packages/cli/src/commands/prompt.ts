import { type Command } from "commander";

import { registerPromptCompareCommand } from "./prompt/compare.command";
import { registerPromptGraphCommand } from "./prompt/graph.command";
import { registerPromptHistoryCommand } from "./prompt/history.command";
import { registerPromptPromoteCommand } from "./prompt/promote.command";
import { registerPromptSaveCommand } from "./prompt/save.command";
import { registerPromptVariantCommands } from "./prompt/variant.commands";

/**
 * `nexus prompt` — branch-based prompt versioning (Prompt Lab phase 1).
 *
 * ## The model in one paragraph
 *
 * Every agent has exactly one **Main** variant — the production lineage, whose
 * name is reserved — plus named variants (branches) forked from any version.
 * `save` appends to a variant's tip; `promote` copies a variant's tip into a
 * NEW Main version. There is no merge, no rebase, and no history rewrite —
 * anywhere. `archive` hides a variant and refuses further writes; nothing is
 * ever deleted, which is why this namespace has no delete verb at all.
 *
 * ## 🔴 `--variant` TAKES A NAME, AN ID, OR "main"
 *
 * Names resolve case-insensitively, so `--variant main` always addresses the
 * Main lineage. In `compare`, `--a`/`--b` may ALSO be a bare version id, so any
 * point in history can be diffed against any other.
 *
 * ## A save NEVER publishes
 *
 * Publishing happens through `promote --publish` and nowhere else — even a
 * save aimed at Main leaves the live prompt untouched. That asymmetry is the
 * whole safety story of variants: iteration is free, going live is deliberate.
 *
 * ## One file per subcommand, under `commands/prompt/`
 *
 * This file is wiring and nothing else. Each leaf owns its own options, its
 * hand-written Notes and its `bindCommand` call, in that order — the ordering
 * is PER COMMAND, so the generated reference still lands below that command's
 * Notes exactly as it did when every leaf lived here. `contract-help.test.ts`
 * asserts that ordering rather than trusting it.
 */
export function registerPromptCommands(program: Command): void {
  const prompt = program
    .command("prompt")
    .description("Branch-based prompt versioning: variants, saves, promote, compare, graph");

  // Registration ORDER is the published surface: commander renders subcommands
  // in declaration order, so this sequence matches the pre-split file's.
  registerPromptVariantCommands(prompt, program);
  registerPromptSaveCommand(prompt, program);
  registerPromptHistoryCommand(prompt, program);
  registerPromptPromoteCommand(prompt, program);
  registerPromptCompareCommand(prompt, program);
  registerPromptGraphCommand(prompt, program);
}
