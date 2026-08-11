import type {
  ConnectToolBody,
  ConnectToolHttpBody,
  ConnectToolOAuthBody,
  CreatePipedreamCredentialBody,
  ExecuteToolDirectBody,
  ResolveRemoteOptionsBody,
  TestAgentToolBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printRecord, printSuccess, printTable } from "../output";
import { asRequestBody, mergeBodyWithFlags, readStringField, resolveBody } from "../util/body";

/**
 * The `authType` discriminants `POST /tools/:toolId/connect` accepts.
 *
 * `satisfies` gates the list against the SDK's own union, so a value that stops
 * being a discriminant stops compiling here. If the server ever GROWS an arm,
 * this list is merely incomplete and `--auth-type <new-arm>` is refused locally
 * with the list above — a stated refusal, not a request built from the wrong
 * shape, which is the failure this whole command had.
 */
const CONNECT_AUTH_TYPES = [
  "oauth",
  "http"
] as const satisfies readonly ConnectToolBody["authType"][];

type ConnectAuthType = (typeof CONNECT_AUTH_TYPES)[number];

function isConnectAuthType(value: string): value is ConnectAuthType {
  return (CONNECT_AUTH_TYPES as readonly string[]).includes(value);
}

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
        });

        const tools = result.tools ?? [];
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
        printRecord(detail);
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
        const creds = result.credentials ?? [];

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
    .option("--auth-type <type>", `Auth type: ${CONNECT_AUTH_TYPES.join(" or ")} (default: oauth)`)
    .option(
      "--service <service>",
      "OAuth service or Pipedream app slug to authorize (e.g. GOOGLE_SHEETS, google_sheets). Required for OAuth"
    )
    .option("--api-key-value <key>", "API key for HTTP auth")
    .option("--name <name>", "Label for the credential HTTP auth creates")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool connect tool-123 --service GOOGLE_SHEETS
  $ nexus tool connect tool-123 --auth-type http --api-key-value sk-abc123 --name "Production key"
  $ nexus tool connect tool-123 --body '{"authType":"http","apiKey":"sk-abc"}'

Notes:
  --service names the account to authorize, and the tool ID does not imply it:
  neither "nexus tool search" nor "nexus tool get" returns it. Use the built-in
  OAuth service name (GOOGLE_SHEETS, GMAIL, NOTION, ...) or the Pipedream app
  slug (google_sheets).`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);

        // Each branch builds a member of the server's own discriminated union
        // (`ConnectToolBodySchema`, packages/types/src/api/public/v1/schemas/
        // tool-connection.schemas.ts) as a TYPED literal, so the compiler holds
        // the request to the contract: the OAuth arm cannot be built without a
        // `service`, and a field the union does not declare cannot be added.
        //
        // The previous shape — an untyped bag asserted with `as any` at the
        // call — could express neither constraint, and shipped three defects
        // behind that one silence: an OAuth request that could never validate,
        // an `--auth-header` the server stripped while the CLI reported
        // success, and flag defaults that overwrote `--body`.
        //
        // NO flag here carries a commander default; `--auth-type`'s applies
        // below, once both sources have been read. A default is not
        // distinguishable from an explicit value, so declaring one on a flag
        // that `--body` can also supply makes the flag always win.
        const rawAuthType = readStringField(opts.authType, base, "authType") ?? "oauth";
        if (!isConnectAuthType(rawAuthType)) {
          console.error(
            `Error: --auth-type must be one of: ${CONNECT_AUTH_TYPES.join(", ")} (got "${rawAuthType}").`
          );
          process.exitCode = 1;
          return;
        }

        if (rawAuthType === "http") {
          const apiKey = readStringField(opts.apiKeyValue, base, "apiKey");
          if (apiKey === undefined) {
            console.error(
              "Error: --api-key-value is required for HTTP auth.\n  nexus tool connect <id> --auth-type http --api-key-value <key>"
            );
            process.exitCode = 1;
            return;
          }
          const name = readStringField(opts.name, base, "name");
          const httpBody: ConnectToolHttpBody = {
            authType: "http",
            apiKey,
            ...(name !== undefined && { name })
          };
          const result = await client.toolConnection.connect(id, httpBody);
          printSuccess("Tool connected via HTTP.", result);
          return;
        }

        const service = readStringField(opts.service, base, "service");
        if (service === undefined) {
          console.error(
            "Error: --service is required for OAuth.\n  nexus tool connect <id> --service <service>\n  e.g. --service GOOGLE_SHEETS (built-in OAuth) or --service google_sheets (Pipedream app slug)"
          );
          process.exitCode = 1;
          return;
        }
        const oauthBody: ConnectToolOAuthBody = { authType: "oauth", service };
        const result = await client.toolConnection.connect(id, oauthBody);
        printSuccess("OAuth flow initiated.", result);
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
        const result = await client.tools.resolveOptions(
          id,
          asRequestBody<ResolveRemoteOptionsBody>(body)
        );
        printRecord(result);
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
        });
        const skills = result.skills ?? [];
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
        const result = await client.tools.test(
          agentId,
          toolConfigId,
          asRequestBody<TestAgentToolBody>(body)
        );
        printRecord(result);
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
        const result = await client.tools.execute(id, asRequestBody<ExecuteToolDirectBody>(body));
        printRecord(result);
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
        printRecord(result, [
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
        const result = await client.toolConnection.createPipedreamCredential(
          id,
          asRequestBody<CreatePipedreamCredentialBody>(body)
        );
        printSuccess("Credential created.", { id: result.id, name: result.name });
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
