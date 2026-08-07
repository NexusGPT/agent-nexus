import fs from "node:fs";
import path from "node:path";

import {
  type CreateExternalToolBody,
  type ExecuteToolDirectBody,
  type ExternalToolAuth,
  NexusApiError,
  type TestExternalToolBody,
  type UpdateExternalToolBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import type {
  ToolHasAttachmentsDetails,
  ToolSpecBreakingChangeDetails
} from "../external-tool-wire-types";
import { printList, printRecord, printSuccess } from "../output";
import {
  asRequestBody,
  mergeBodyWithFlags,
  resolveBody,
  resolveInputJson,
  resolveRequiredBody
} from "../util/body";

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
        printList(result.items, undefined, [
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
        printRecord(t, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "endpointUrl", label: "Endpoint URL" },
          { key: "createdAt", label: "Created" }
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

        const t = await client.skills.createExternalTool(
          asRequestBody<CreateExternalToolBody>(body)
        );
        printSuccess("External tool created.", { id: t.id, name: t.name });
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
          imageUrl: result.imageUrl
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
          credentialId: result.credentialId
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
    // Required, not optional: there is no meaningful "update the auth to
    // nothing". Omitting it used to send `auth: undefined`, which serialised
    // away to an empty patch — a request that looked like a no-op and was not
    // one anybody asked for. Commander refuses before the HTTP call instead.
    .requiredOption("--body <json>", "Auth body as JSON, .json file, or '-' for stdin")
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
        const auth = await resolveRequiredBody(opts.body);
        await client.skills.updateExternalToolAuth(id, asRequestBody<ExternalToolAuth>(auth));
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
    .option(
      "--input <json>",
      "Input parameters as JSON, a file path, or '-' for stdin (default: {})"
    )
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
        const input = (opts.input ? await resolveInputJson(opts.input) : {}) as Record<
          string,
          unknown
        >;
        const result = await client.skills.testExternalTool(id, {
          operationId: opts.operationId,
          input
        });
        if (result.status === "success") {
          printSuccess("Auth credentials are valid. Operation executed successfully.", {
            status: result.status,
            executionTimeMs: result.executionTimeMs
          });
          printRecord(result);
        } else {
          console.error("Auth test failed:", result.error ?? "Unknown error");
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
    .option("--input <json>", "Input parameters as JSON, a file path, or '-' for stdin")
    .option("--credential <id>", "Credential ID override")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus external-tool execute <toolId> --action google_sheets-create-spreadsheet --input '{"title":"My Sheet"}'
  $ nexus external-tool execute <toolId> --action send_email --input '{"to":"a@b.com"}' --credential cred-123
  $ nexus external-tool execute <toolId> --body '{"action":"send_email","input":{"to":"a@b.com"}}'
  $ nexus external-tool execute <toolId> --action send_email --input /tmp/input.json
  $ cat params.json | nexus external-tool execute <toolId> --action send_email --input -`
    )
    .action(async (toolId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.action) flags.action = opts.action;
        if (opts.input) flags.input = await resolveInputJson(opts.input);
        if (opts.credential) flags.credentialId = opts.credential;
        const body = mergeBodyWithFlags(base, flags);

        if (!body.action) {
          console.error("Error: --action is required (or provide it in --body)");
          process.exitCode = 1;
          return;
        }

        const result = await client.tools.execute(
          toolId,
          asRequestBody<ExecuteToolDirectBody>(body)
        );
        printRecord(result);
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
    .option("--input <json>", "Input parameters as JSON, a file path, or '-' for stdin")
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
        if (opts.input) flags.input = await resolveInputJson(opts.input);
        const body = mergeBodyWithFlags(base, flags);

        const result = await client.skills.testExternalTool(
          id,
          asRequestBody<TestExternalToolBody>(body)
        );
        printRecord(result);
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
    .option(
      "--force",
      "When refreshing openApiSpec, override the breaking-change guard (drop/rename bound action keys)"
    )
    .addHelpText(
      "after",
      `
PATCH path on the Public API: /skills/external-tools/{id}

Examples:
  $ nexus external-tool update ext-123 --name "Renamed Tool"
  $ nexus external-tool update ext-123 --body update.json
  $ nexus external-tool update ext-123 --body update.json --description "New description"

To refresh just the OpenAPI spec from a file, prefer:
  $ nexus external-tool update-spec ext-123 --file openapi.yaml`
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

        const t = await client.skills.updateExternalTool(
          id,
          asRequestBody<UpdateExternalToolBody>(body),
          {
            force: !!opts.force
          }
        );
        printSuccess("External tool updated.", { id: t.id, name: t.name });
      } catch (err) {
        const breaking = extractSpecBreakingChangeDetails(err);
        if (breaking) {
          printSpecBreakingChangeError(breaking);
          process.exitCode = 1;
          return;
        }
        process.exitCode = handleError(err);
      }
    });

  // ── update-spec ──────────────────────────────────────────────────────────
  externalTool
    .command("update-spec")
    .description("Refresh an external tool's OpenAPI spec without recreating it")
    .argument("<id>", "External tool ID")
    .option("--file <path>", "Path to the OpenAPI spec file (JSON or YAML)")
    .option(
      "--body <json>",
      "Spec inline as '{\"openApiSpec\":\"...\"}' (JSON, .json file, or '-' for stdin)"
    )
    .option(
      "--force",
      "Override the breaking-change guard (refresh even if it drops/renames a bound action key)"
    )
    .addHelpText(
      "after",
      `
Re-parses the spec and rebuilds the action list on the EXISTING tool, preserving
its toolId, auth, credentials, icon, and downstream wiring (workflow nodes +
agent attachments). PATCH path: /skills/external-tools/{id}

If the refresh would drop or rename an action key still bound by a workflow node
or agent tool config, it is rejected — re-run with --force to override.

Examples:
  $ nexus external-tool update-spec ext-123 --file openapi.yaml
  $ nexus external-tool update-spec ext-123 --file openapi.json --json
  $ nexus external-tool update-spec ext-123 --body '{"openApiSpec":"openapi: 3.0.0\\n..."}'
  $ nexus external-tool update-spec ext-123 --file openapi.yaml --force
  $ cat openapi.yaml | nexus external-tool update-spec ext-123 --file -`
    )
    .action(async (id: string, opts) => {
      try {
        const openApiSpec = await resolveSpecString(opts);
        if (openApiSpec === null) {
          console.error(
            "Error: provide the spec via --file <path> or --body '{\"openApiSpec\":...}'"
          );
          process.exitCode = 1;
          return;
        }

        const client = createClient(program.optsWithGlobals());
        const t = await client.skills.updateExternalTool(
          id,
          { openApiSpec },
          { force: !!opts.force }
        );
        printSuccess("External tool spec refreshed.", { id: t.id, name: t.name });
      } catch (err) {
        const breaking = extractSpecBreakingChangeDetails(err);
        if (breaking) {
          printSpecBreakingChangeError(breaking);
          process.exitCode = 1;
          return;
        }
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

function extractToolHasAttachmentsDetails(err: unknown): ToolHasAttachmentsDetails | null {
  if (!(err instanceof NexusApiError)) return null;
  if (err.status !== 409 || err.code !== "TOOL_HAS_ATTACHMENTS") return null;
  return (err.details as ToolHasAttachmentsDetails) ?? null;
}

function printToolHasAttachmentsError({ total, sample }: ToolHasAttachmentsDetails): void {
  console.error(`Cannot delete: ${total} agent tool config(s) reference this external tool:`);
  for (const a of sample) {
    console.error(`  • ${a.label}  (agent: ${a.agentName})`);
  }
  if (total > sample.length) {
    console.error(`  • … and ${total - sample.length} more`);
  }
  console.error("\nRe-run with --force to cascade-delete the references along with the tool.");
}

/**
 * Resolve the OpenAPI spec string for `update-spec` from --file (raw JSON/YAML
 * text, or '-' for stdin) or --body (a JSON object carrying `openApiSpec`).
 * Returns null when neither is provided.
 */
async function resolveSpecString(opts: { file?: string; body?: string }): Promise<string | null> {
  if (opts.file) {
    if (opts.file === "-") {
      return fs.readFileSync(0, "utf8");
    }
    const absPath = path.resolve(opts.file);
    if (!fs.existsSync(absPath)) {
      throw new Error(`File not found: ${absPath}`);
    }
    return fs.readFileSync(absPath, "utf8");
  }
  if (opts.body) {
    const parsed = await resolveBody(opts.body);
    const spec = parsed?.openApiSpec;
    if (typeof spec !== "string" || spec.length === 0) {
      throw new Error('--body must be a JSON object with a non-empty "openApiSpec" string');
    }
    return spec;
  }
  return null;
}

function extractSpecBreakingChangeDetails(err: unknown): ToolSpecBreakingChangeDetails | null {
  if (!(err instanceof NexusApiError)) return null;
  if (err.status !== 409 || err.code !== "TOOL_SPEC_BREAKING_CHANGE") return null;
  return (err.details as ToolSpecBreakingChangeDetails) ?? null;
}

function printSpecBreakingChangeError({
  removedActions,
  total,
  bindings
}: ToolSpecBreakingChangeDetails): void {
  console.error(
    `Refusing to refresh: the new spec removes ${removedActions.length} action(s) still bound downstream:`
  );
  console.error(`  removed action(s): ${removedActions.join(", ")}`);
  console.error(`  bound by ${total} reference(s):`);
  for (const b of bindings) {
    console.error(`  • [${b.kind}] ${b.label}  → ${b.action}`);
  }
  if (total > bindings.length) {
    console.error(`  • … and ${total - bindings.length} more`);
  }
  console.error("\nRe-run with --force to refresh anyway (downstream nodes binding a removed");
  console.error("action will need to be repointed manually).");
}
