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
import { bindCommand } from "../contract-binding";
import { dashboardUrlFor } from "../dashboard-url";
import { handleError, printFailure, refuse, reportFailure } from "../errors";
import { EXIT_CODES } from "../exit-codes";
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
import {
  SKILLS_CREATE_EXTERNAL_TOOL_CONTRACT,
  SKILLS_DELETE_EXTERNAL_TOOL_CONTRACT,
  SKILLS_GET_EXTERNAL_TOOL_CONTRACT,
  SKILLS_LIST_EXTERNAL_TOOLS_CONTRACT,
  SKILLS_TEST_EXTERNAL_TOOL_CONTRACT,
  SKILLS_UPDATE_EXTERNAL_TOOL_CONTRACT,
  SKILLS_UPLOAD_EXTERNAL_TOOL_ICON_CONTRACT
} from "./external-tool.contract.generated";

export function registerExternalToolCommands(program: Command): void {
  const externalTool = program
    .command("external-tool")
    .description("Manage external tools (OpenAPI integrations)");

  // ── list ────────────────────────────────────────────────────────────────
  const list = externalTool
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
  $ nexus external-tool list --json

Notes:
  --json PRINTS {data: [...]} AND NO meta KEY. Unlike the paginated lists in
  this CLI there is no total and no hasMore here, so a full-looking answer is
  not evidence that you have them all.
  THERE IS NO --page EITHER. --limit caps the answer and nothing walks past it,
  so a --limit below your tool count hides the rest with nothing saying so.
  THE TABLE IS ID / NAME / DESCRIPTION / CREATED. It carries no auth type, no
  endpointUrl and no actionsCount — read those per tool with
  "nexus external-tool get <id>".`
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
  const get = externalTool
    .command("get")
    .description("Get external tool details")
    .argument("<id>", "External tool ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus external-tool get 11111111-1111-4111-8111-111111111111
  $ nexus external-tool get 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE STORED openApiSpec IS NOT RETURNED — not here and not by the REST route.
  KEEP YOUR OWN COPY: "update-spec" overwrites it and there is no baseline to
  roll back to.
  NEITHER ARE THE OPERATION IDS. --json carries actionsCount, a number, and no
  action list — so this command cannot tell you what to pass to
  "external-tool test --operation-id" or "execute --action". Read them from
  your spec.
  actionsCount is what the spec parsed to at create/refresh time, not a
  liveness check. "external-tool test" is the liveness check.
  dashboardUrl IS ADDED BY THIS CLI AND IS NOT AN API FIELD. It is this tool's
  page, so nothing has to assemble a URL from a path pattern that can be
  renamed underneath it.`
    )
    .action(async (id: string) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const t = await client.skills.getExternalTool(id);
        printRecord({ ...t, dashboardUrl: dashboardUrlFor("externalTool", t.id, globals) }, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "endpointUrl", label: "Endpoint URL" },
          { key: "createdAt", label: "Created" },
          { key: "dashboardUrl", label: "Dashboard" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ──────────────────────────────────────────────────────────────
  const create = externalTool
    .command("create")
    .description("Create an external tool from an OpenAPI spec")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .option("--image-url <url>", "URL to the tool's logo/icon image")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus external-tool create --body openapi-tool.json
  $ nexus external-tool create --body '{"name":"Weather API","openApiSpec":"openapi: 3.0.0\\n...","endpointUrl":"https://api.example.com","auth":{"type":"none"}}'
  $ nexus external-tool create --body openapi-tool.json --image-url https://example.com/logo.png
  $ cat spec.json | nexus external-tool create --body -

Notes:
  openApiSpec IS A STRING, NOT AN OBJECT. It carries the spec's JSON or YAML
  text; passing a parsed object is a 400 whatever the spec itself contains.

  PASS THE BODY AS A FILE OR ON STDIN. An inline spec of any real size
  overflows the shell's argument limit and the process dies before the CLI is
  reached — which looks like a broken install, not a long argument.

  REQUIRED IN THE BODY: name, openApiSpec, endpointUrl (a valid URL) and auth.
  auth.type is one of none, service_http, user_http, oauth, user_oauth, keys —
  send { "type": "none" } rather than omitting auth.

  THERE IS NO DRAFT AND NO PUBLISH STEP. The tool comes back PUBLISHED and is
  live the moment this returns — unlike a workflow, which you publish
  separately. Do not go looking for a publish verb, and do not create against a
  production endpoint expecting a staging state first.

  DECLARE requestBody FOR EVERY WRITE OPERATION. Actions are parsed from the
  spec, and an operation with no requestBody gets no body fields — the call
  then goes out bodyless, returns 200 and persists NOTHING.

  The endpointUrl on the tool is the base URL every action is dispatched
  against; the spec's own servers block is not used in its place.

  A COMPLETE MINIMAL BODY IS FOUR KEYS, and the second example above is it:

    {
      "name": "Weather API",
      "openApiSpec": "<the spec's JSON or YAML text, as a STRING>",
      "endpointUrl": "https://api.example.com",
      "auth": { "type": "none" }
    }

  KEEP THE SPEC FILE. "external-tool get" does not return openApiSpec and
  neither does the REST route, so this body is the only copy you will have.

  IT DOES NOT ECHO THE TOOL. --json prints exactly
  {success, message, id, name, dashboardUrl}; id is what every other subcommand
  in this namespace takes as its argument. Read the stored tool with
  "nexus external-tool get <id>".
  dashboardUrl IS THIS CLI'S, NOT THE API'S. It is the page for the tool you
  just made — open it, or hand it to whoever asked for the tool.`
    )
    .action(async (opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.imageUrl) flags.imageUrl = opts.imageUrl;
        const body = mergeBodyWithFlags(base, flags);

        const t = await client.skills.createExternalTool(
          asRequestBody<CreateExternalToolBody>(body)
        );
        printSuccess("External tool created.", {
          id: t.id,
          name: t.name,
          dashboardUrl: dashboardUrlFor("externalTool", t.id, globals)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── upload-icon ─────────────────────────────────────────────────────────
  const uploadIcon = externalTool
    .command("upload-icon")
    .description("Upload an icon/logo image for an external tool")
    .argument("<id>", "External tool ID")
    .requiredOption("--file <path>", "Path to the image file, PNG/JPG/SVG (required)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus external-tool upload-icon 11111111-1111-4111-8111-111111111111 --file ./logo.png
  $ nexus external-tool upload-icon 11111111-1111-4111-8111-111111111111 --file ./icon.svg

Notes:
  THE FILE IS CHECKED BEFORE ANYTHING IS SENT. A path that does not exist is
  refused locally, with the resolved absolute path in the message — so a typo
  costs no round trip and the tool's current icon is untouched.
  --file resolves relative to the CURRENT DIRECTORY, or takes an absolute path.
  The file's BASENAME is what gets stored as the uploaded name, so name the file
  what you want recorded.
  PNG, JPG and SVG. The icon is cosmetic — it changes how the tool renders in the
  dashboard and nothing about what it can do.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const absPath = path.resolve(opts.file);

        if (!fs.existsSync(absPath)) {
          process.exitCode = refuse(
            `File not found: ${absPath}`,
            "Pass a path that exists, relative to the current directory or absolute."
          );
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
  $ nexus external-tool initiate-oauth 11111111-1111-4111-8111-111111111111
  $ nexus external-tool initiate-oauth 11111111-1111-4111-8111-111111111111 --name "Production token"

Notes:
This directly fetches a token from the OAuth token endpoint using
client_credentials grant (machine-to-machine). No browser redirect needed.
The tool's auth must be configured with type "oauth" and grant_type "client_credentials".
  THERE IS NO INTERACTIVE FLOW HERE. If the tool's auth is a user-consent OAuth,
  this is the wrong verb and the call fails — it never opens a browser and never
  waits for a redirect.
  It answers with a credentialId, which is the handle every other verb takes.
  --name is optional and labels the credential; omitting it does not stop the
  token being fetched.`
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
    .requiredOption("--body <json>", "Auth body as JSON, .json file, or '-' for stdin (required)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus external-tool update-auth 11111111-1111-4111-8111-111111111111 --body '{"type":"oauth","grant_type":"client_credentials","client_id":"...","client_secret":"...","client_url":"...","audience":"..."}'
  $ nexus external-tool update-auth 11111111-1111-4111-8111-111111111111 --body auth-config.json

Notes:
  🚨 A BODY OF {"type":"keys"} SUCCEEDS WITH NO KEY MATERIAL AND LEAVES THE TOOL
  UNUSABLE. Nothing requires the credential fields for that type, so the call
  answers success, the tool's old auth is gone, and every operation fails
  afterwards. There is no warning and no rollback. Send the credentials in the
  same body, then prove it with "nexus external-tool test-auth <id>" before you
  trust the tool again.
  THE FIELDS DEPEND ON "type", AND ONLY THE oauth SHAPE IS SHOWN ABOVE. The
  other types want different keys, and the refusal for a wrong shape names
  exactly which fields it wanted — so the cheapest way to learn a shape is to
  send {"type":"<the type>"} and read the rejection. Do that on a tool you can
  afford to break, because a shape that HAPPENS to validate is applied.
  THIS REPLACES THE AUTH WHOLESALE. It is not a patch: what you send is what the
  tool has afterwards.`
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
    .requiredOption("--operation-id <op>", "Operation ID to test with")
    .option(
      "--input <json>",
      "Input parameters as JSON, a file path, or '-' for stdin (default: {})"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus external-tool test-auth 11111111-1111-4111-8111-111111111111 --operation-id listItems
  $ nexus external-tool test-auth 11111111-1111-4111-8111-111111111111 --operation-id searchVehicles --input '{"pageSize":1}'

Notes:
Tests that the stored credentials work by executing an operation. If the token is
expired, the platform will attempt to refresh it automatically before calling the API.
  --operation-id IS REQUIRED, and it is declared so: commander refuses a call
  without it and prints usage. There is no safe default to pick, because the
  operation you name is the one that actually runs.
  🚨 THIS IS A REAL CALL AGAINST THE REAL API, not a dry check. Name a read
  operation — a write one will write.
  --input defaults to {} and also takes a file path or "-" for stdin.
  A pass proves the credential works for THAT operation. A scope-limited token
  can pass here and still be refused by another.`
    )
    .action(async (id: string, opts) => {
      try {
        // `--operation-id` is a requiredOption: the operation named is the one
        // that really runs against the live API, so there is no safe default to
        // pick. Commander refuses before this action, with a usage message.
        const client = createClient(program.optsWithGlobals());
        const input = (opts.input ? await resolveInputJson(opts.input) : {}) as Record<
          string,
          unknown
        >;
        const result = await client.skills.testExternalTool(id, {
          operationId: opts.operationId,
          input
        });
        if (result.status === "success") {
          // The RECORD first, then the verdict. Both wrote a JSON document under
          // --json, so the pair was two concatenated documents; the record is the
          // payload a caller parses, so it is the one that keeps stdout.
          printRecord(result);
          printSuccess("Auth credentials are valid. Operation executed successfully.", {
            status: result.status,
            executionTimeMs: result.executionTimeMs
          });
        } else {
          // `remote-error`, never a refusal: the invocation was ACCEPTED and the
          // platform answered that the stored credentials do not work. The
          // caller's next move is to fix the credentials, not the command line.
          //
          // This arm was `console.error` + exit 1, so under --json it produced a
          // non-zero exit and an EMPTY stdout — the clause-2 defect. The success
          // arm above was reordered for clause 1 and this one was left behind,
          // which is why the driven scan never saw it: its stub cannot satisfy
          // `status === "success"`, so it lands here and records `silent`.
          process.exitCode = reportFailure(
            "remote-error",
            `Auth test failed: ${result.error ?? "Unknown error"}`,
            "Update the stored credentials with `external-tool update-auth`, then test again."
          );
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
  $ nexus external-tool execute 11111111-1111-4111-8111-111111111111 --action google_sheets-create-spreadsheet --input '{"title":"My Sheet"}'
  $ nexus external-tool execute 11111111-1111-4111-8111-111111111111 --action send_email --input '{"to":"a@b.com"}' --credential cred-123
  $ nexus external-tool execute 11111111-1111-4111-8111-111111111111 --body '{"action":"send_email","input":{"to":"a@b.com"}}'
  $ nexus external-tool execute 11111111-1111-4111-8111-111111111111 --action send_email --input /tmp/input.json
  $ cat params.json | nexus external-tool execute 11111111-1111-4111-8111-111111111111 --action send_email --input -

Notes:
  CLASSIFY THE ACTION BEFORE YOU FIRE. This one command both lists records and
  sends mail; its reversibility is entirely --action's. There is no dry run and
  no confirmation.

  "success": true DOES NOT MEAN THE ACTION SUCCEEDED. It reports that Nexus
  dispatched the call and got an answer back. A Pipedream action that failed
  comes back as success with the failure as a STRING in result — read it,
  starting "Pipedream action failed:" or "Pipedream action returned an error:".
  A result of "The action completed but returned no data" is that same shape:
  the upstream returned nothing, which is usually a rejected input.
  success is false only when the tool's own endpoint answered non-2xx.

  NEXUS DOES NOT VALIDATE YOUR PARAMETERS. Required fields are metadata parsed
  from the spec, never enforced here — a missing or misspelled key is forwarded
  as-is and fails upstream, inside an envelope that still says success. Read the
  action's schema from your OpenAPI spec first.
  Empty strings and nulls are STRIPPED before dispatch, so "" is not a way to
  send a blank value.

  --input takes inline JSON, a path to a .json file, or '-' for stdin. Anything
  that is not a readable file is treated as literal JSON.

  --credential accepts either id for the same connected account: the tool-scoped
  one from "tool credentials <toolId>" or the unified one from "credential list".
  Omit it and the FIRST active credential on the tool is chosen for you.`
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
          process.exitCode = refuse("--action is required (or provide it in --body)");
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
  const test = externalTool
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
  $ nexus external-tool test 11111111-1111-4111-8111-111111111111 --operation-id getWeather --input '{"city":"London"}'
  $ nexus external-tool test 11111111-1111-4111-8111-111111111111 --body '{"operationId":"getWeather","input":{"city":"London"}}'
  $ nexus external-tool test 11111111-1111-4111-8111-111111111111 --operation-id listItems --input '{}' --json

Notes:
  --input IS EFFECTIVELY REQUIRED, EVEN FOR AN OPERATION THAT TAKES NOTHING.
  There is no default, so omitting it fails validation on the "input" field.
  Pass --input '{}' for a parameterless operation. ("test-auth" does default
  it; this command does not.)
  🚨 THAT SAME "input" ERROR IS ALSO WHAT A WRONG --operation-id LOOKS LIKE.
  Input is validated before the operation is resolved, so a typo'd operation id
  is reported as a problem with your input and sends you to fix the wrong
  argument. Always send --input '{}' FIRST; only once that is in place does the
  message become a real one about the operation.
  A BOGUS OPERATION ID DOES NOT LIST THE REAL ONES HERE. Its sibling does —
  "nexus external-tool execute <id> --action nope" answers with the tool's
  available actions. Use that to discover them, then come back.
  TEST vs EXECUTE: test takes --operation-id and answers {status, output,
  executionTimeMs} — it is the liveness check. execute takes --action and
  answers {success, toolId, action, result} — it is the real invocation. Both
  run the operation for real against the upstream API.`
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
  const update = externalTool
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
  $ nexus external-tool update 11111111-1111-4111-8111-111111111111 --name "Renamed Tool"
  $ nexus external-tool update 11111111-1111-4111-8111-111111111111 --body update.json
  $ nexus external-tool update 11111111-1111-4111-8111-111111111111 --body update.json --description "New description"

To refresh just the OpenAPI spec from a file, prefer:
  $ nexus external-tool update-spec 11111111-1111-4111-8111-111111111111 --file openapi.yaml

Notes:
  A KEY THE UPDATE DOES NOT RECOGNISE IS DROPPED IN SILENCE, and the call still
  succeeds. So a misspelled field looks applied: the response is a success and
  the value never lands. Read the field back with "nexus external-tool get <id>"
  after any --body update rather than trusting the 200.
  dashboardUrl in the payload is this tool's page, added by this CLI rather
  than returned by the API.`
    )
    .action(async (id: string, opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
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
        printSuccess("External tool updated.", {
          id: t.id,
          name: t.name,
          dashboardUrl: dashboardUrlFor("externalTool", t.id, globals)
        });
      } catch (err) {
        const breaking = extractSpecBreakingChangeDetails(err);
        if (breaking) {
          process.exitCode = reportSpecBreakingChange(breaking);
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
  $ nexus external-tool update-spec 11111111-1111-4111-8111-111111111111 --file openapi.yaml
  $ nexus external-tool update-spec 11111111-1111-4111-8111-111111111111 --file openapi.json --json
  $ nexus external-tool update-spec 11111111-1111-4111-8111-111111111111 --body '{"openApiSpec":"openapi: 3.0.0\\n..."}'
  $ nexus external-tool update-spec 11111111-1111-4111-8111-111111111111 --file openapi.yaml --force
  $ cat openapi.yaml | nexus external-tool update-spec 11111111-1111-4111-8111-111111111111 --file -

Notes:
  THIS OVERWRITES THE ONLY STORED COPY OF THE SPEC, and "external-tool get"
  does not return it — so there is no rollback baseline unless you kept one.
  Keep the previous file.

  THE ACTION LIST IS REBUILT FROM THE NEW SPEC. An operation the new spec drops
  stops existing; the guard only refuses when a dropped key is still BOUND by a
  workflow node or agent tool config. An unbound action disappears silently.

  DECLARE requestBody FOR EVERY WRITE OPERATION. An operation with no
  requestBody parses to no body fields, so the call goes out bodyless, returns
  200 and persists NOTHING — the refresh is where that regression is introduced.

  --force is not "retry harder": it refreshes anyway and leaves every downstream
  node bound to a removed action to be repointed by hand.

  THE RESPONSE DOES NOT SAY WHAT CHANGED. It prints {id, name} — the same two
  fields whether the refresh added twelve actions, removed one, or parsed to
  exactly what was there before. Re-read actionsCount with
  "nexus external-tool get <id>" and compare it against what you had; that
  number is the only readable evidence the rebuild did anything.`
    )
    .action(async (id: string, opts) => {
      try {
        const openApiSpec = await resolveSpecString(opts);
        if (openApiSpec === null) {
          process.exitCode = refuse(
            "provide the spec via --file <path> or --body '{\"openApiSpec\":...}'"
          );
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
          process.exitCode = reportSpecBreakingChange(breaking);
          return;
        }
        process.exitCode = handleError(err);
      }
    });

  // ── delete ─────────────────────────────────────────────────────────────
  const remove = externalTool
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
  $ nexus external-tool delete 11111111-1111-4111-8111-111111111111
  $ nexus external-tool delete 11111111-1111-4111-8111-111111111111 --force

Notes:
  THERE IS NO CONFIRMATION PROMPT AND NO --yes FLAG, on a TTY or anywhere else.
  The reference guard is the only thing standing between the command and the
  deletion, so on an UNREFERENCED tool this deletes on the first invocation —
  and --force removes that guard as well.
  Answers with {id} and nothing else. There is no "deleted" field to assert on,
  so a 200 IS the confirmation; verify with "nexus external-tool list".`
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
          process.exitCode = reportToolHasAttachments(attachments);
          return;
        }
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`. `initiate-oauth`,
  // `update-auth`, `test-auth`, `execute` and `update-spec` reach routes the v1
  // contract does not declare, so they stay unbound.
  bindCommand(list, SKILLS_LIST_EXTERNAL_TOOLS_CONTRACT);
  bindCommand(get, SKILLS_GET_EXTERNAL_TOOL_CONTRACT);
  bindCommand(create, SKILLS_CREATE_EXTERNAL_TOOL_CONTRACT);
  bindCommand(uploadIcon, SKILLS_UPLOAD_EXTERNAL_TOOL_ICON_CONTRACT);
  bindCommand(test, SKILLS_TEST_EXTERNAL_TOOL_CONTRACT);
  bindCommand(update, SKILLS_UPDATE_EXTERNAL_TOOL_CONTRACT);
  bindCommand(remove, SKILLS_DELETE_EXTERNAL_TOOL_CONTRACT);
}

/**
 * The API's OWN codes for the two 409s this file special-cases.
 *
 * ⚠️ NAMED ONCE, BECAUSE THE EXTRACTOR AND THE REPORTER MUST AGREE. The
 * extractor matches on the code and the reporter puts it on the wire; two
 * literals would let a rename move one and not the other, and the document
 * would then carry a code the CLI never actually matched.
 */
const TOOL_HAS_ATTACHMENTS = "TOOL_HAS_ATTACHMENTS";
const TOOL_SPEC_BREAKING_CHANGE = "TOOL_SPEC_BREAKING_CHANGE";

function extractToolHasAttachmentsDetails(err: unknown): ToolHasAttachmentsDetails | null {
  if (!(err instanceof NexusApiError)) return null;
  if (err.status !== 409 || err.code !== TOOL_HAS_ATTACHMENTS) return null;
  return (err.details as ToolHasAttachmentsDetails) ?? null;
}

/**
 * The 409 from the "has attachments" guard, as ONE error document.
 *
 * ⚠️ THE SAMPLE LIST HAS TO RIDE INSIDE `message`, NOT BESIDE IT ON STDERR.
 * This printed the whole list with `console.error` and left the caller to set
 * `process.exitCode = 1`, so under `--json` the command exited non-zero with an
 * EMPTY stdout — a caller could not tell "already deleted" from "still
 * attached" by shape OR by status, which is the one combination no script works
 * around.
 *
 * 🚨 THE CODE IS THE SERVER'S, NOT A `CLI_*` ONE. A `CLI_*` code means the
 * request never reached the API — that is the whole provenance rule — so
 * `reportFailure("remote-error", …)` here would stamp `CLI_REMOTE_ERROR` on a
 * 409 the server deliberately raised, throw away the actionable
 * `TOOL_HAS_ATTACHMENTS`, and tell a script branching on `code` that a refusal
 * it can act on was a client-side transport failure it cannot. `handleError`'s
 * own 409 branch has always used `err.code`; this is the same rule, kept at a
 * call site that special-cases the SAME status for a richer message.
 *
 * `printFailure` is the verb for that: a document with a REQUIRED explicit code
 * and no opinion about the exit code. Returning the code keeps the document and
 * the status in one statement at the call site.
 */
function reportToolHasAttachments({ total, sample }: ToolHasAttachmentsDetails): number {
  const lines = sample.map((a) => `  • ${a.label}  (agent: ${a.agentName})`);
  if (total > sample.length) {
    lines.push(`  • … and ${total - sample.length} more`);
  }

  printFailure(
    `Cannot delete: ${total} agent tool config(s) reference this external tool:\n${lines.join("\n")}`,
    TOOL_HAS_ATTACHMENTS,
    "Re-run with --force to cascade-delete the references along with the tool."
  );
  // The request conflicts with state that exists — the same category HTTP 409
  // lands in. It returned a bare 1 before the taxonomy existed.
  return EXIT_CODES["invalid-input"];
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
  if (err.status !== 409 || err.code !== TOOL_SPEC_BREAKING_CHANGE) return null;
  return (err.details as ToolSpecBreakingChangeDetails) ?? null;
}

/**
 * The spec-breaking-change refusal, as ONE error document.
 *
 * Same defect and same fix as {@link reportToolHasAttachments}: the binding list
 * went to stderr and stdout stayed empty at exit 1, so `--json` promised a
 * document and delivered nothing on the one path where the caller most needs to
 * read WHICH actions it would break — and the code is the SERVER'S, for the
 * reason spelled out there.
 */
function reportSpecBreakingChange({
  removedActions,
  total,
  bindings
}: ToolSpecBreakingChangeDetails): number {
  const lines = [
    `  removed action(s): ${removedActions.join(", ")}`,
    `  bound by ${total} reference(s):`,
    ...bindings.map((b) => `  • [${b.kind}] ${b.label}  → ${b.action}`)
  ];
  if (total > bindings.length) {
    lines.push(`  • … and ${total - bindings.length} more`);
  }

  printFailure(
    `Refusing to refresh: the new spec removes ${removedActions.length} action(s) still bound downstream:\n` +
      lines.join("\n"),
    TOOL_SPEC_BREAKING_CHANGE,
    "Re-run with --force to refresh anyway — downstream nodes binding a removed action need repointing manually."
  );
  return EXIT_CODES["invalid-input"];
}
