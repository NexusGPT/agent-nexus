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

  // ── resolve-options ───────────────────────────────────────────────────
  tool
    .command("resolve-options")
    .description("Resolve dynamic dropdown options for a tool parameter")
    .argument("<id>", "Tool ID")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool resolve-options tool-123 --body '{"componentId":"gmail-send","propName":"label","credentialId":"cred-123","configuredProps":{}}'`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);
        if (!body) {
          console.error("Error: --body is required.");
          process.exitCode = 1;
          return;
        }
        const result = await client.tools.resolveOptions(id, body as any);
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── skills ────────────────────────────────────────────────────────────
  tool
    .command("skills")
    .description("List organization skills (workflows, tasks, collections)")
    .option("--type <type>", "Filter by type: WORKFLOW, TASK, or COLLECTION")
    .option("--search <query>", "Search by name")
    .option("--limit <number>", "Max results", parseInt)
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool skills
  $ nexus tool skills --type WORKFLOW --search "onboarding"
  $ nexus tool skills --json`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tools.skills({
          type: opts.type,
          search: opts.search,
          limit: opts.limit
        } as any);
        const skills = (result as any).skills ?? [];
        printTable(skills, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "type", label: "TYPE", width: 14 },
          { key: "description", label: "DESCRIPTION", width: 40 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── test ──────────────────────────────────────────────────────────────
  tool
    .command("test")
    .description("Test-execute a configured agent tool")
    .argument("<agent-id>", "Agent ID")
    .argument("<tool-config-id>", "Agent tool configuration ID")
    .option("--input <json>", "Sample input as JSON string")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool test agt-123 tool-cfg-456 --input '{"to":"test@example.com"}'
  $ nexus tool test agt-123 tool-cfg-456 --body '{"input":{"query":"hello"}}'`
    )
    .action(async (agentId: string, toolConfigId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.input) flags.input = JSON.parse(opts.input);
        const body = mergeBodyWithFlags(base, flags);
        const result = await client.tools.test(agentId, toolConfigId, body as any);
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── execute ───────────────────────────────────────────────────────────
  tool
    .command("execute")
    .description("Execute a marketplace tool action directly (no workflow)")
    .argument("<id>", "Tool ID")
    .requiredOption("--action <operationId>", "Action operationId to execute")
    .option("--input <json>", "Input parameters as JSON string")
    .option("--credential-id <id>", "Credential ID (optional)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool execute tool-123 --action "google_sheets-create-spreadsheet" --input '{"title":"My Sheet"}'
  $ nexus tool execute tool-123 --body '{"action":"getWeather","input":{"city":"London"}}'

Notes:
  For CUSTOM_MANIFEST external tools, use "nexus external-tool execute" instead.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = { action: opts.action };
        if (opts.input) flags.input = JSON.parse(opts.input);
        if (opts.credentialId) flags.credentialId = opts.credentialId;
        const body = mergeBodyWithFlags(base, flags);
        const result = await client.tools.execute(id, body as any);
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── connection-status ─────────────────────────────────────────────────
  tool
    .command("connection-status")
    .description("Poll OAuth handshake status")
    .argument("<handshake-id>", "Handshake ID from connect response")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool connection-status hs-abc-123
  $ nexus tool connection-status hs-abc-123 --json`
    )
    .action(async (handshakeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.toolConnection.pollStatus(handshakeId);
        printRecord(result as unknown as Record<string, unknown>, [
          { key: "status", label: "Status" },
          { key: "connectionId", label: "Connection ID" },
          { key: "errorMessage", label: "Error" },
          { key: "expiresAt", label: "Expires At" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create-credential ─────────────────────────────────────────────────
  tool
    .command("create-credential")
    .description("Create a Pipedream credential after OAuth via connect link")
    .argument("<id>", "Tool ID")
    .requiredOption("--account-id <id>", "Pipedream account ID")
    .option("--name <name>", "Credential name")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool create-credential tool-123 --account-id pd-acct-456
  $ nexus tool create-credential tool-123 --account-id pd-acct-456 --name "Production Gmail"`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = { accountId: opts.accountId };
        if (opts.name !== undefined) flags.name = opts.name;
        const body = mergeBodyWithFlags(base, flags);
        const result = await client.toolConnection.createPipedreamCredential(id, body as any);
        printSuccess("Credential created.", { id: (result as any).id, name: (result as any).name });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete-credential ─────────────────────────────────────────────────
  tool
    .command("delete-credential")
    .description("Delete a tool credential")
    .argument("<tool-id>", "Tool ID")
    .argument("<credential-id>", "Credential ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool delete-credential tool-123 cred-456
  $ nexus tool delete-credential tool-123 cred-456 --yes`
    )
    .action(async (toolId: string, credentialId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete credential ${credentialId}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.toolConnection.deleteCredential(toolId, credentialId);
        printSuccess("Credential deleted.", { toolId, credentialId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
