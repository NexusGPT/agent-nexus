import { type Command, Option } from "commander";

import { MCP_CLIENTS } from "../../util/mcp-client-config";
import { INSTALL_NOTES } from "./copy/install-notes";
import { type McpInstallOpts, runMcpInstall } from "./install/run-install";

/** `nexus mcp install` */
export function registerMcpInstallCommand(mcp: Command, program: Command): void {
  mcp
    .command("install")
    .description("Emit or apply the MCP host config block for this profile")
    .addOption(
      new Option("--client <client>", "MCP host to configure")
        .choices([...MCP_CLIENTS])
        .default("claude-code")
    )
    .option("--name <name>", "Server name inside the host's config", "nexus")
    .option("--apply", "Write the block into the host's config file instead of printing it")
    .option("--force", "With --apply, replace an entry of the same name")
    .option("--no-pin", "Follow the ACTIVE profile at launch instead of pinning the current one")
    .addHelpText("after", INSTALL_NOTES)
    .action(async (opts: McpInstallOpts) => {
      await runMcpInstall(opts, program.optsWithGlobals());
    });
}
