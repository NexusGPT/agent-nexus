import { Command } from "commander";

import { registerVersionCreateCommand } from "./version/create.command";
import { registerVersionDeleteCommand } from "./version/delete.command";
import { registerVersionGetCommand } from "./version/get.command";
import { registerVersionListCommand } from "./version/list.command";
import { registerVersionPublishCommand } from "./version/publish.command";
import { registerVersionRestoreCommand } from "./version/restore.command";
import { registerVersionUpdateCommand } from "./version/update.command";

export function registerVersionCommands(program: Command): void {
  const version = program
    .command("version")
    .description("Manage agent prompt versions — exactly one is production, publishing moves it");

  version.addHelpText(
    "after",
    `
AN AGENT HAS TWO PROMPTS, AND THEY ARE NOT THE SAME PROMPT:
  • the DRAFT — the agent's own prompt, what "nexus agent update --prompt"
    and "version restore" write;
  • the PRODUCTION VERSION — one row of history, and what the agent actually
    runs. Exactly one version is production at a time, so "version publish"
    is a MOVE: it un-marks whichever version was production before.

WHICH ONE RUNS: an agent that has NEVER published runs its draft. The moment
anything publishes a version, the draft stops being served and the published
version is what every conversation gets — until you publish another one.
"version restore" writes the DRAFT ONLY, so on a published agent it changes
nothing at runtime and reports no error. Publish afterwards, or it did not
happen.

TWO TYPES. AUTO versions are written for you whenever the prompt changes.
CHECKPOINT versions are the ones "version create" makes. Both can be renamed,
deleted and published — the type is a label about origin, not a protection.`
  );

  registerVersionListCommand(version, program);
  registerVersionGetCommand(version, program);
  registerVersionCreateCommand(version, program);
  registerVersionUpdateCommand(version, program);
  registerVersionDeleteCommand(version, program);
  registerVersionRestoreCommand(version, program);
  registerVersionPublishCommand(version, program);
}
