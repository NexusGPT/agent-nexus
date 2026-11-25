#!/usr/bin/env node

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "login": {
      const { loginCommand } = await import("./commands/login");
      await loginCommand(args.slice(1));
      break;
    }

    case "logout": {
      const { logoutCommand } = await import("./commands/logout");
      await logoutCommand();
      break;
    }

    case "whoami": {
      const { parseHostArgs } = await import("./host-args");
      const { whoamiCommand } = await import("./commands/whoami");
      await whoamiCommand(parseHostArgs(args.slice(1)));
      break;
    }

    default: {
      // No subcommand (or unknown) → start the stdio MCP bridge. Backwards
      // compatible: a host configured to run `nexus-mcp` with no args still gets
      // an MCP server on stdio — only the tools now come from the live API.
      //
      // `--base-url` / `--region` pick the deployment; see `host-args.ts`.
      const { parseHostArgs } = await import("./host-args");
      const { resolveBaseUrl } = await import("./config");
      const { startStdioProxy } = await import("./proxy");
      await startStdioProxy({ baseUrl: resolveBaseUrl(parseHostArgs(args)) });
      break;
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
