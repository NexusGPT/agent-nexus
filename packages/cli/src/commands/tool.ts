import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printRecord, printSuccess, printTable } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";

export function registerToolCommands(program: Command): void {
  const tool = program.command("tool").description("Discover and manage marketplace tools");

  // ── search ────────────────────────────────────────────────────────────
  tool
    .command("search")
    .description("Search marketplace tools")
    .option("--query <query>", "Search query")
    .option("--category <category>", "Filter by category")
    .option("--type <type>", "Filter by type")
    .option("--limit <number>", "Max results", parseInt)
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool search --query "gmail"
  $ nexus tool search --category "Communication" --limit 10
  $ nexus tool search --query "slack" --json`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tools.search({
          q: opts.query,
          category: opts.category,
          type: opts.type,
          limit: opts.limit
        } as any);

        const tools = (result as any).tools ?? [];
        printTable(tools, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 25 },
          { key: "type", label: "TYPE", width: 12 },
          { key: "description", label: "DESCRIPTION", width: 40 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── get ───────────────────────────────────────────────────────────────
  tool
    .command("get")
    .description("Get marketplace tool details")
    .argument("<id>", "Tool ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool get tool-123
  $ nexus tool get tool-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const detail = await client.tools.get(id);
        printRecord(detail as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── credentials ───────────────────────────────────────────────────────
  tool
    .command("credentials")
    .description("List credentials for a marketplace tool")
    .argument("<id>", "Tool ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool credentials tool-123
  $ nexus tool credentials tool-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tools.credentials(id);
        const creds = (result as any).credentials ?? [];

        printTable(creds, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 25 },
          { key: "type", label: "TYPE", width: 12 },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── connect ───────────────────────────────────────────────────────────
  tool
    .command("connect")
    .description("Connect a tool via OAuth or HTTP credentials")
    .argument("<id>", "Tool ID")
    .option("--auth-type <type>", "Auth type: oauth or http", "oauth")
    .option("--api-key-value <key>", "API key for HTTP auth")
    .option("--auth-header <header>", "Authorization header type for HTTP auth", "bearer")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool connect tool-123
  $ nexus tool connect tool-123 --auth-type http --api-key-value sk-abc123
  $ nexus tool connect tool-123 --body '{"authType":"http","apiKey":"sk-abc"}'`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);

        if (base) {
          // Full body provided — merge with flags and send
          const flags: Record<string, unknown> = {};
          if (opts.authType !== undefined) flags.authType = opts.authType;
          if (opts.apiKeyValue !== undefined) flags.apiKey = opts.apiKeyValue;
          if (opts.authHeader !== undefined) flags.authorizationType = opts.authHeader;
          const body = mergeBodyWithFlags(base, flags);
          const result = await client.toolConnection.connect(id, body as any);
          printSuccess("Tool connected.", result as any);
        } else if (opts.authType === "http") {
          if (!opts.apiKeyValue) {
            console.error(
              "Error: --api-key-value is required for HTTP auth.\n  nexus tool connect <id> --auth-type http --api-key-value <key>"
            );
            process.exitCode = 1;
            return;
          }
          const result = await client.toolConnection.connect(id, {
            authType: "http",
            apiKey: opts.apiKeyValue,
            authorizationType: opts.authHeader
          } as any);
          printSuccess("Tool connected via HTTP.", result as any);
        } else {
          const result = await client.toolConnection.connect(id, {
            authType: "oauth"
          } as any);
          printSuccess("OAuth flow initiated.", result as any);
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
