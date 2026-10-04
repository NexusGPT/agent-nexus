import { Command } from "commander";

import { bindCommand } from "../contract-binding";
import {
  CLOUD_IMPORT_BROWSE_CONTRACT,
  CLOUD_IMPORT_ITEMS_CONTRACT,
  CLOUD_IMPORT_LIST_PROVIDERS_CONTRACT,
  CLOUD_IMPORT_SEARCH_CONTRACT
} from "./cloud-import.contract.generated";
import { registerCloudImportBrowseCommand } from "./cloud-import/browse.command";
import { CLOUD_IMPORT_HELP } from "./cloud-import/cloud-import-help";
import { registerGoogleDriveCommands } from "./cloud-import/google-drive.commands";
import { registerCloudImportImportCommand } from "./cloud-import/import.command";
import { registerNotionCommands } from "./cloud-import/notion.commands";
import { registerCloudImportProvidersCommand } from "./cloud-import/providers.command";
import { registerCloudImportSearchCommand } from "./cloud-import/search.command";
import { registerSharepointCommands } from "./cloud-import/sharepoint.commands";

export function registerCloudImportCommands(program: Command): void {
  const cloudImport = program
    .command("cloud-import")
    .description("Browse and import documents from cloud providers");

  cloudImport.addHelpText("after", CLOUD_IMPORT_HELP);

  // ==========================================================================
  // Provider-agnostic browsing
  // ==========================================================================

  const providers = registerCloudImportProvidersCommand(cloudImport, program);
  const browse = registerCloudImportBrowseCommand(cloudImport, program);
  const search = registerCloudImportSearchCommand(cloudImport, program);
  const importItems = registerCloudImportImportCommand(cloudImport, program);

  // ==========================================================================
  // Per-provider commands — every one of these goes through the
  // provider-agnostic endpoints. There is no OAuth command: connecting an
  // account happens in the app, which is what produces a connection id.
  // ==========================================================================

  registerGoogleDriveCommands(cloudImport, program);
  registerSharepointCommands(cloudImport, program);
  registerNotionCommands(cloudImport, program);

  // Bound LAST, after every option exists — see `bindCommand`. The per-provider
  // groups are convenience wrappers over the same four routes.
  bindCommand(providers, CLOUD_IMPORT_LIST_PROVIDERS_CONTRACT);
  bindCommand(browse, CLOUD_IMPORT_BROWSE_CONTRACT);
  bindCommand(search, CLOUD_IMPORT_SEARCH_CONTRACT);
  bindCommand(importItems, CLOUD_IMPORT_ITEMS_CONTRACT);
}
