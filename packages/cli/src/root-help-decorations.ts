import type { Command } from "commander";

import { getBanner } from "./banner";
import { registerHelpScopeFooter } from "./help-scope";
import { addGlobalFlagsFooter } from "./root-global-flags-footer";
import { ROOT_EPILOGUE } from "./root-help-epilogue";

/**
 * Everything the ROOT program adds to `--help` output, in the order it must be
 * registered. `buildRootProgram` in `index.ts` calls this once, after the
 * global option chain and before the namespaces are registered.
 */
export function decorateRootHelp(program: Command, version: string): void {
  // Prepend banner to top-level --help only (not subcommands)
  program.addHelpText("before", getBanner(version));
  program.addHelpText("after", ROOT_EPILOGUE);
  program.configureHelp({ sortSubcommands: true });

  // BEFORE the scope footer, so the derived global-flag block renders above it.
  addGlobalFlagsFooter(program);

  // The scope footer, on EVERY help screen at every depth. One registration:
  // commander fires `afterAll` on the helped command and all its ancestors.
  // Read `help-scope.ts` before moving, rewording or removing this — the
  // position below the command's own Notes block is the point of it.
  registerHelpScopeFooter(program, version);
}
