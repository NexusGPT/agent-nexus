import { Command } from "commander";

import { registerCustomModelCreateCommand } from "./custom-model/create.command";
import { registerCustomModelDeleteCommand } from "./custom-model/delete.command";
import { registerCustomModelGetCommand } from "./custom-model/get.command";
import { registerCustomModelListCommand } from "./custom-model/list.command";
import { registerCustomModelUpdateCommand } from "./custom-model/update.command";

export function registerCustomModelCommands(program: Command): void {
  const customModel = program
    .command("custom-model")
    .description("Manage custom AI models with OpenAI-compatible endpoints");

  // NO NAMESPACE-LEVEL `addHelpText`, which makes this the one namespace in this
  // wave without one. Preserved as shipped: adding an epilogue here would change
  // `nexus custom-model --help`.
  //
  // REGISTRATION ORDER IS THE ORDER `--help` LISTS THEM, so it is part of the
  // published surface rather than a detail of this file.
  registerCustomModelListCommand(customModel, program);
  registerCustomModelGetCommand(customModel, program);
  registerCustomModelCreateCommand(customModel, program);
  registerCustomModelUpdateCommand(customModel, program);
  registerCustomModelDeleteCommand(customModel, program);
}
