import fs from "node:fs";
import path from "node:path";

import { NexusApiError } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";

export function registerExternalToolCommands(program: Command): void {
  const externalTool = program
    .command("external-tool")
    .description("Manage external tools (OpenAPI integrations)");

  // ── list ────────────────────────────────────────────────────────────────
  externalTool
    .command("list")
    .description("List external tools")
    .option("--search <query>", "Search by name")
    .option("--limit <number>", "Max results", parseInt)
    .addHelpText(
      "after",
      `
Examples:
  $ nexus external-tool list
  $ nexus external-tool list --search "weather" --limit 10
  $ nexus external-tool list --json`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.skills.listExternalTools({
          search: opts.search,
          limit: opts.limit
        });
        const items = Array.isArray(result)
          ? result
          : ((result as any).items ?? (result as any).data ?? result);

        printList(items as unknown as Record<string, unknown>[], undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "description", label: "DESCRIPTION", width: 40 },
          { key: "createdAt", label: "CREATED", width: 26 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── get ─────────────────────────────────────────────────────────────────
  externalTool
    .command("get")
    .description("Get external tool details")
    .argument("<id>", "External tool ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus external-tool get ext-123
  $ nexus external-tool get ext-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const t = await client.skills.getExternalTool(id);
        printRecord(t as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "baseUrl", label: "Base URL" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ──────────────────────────────────────────────────────────────
  externalTool
    .command("create")
    .description("Create an external tool from an OpenAPI spec")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .option("--image-url <url>", "URL to the tool's logo/icon image")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus external-tool create --body openapi-tool.json
  $ nexus external-tool create --body '{"name":"Weather API","spec":{...}}'
  $ nexus external-tool create --body openapi-tool.json --image-url https://example.com/logo.png
  $ cat spec.json | nexus external-tool create --body -`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.imageUrl) flags.imageUrl = opts.imageUrl;
        const body = mergeBodyWithFlags(base, flags);

        const t = await client.skills.createExternalTool(body as any);
        printSuccess("External tool created.", {
          id: (t as any).id,
          name: (t as any).name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── upload-icon ─────────────────────────────────────────────────────────
  externalTool
    .command("upload-icon")
    .description("Upload an icon/logo image for an external tool")
    .argument("<id>", "External tool ID")
    .requiredOption("--file <path>", "Path to the image file (PNG, JPG, or SVG)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus external-tool upload-icon ext-123 --file ./logo.png
  $ nexus external-tool upload-icon ext-123 --file ./icon.svg`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const absPath = path.resolve(opts.file);

        if (!fs.existsSync(absPath)) {
          console.error(`Error: File not found: ${absPath}`);
          process.exitCode = 1;
          return;
        }

        const buffer = fs.readFileSync(absPath);
        const blob = new Blob([buffer]);
        const fileName = path.basename(absPath);

        const result = await client.skills.uploadExternalToolIcon(id, blob, fileName);
        printSuccess("Icon uploaded.", {
          id,
          imageUrl: (result as any).imageUrl
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── initiate-oauth ──────────────────────────────────────────────────────
  externalTool
    .command("initiate-oauth")
    .description("Initiate OAuth client_credentials flow for an external tool")
    .argument("<id>", "External tool ID")
    .option("--name <name>", "Credential name")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus external-tool initiate-oauth ext-123
  $ nexus external-tool initiate-oauth ext-123 --name "Production token"

This directly fetches a token from the OAuth token endpoint using
client_credentials grant (machine-to-machine). No browser redirect needed.
The tool's auth must be configured with type "oauth" and grant_type "client_credentials".`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.skills.initiateClientCredentials(id, opts.name);
        printSuccess("OAuth client_credentials token obtained.", {
          credentialId: (result as any).credentialId
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update-auth ────────────────────────────────────────────────────────
  externalTool
    .command("update-auth")
    .description("Update auth configuration on an existing external tool")
    .argument("<id>", "External tool ID")
    .option("--body <json>", "Auth body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus external-tool update-auth ext-123 --body '{"type":"oauth","grant_type":"client_credentials","client_id":"...","client_secret":"...","client_url":"...","audience":"..."}'
  $ nexus external-tool update-auth ext-123 --body auth-config.json`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const auth = await resolveBody(opts.body);
        await client.skills.updateExternalToolAuth(id, auth as any);
        printSuccess("Auth configuration updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── test-auth ───────────────────────────────────────────────────────────
  externalTool
    .command("test-auth")
    .description("Test auth credentials for an external tool by calling an operation")
    .argument("<id>", "External tool ID")
    .option("--operation-id <op>", "Operation ID to test with")
    .option("--input <json>", "Input parameters as JSON (default: {})")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus external-tool test-auth ext-123 --operation-id listItems
  $ nexus external-tool test-auth ext-123 --operation-id searchVehicles --input '{"pageSize":1}'

Tests that the stored credentials work by executing an operation. If the token is
expired, the platform will attempt to refresh it automatically before calling the API.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        if (!opts.operationId) {
          console.error("Error: --operation-id is required");
          process.exitCode = 1;
          return;
        }
        const input = opts.input ? JSON.parse(opts.input) : {};
        const result = await client.skills.testExternalTool(id, {
          operationId: opts.operationId,
          input
        });
        if ((result as any).status === "success") {
          printSuccess("Auth credentials are valid. Operation executed successfully.", {
            status: (result as any).status,
            executionTimeMs: (result as any).executionTimeMs
          });
          printRecord(result as unknown as Record<string, unknown>);
        } else {
          console.error("Auth test failed:", (result as any).error ?? "Unknown error");
          process.exitCode = 1;
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── execute ─────────────────────────────────────────────────────────────
  externalTool
    .command("execute")
    .description("Execute a tool action directly (no workflow needed)")
    .argument("<toolId>", "Marketplace tool ID")
    .option("--action <key>", "Action key or operationId")
    .option("--input <json>", "Input parameters as JSON")
    .option("--credential <id>", "Credential ID override")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus external-tool execute <toolId> --action google_sheets-create-spreadsheet --input '{"title":"My Sheet"}'
  $ nexus external-tool execute <toolId> --action send_email --input '{"to":"a@b.com"}' --credential cred-123
  $ nexus external-tool execute <toolId> --body '{"action":"send_email","input":{"to":"a@b.com"}}'
  $ cat params.json | nexus external-tool execute <toolId> --action send_email --input -`
    )
    .action(async (toolId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.action) flags.action = opts.action;
        if (opts.input) flags.input = JSON.parse(opts.input);
        if (opts.credential) flags.credentialId = opts.credential;
        const body = mergeBodyWithFlags(base, flags);

        if (!body.action) {
          console.error("Error: --action is required (or provide it in --body)");
          process.exitCode = 1;
          return;
        }

        const result = await client.tools.execute(toolId, body as any);
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── test ────────────────────────────────────────────────────────────────
  externalTool
    .command("test")
    .description("Test an external tool operation")
    .argument("<id>", "External tool ID")
    .option("--operation-id <op>", "Operation ID to test")
    .option("--input <json>", "Input parameters as JSON")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus external-tool test ext-123 --operation-id getWeather --input '{"city":"London"}'
  $ nexus external-tool test ext-123 --body '{"operationId":"getWeather","input":{"city":"London"}}'
  $ nexus external-tool test ext-123 --operation-id listItems --json`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.operationId) flags.operationId = opts.operationId;
        if (opts.input) flags.input = JSON.parse(opts.input);
        const body = mergeBodyWithFlags(base, flags);

        const result = await client.skills.testExternalTool(id, body as any);
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ─────────────────────────────────────────────────────────────
  externalTool
    .command("update")
    .description(
      "Update an external tool (name, description, documentation, endpointUrl, openApiSpec, auth)"
    )
    .argument("<id>", "External tool ID")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .option("--name <name>", "Override / set the tool name")
    .option("--description <text>", "Override / set the description")
    .option("--endpoint-url <url>", "Override / set the endpoint URL")
    .addHelpText(
      "after",
      `
PATCH path on the Public API: /skills/external-tools/{id}

Examples:
  $ nexus external-tool update ext-123 --name "Renamed Tool"
  $ nexus external-tool update ext-123 --body update.json
  $ nexus external-tool update ext-123 --body update.json --description "New description"`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = opts.body ? await resolveBody(opts.body) : {};
        const flags: Record<string, unknown> = {};
        if (opts.name) flags.name = opts.name;
        if (opts.description) flags.description = opts.description;
        if (opts.endpointUrl) flags.endpointUrl = opts.endpointUrl;
        const body = mergeBodyWithFlags(base, flags);

        const t = await client.skills.updateExternalTool(id, body as any);
        printSuccess("External tool updated.", { id: t.id, name: t.name });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ─────────────────────────────────────────────────────────────
  externalTool
    .command("delete")
    .description("Delete an external tool")
    .argument("<id>", "External tool ID")
    .option("--force", "Cascade-delete: also remove any agent tool configs referencing this tool")
    .addHelpText(
      "after",
      `
By default this refuses to delete if any agent tool config references the
tool — the error lists up to 10 references plus the remaining count. Re-run
with --force to cascade-delete the references along with the tool.

Examples:
  $ nexus external-tool delete ext-123
  $ nexus external-tool delete ext-123 --force`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.skills.deleteExternalTool(id, { force: !!opts.force });
        printSuccess("External tool deleted.", { id });
      } catch (err) {
        // Special-case the 409 from the "has attachments" guard so we can
        // print the sample list and the --force hint. Everything else
        // falls through to the generic error handler.
        const attachments = extractToolHasAttachmentsDetails(err);
        if (attachments) {
          printToolHasAttachmentsError(attachments);
          process.exitCode = 1;
          return;
        }
        process.exitCode = handleError(err);
      }
    });
}

type AttachmentsDetails = {
  total: number;
  sample: Array<{ id: string; label: string; agentId: string; agentName: string }>;
};

function extractToolHasAttachmentsDetails(err: unknown): AttachmentsDetails | null {
  if (!(err instanceof NexusApiError)) return null;
  if (err.status !== 409 || err.code !== "TOOL_HAS_ATTACHMENTS") return null;
  return (err.details as AttachmentsDetails) ?? null;
}

function printToolHasAttachmentsError({ total, sample }: AttachmentsDetails): void {
  console.error(`Cannot delete: ${total} agent tool config(s) reference this external tool:`);
  for (const a of sample) {
    console.error(`  • ${a.label}  (agent: ${a.agentName})`);
  }
  if (total > sample.length) {
    console.error(`  • … and ${total - sample.length} more`);
  }
  console.error("\nRe-run with --force to cascade-delete the references along with the tool.");
}
