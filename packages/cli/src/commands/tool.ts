import type {
  ConnectToolBody,
  ConnectToolHttpBody,
  ConnectToolOAuthBody,
  CreatePipedreamCredentialBody,
  ExecuteToolDirectBody,
  HandshakeStatusResponse,
  ResolveRemoteOptionsBody,
  TestAgentToolBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import {
  CLI_HANDSHAKE_EXPIRED,
  CLI_HANDSHAKE_PENDING,
  handleError,
  printFailure,
  refuse,
  reportFailure
} from "../errors";
import { EXIT_CODES } from "../exit-codes";
import { isJsonMode, printRecord, printSuccess, printTable, type RecordField } from "../output";
import {
  asRequestBody,
  mergeBodyWithFlags,
  readStringField,
  resolveBody,
  resolveRequiredBody
} from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import {
  TOOL_DISCOVERY_SEARCH__PARAMS_TYPE,
  TOOL_DISCOVERY_SEARCH_CONTRACT,
  TOOL_DISCOVERY_SKILLS__PARAMS_TYPE,
  TOOL_DISCOVERY_SKILLS_CONTRACT
} from "./tool.contract.generated";

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

/**
 * The handshake columns, named once because FIVE code paths print them now.
 *
 * `connection-status` used to have one printer and one exit; it has four arms,
 * and a per-arm copy of this array is four things to drift.
 */
const HANDSHAKE_FIELDS: readonly RecordField<HandshakeStatusResponse>[] = [
  { key: "status", label: "Status" },
  { key: "connectionId", label: "Connection ID" },
  { key: "errorMessage", label: "Error" },
  { key: "expiresAt", label: "Expires At" }
];

export function registerToolCommands(program: Command): void {
  const tool = program.command("tool").description("Discover and manage marketplace tools");

  // ── search ────────────────────────────────────────────────────────────
  const search = tool
    .command("search")
    .description("Search marketplace tools")
    .option("--query <query>", "Search query")
    .option("--category <category>", "Filter by category")
    .addOption(enumOption("--type <type>", "Filter by type", TOOL_DISCOVERY_SEARCH__PARAMS_TYPE))
    .option("--limit <number>", "Max results", parseInt)
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool search --query "gmail"
  $ nexus tool search --category "Communication" --limit 10
  $ nexus tool search --query "slack" --json

Notes:
  THERE IS NO SECOND PAGE HERE, AND A TRUNCATED RESULT LOOKS COMPLETE. This
  command exposes no --offset and no --page, and it prints the rows ALONE —
  --json is a bare array, not an envelope. Narrow with --query or --category
  rather than paging; a short result is the only evidence you have seen
  everything.

  THE SERVER DOES SEND total AND facets; THIS COMMAND DISCARDS THEM. The route
  answers {tools, facets, total} and takes an offset, so the ceiling is this
  client's, not the API's. Reach the whole answer with
  "nexus api GET /tools/search" when you need to page or to count.

  --query IS OPTIONAL, AND OMITTING IT BROWSES. It defaults to the empty string
  rather than being required, so "nexus tool search --limit 20" walks the
  catalogue and "--type WORKFLOW" alone filters it. There is no separate list
  command in this namespace; this is it.

  --category IS FREE TEXT AND VALIDATES NOTHING, unlike --type beside it.
  Tool.categories is a string array with no closed set, so a misspelled category
  is not refused — it returns an empty result that reads exactly like "no tools
  in that category". The real values come back as facets on the same response:
  "nexus api GET /tools/search" shows every category with its count. Read one
  from there before you filter on it.`
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
  $ nexus tool get 11111111-1111-4111-8111-111111111111
  $ nexus tool get 11111111-1111-4111-8111-111111111111 --json

Notes:
  THIS IS THE AUTHORITATIVE ACTION LIST FOR A MARKETPLACE TOOL, and it is what
  you need before "nexus tool execute --action". --json carries actions[], each
  {key, name, description, parameters[]}, and each parameter
  {name, type, label, description, required, default, remoteOptions}. key is
  what --action takes. An array or object parameter on a custom-manifest tool
  also carries schema, holding the nested shape the flat name/type pair cannot
  express.
  This is the opposite of "external-tool get", which returns actionsCount and no
  action list at all — there you read the operation ids out of your own spec.

  ACTIONS ARE PAGED SERVER-SIDE AND THIS COMMAND CANNOT REACH THE PAGES. The
  route takes actionsLimit (200 at most), actionsOffset and actionsSearch; none
  is exposed here. On a tool with a large action set, use
  "nexus api GET /tools/<id>?actionsOffset=..." rather than assuming what came
  back is all of it.

  remoteOptions true means the values are NOT in this response — fetch them with
  "nexus tool resolve-options <id>".`
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
  $ nexus tool credentials 11111111-1111-4111-8111-111111111111
  $ nexus tool credentials 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE ID COLUMN IS THE CREDENTIAL, NOT THE TOOL. The argument is the tool's id;
  every row's ID is a credential id, and that is what "tool execute" and
  "tool delete-credential" take.
  THAT CREDENTIAL ID IS TOOL-SCOPED, AND IT IS NOT THE ONE "credential" AND
  "access-card" TAKE. Those take the UNIFIED id for the same connected account,
  and it comes from "nexus credential list". Both are UUIDs, so pasting this one
  into "access-card list --credential-id" is well-formed and still wrong — it is
  refused, and the refusal names the unified id to use instead.
  TYPE says how the credential was obtained — it is what tells a Pipedream OAuth
  account apart from a key entered by hand, which matters because only one of
  them can be re-minted without a person.
  ONE TOOL CAN HOLD SEVERAL, and nothing here marks one as default. When two rows
  look alike, NAME is the only thing separating them, so name them on creation.
  An empty list prints an empty table rather than an error — a tool with no
  credential is a normal state, not a failure.`
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
  $ nexus tool connect 11111111-1111-4111-8111-111111111111 --service GOOGLE_SHEETS
  $ nexus tool connect 11111111-1111-4111-8111-111111111111 --auth-type http --api-key-value sk-abc123 --name "Production key"
  $ nexus tool connect 11111111-1111-4111-8111-111111111111 --body '{"authType":"http","apiKey":"sk-abc"}'

Notes:
  --service names the account to authorize, and the tool ID does not imply it:
  neither "nexus tool search" nor "nexus tool get" returns it. Use the built-in
  OAuth service name (GOOGLE_SHEETS, GMAIL, NOTION, ...) or the Pipedream app
  slug (google_sheets).

  --auth-type http IS NARROWER THAN IT SOUNDS, AND ITS REFUSAL NAMES THE WRONG
  THING. It fits ONE kind of tool: the marketplace calls that kind "user_http".
  Every other tool answers 400 "Tool auth type is not http" — including the
  API-key tools, which the marketplace calls "keys" and which are the common
  case. That message names an auth type no tool ever reports, so it reads as a
  typo in your flag when it is really the wrong tool for this branch.

  MOST TOOLS CONNECT ON THE DEFAULT PATH, API KEY OR NOT. Leave --auth-type
  alone, pass --service, and follow the link the response returns; the key is
  entered there. Reach for --auth-type http only after the default path has
  refused you.

  CONNECTING WITH --auth-type http ADDS A CREDENTIAL, IT DOES NOT REPLACE ONE.
  A tool holds many, so a second key for the same tool is a second row and both
  keep working — a re-run to "try another key" leaves you with two, not one.
  List them with "nexus tool credentials <id>" and remove the one you no longer
  want with "nexus tool delete-credential".

  THE TWO BRANCHES ANSWER TWO DIFFERENT SHAPES, and the message tells you which:
    "OAuth flow initiated."     {authorizationUrl, handshakeId, expiresAt}
    "Tool connected via HTTP."  {id, name, type, status, createdAt}
  On the OAuth branch nothing is connected yet — open authorizationUrl, then
  pass handshakeId to "nexus tool connection-status <handshake-id>". That is the
  only place that id is used, and it expires at expiresAt.

  THE http BRANCH'S id IS TOOL-SCOPED, NOT THE INVENTORY ID. It is the id
  "nexus tool credentials <tool-id>" and "nexus tool delete-credential" take.
  The "nexus credential" and "nexus access-card" commands take the UNIFIED id
  for the same connected account, and that one comes from
  "nexus credential list". Two ids, one account, and neither namespace accepts
  the other's — "nexus external-tool execute --credential" is the one place that
  takes either.`
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
          process.exitCode = refuse(
            `--auth-type must be one of: ${CONNECT_AUTH_TYPES.join(", ")} (got "${rawAuthType}").`
          );
          return;
        }

        if (rawAuthType === "http") {
          const apiKey = readStringField(opts.apiKeyValue, base, "apiKey");
          if (apiKey === undefined) {
            // The body key is apiKey, NOT apiKeyValue — the flag and the field
            // do not share a name here, so the message has to say which.
            process.exitCode = refuse(
              '--api-key-value is required for HTTP auth. Pass it as a flag, or as "apiKey" inside --body (the flag wins if you supply both).',
              "nexus tool connect <id> --auth-type http --api-key-value <key>\n" +
                '  nexus tool connect <id> --body \'{"authType":"http","apiKey":"<key>"}\''
            );
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
          process.exitCode = refuse(
            '--service is required for OAuth. Pass it as a flag, or as "service" inside --body (the flag wins if you supply both).',
            "nexus tool connect <id> --service <service>\n" +
              '  nexus tool connect <id> --body \'{"authType":"oauth","service":"GOOGLE_SHEETS"}\'\n' +
              "  e.g. --service GOOGLE_SHEETS (built-in OAuth) or --service google_sheets (Pipedream app slug)"
          );
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
    .requiredOption("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool resolve-options 11111111-1111-4111-8111-111111111111 --body '{"componentId":"gmail-send","propName":"label","credentialId":"cred-123","configuredProps":{}}'

Notes:
  --body IS REQUIRED even though it reads as optional above: the command refuses
  without it rather than sending an empty request, because every field in it
  selects what to resolve.
  IT ANSWERS A DROPDOWN, NOT A TOOL. propName names the single parameter whose
  choices you want; componentId names the action it belongs to. Asking for a
  parameter that carries no dynamic options is a question with no answer.
  configuredProps IS WHAT MAKES THE ANSWER CORRECT, and {} is rarely right. Later
  options usually depend on earlier ones — a sheet's tab list needs the
  spreadsheet already chosen — so pass what is set so far.
  credentialId picks WHOSE options these are; the same parameter resolves
  differently per connected account.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // Every field in the body selects WHAT to resolve, so there is no
        // usable default. `--body` is a requiredOption above; commander refuses
        // before this action runs rather than the action hand-rolling a refusal
        // that `--help` gave no warning of.
        const body = await resolveRequiredBody(opts.body);
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
  const skills = tool
    .command("skills")
    .description("List organization skills (workflows, tasks, collections)")
    // A SHORTER list than `tool search --type`, and the contract says so: the
    // skills route accepts the three org-owned kinds, the search route every
    // marketplace kind. Neither is a narrowing declared here.
    .addOption(enumOption("--type <type>", "Filter by type", TOOL_DISCOVERY_SKILLS__PARAMS_TYPE))
    .option("--search <query>", "Search by name")
    .option("--limit <number>", "Max results", parseInt)
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool skills
  $ nexus tool skills --type WORKFLOW --search "onboarding"
  $ nexus tool skills --json

Notes:
  THIS LISTS YOUR ORGANIZATION'S OWN SKILLS, NOT MARKETPLACE TOOLS. Despite
  sitting under "tool", it returns the workflows, AI tasks and collections your
  organization has built — the things you attach to an agent alongside a
  marketplace tool. It lives here because that is the catalogue an agent picks
  from. For marketplace tools use "nexus tool search".`
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
  $ nexus tool test 33333333-3333-4333-8333-333333333333 22222222-2222-4222-8222-222222222222 --input '{"to":"test@example.com"}'
  $ nexus tool test 33333333-3333-4333-8333-333333333333 22222222-2222-4222-8222-222222222222 --body '{"input":{"query":"hello"}}'

Notes:
  TWO IDS, AND NEITHER IS THE TOOL'S. The first is the AGENT; the second is that
  agent's tool CONFIGURATION — the row that binds a tool and a credential to this
  agent. A marketplace tool id will not work in either slot.
  🚨 IT REALLY EXECUTES, with the agent's own credential. This is the configured
  tool doing its job, so a send action sends and a write action writes. It is a
  test of the wiring, never a dry run.
  --input is the shorthand and lands as "input" inside the body; --body is the
  same request written out. Passing both merges them, with --input winning on
  that key.
  A pass proves this agent can run this tool with this credential — which is a
  narrower claim than the tool working, and the one worth checking after a
  credential changes.
  THE EXIT CODE CARRIES THAT CLAIM. A pass exits 0 and a failure exits non-zero,
  so a post-credential-change script can gate on it instead of parsing the
  document. Under --json a failure REPLACES the result with the error document;
  its message carries the platform's own reason.`
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
        if (result.status === "success") {
          printRecord(result);
        } else {
          // `remote-error`, never a refusal: the invocation was ACCEPTED and the
          // platform answered that this agent cannot run this tool with this
          // credential — which is the claim this command's own help makes for a
          // pass, and the one a post-credential-change script gates on. The
          // caller's next move is to fix the tool configuration, not the command
          // line. Same shape and same taxonomy choice as
          // `external-tool test-auth`.
          //
          // 🚨 THE RECORD IS NOT PRINTED FIRST. Under --json a failure is the
          // error document and NOTHING else; taking stdout with the payload and
          // then refusing leaves a document that parses cleanly and never says
          // the test failed — `error-masked` in `json-one-document.scan.ts`.
          // `result.error` carries the reason, so nothing is lost.
          process.exitCode = reportFailure(
            "remote-error",
            `Tool test failed: ${result.error ?? "Unknown error"}`,
            "A pass proves this agent can run this tool with this credential. Check the tool configuration's credential and its parameter setup, then test again."
          );
        }
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
  $ nexus tool execute 11111111-1111-4111-8111-111111111111 --action "google_sheets-create-spreadsheet" --input '{"title":"My Sheet"}'
  $ nexus tool execute 11111111-1111-4111-8111-111111111111 --body '{"action":"getWeather","input":{"city":"London"}}'

Notes:
  THIS RUNS CUSTOM_MANIFEST TOOLS TOO. "nexus external-tool execute" is a
  sibling, not a required detour — both reach the same execution and return the
  same envelope. Prefer external-tool execute when you are already working in
  that namespace; nothing here is refused for being a custom manifest.

  AN UNNAMED CALL STILL RUNS UNDER THE CREDENTIAL'S FULL AUTHORITY. Omitting
  accessCardId resolves the credential's MASTER card, and a master card permits
  every action the credential can perform and filters no parameter — so this
  command, used as the examples above use it, is unscoped.

  Naming accessCardId in --body is what scopes it, and it is HONOURED rather
  than refused: the card must belong to the credential being spent, and its
  policy decides which action and which parameters survive. A refusal is a 403
  naming what it refused. "nexus access-card list" shows the cards you can name.`
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
  $ nexus tool connection-status hs-abc-123 --json

Notes:
  FOUR STATES, AND ONLY ONE OF THEM MEANS KEEP POLLING:
    PENDING    the browser flow has not finished. Poll again.
    COMPLETED  terminal, and connectionId is now set — that is the connection.
    FAILED     terminal. Read errorMessage, and branch on errorCode.
    EXPIRED    terminal. The handshake outlived expiresAt; start again with
               "nexus tool connect".
  Anything other than PENDING is a stop condition. There is no timeout here and
  no retry budget, so the loop is yours to bound — expiresAt, returned by
  "tool connect" and echoed on every poll, is the deadline to bound it with.

  errorCode IS THE FIELD TO BRANCH ON, NEVER errorMessage. It is
  ORG_HAS_NO_MEMBERS, PIPEDREAM_TOOL_NOT_IN_MARKETPLACE or
  PIPEDREAM_INVALID_ACCOUNT, and it is null on PENDING and COMPLETED — and also
  null on a FAILED outcome nobody has classified yet, so a null errorCode beside
  FAILED means "read errorMessage", never "no error".

  connectionId IS null UNTIL COMPLETED. Do not read its absence as a failure
  while status is still PENDING.

  THE EXIT CODE SAYS WHICH OF THE FOUR, so a poll loop never has to parse this
  document to decide whether to keep going. COMPLETED exits 0. FAILED and EXPIRED
  exit non-zero, with different codes on the document: one is diagnosed from
  errorCode, the other can only be replaced by a new "nexus tool connect".
  PENDING exits non-zero too, under the UNMEASURED category — nothing failed and
  nothing passed, so it is deliberately not the failure code. Under --json a
  non-COMPLETED status REPLACES this record with the error document, and the two
  fields the advice above depends on — errorCode and expiresAt — are carried in
  that document's own message.`
    )
    .action(async (handshakeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.toolConnection.pollStatus(handshakeId);
        // FOUR STATES, THREE MEANINGS, and this command's own help already spells
        // them out: anything other than PENDING is a stop condition.
        //
        //   COMPLETED  the handshake worked. Exit 0, and print the record — the
        //              `connectionId` on it IS the thing the caller came for.
        //   PENDING    the browser flow has not finished. NOTHING HAS BEEN
        //              JUDGED, so this is `unmeasured`, never a failure: a poll
        //              loop must be able to tell "keep going" from "it broke"
        //              without parsing the document it just printed.
        //   FAILED     terminal, and the platform says why.
        //   EXPIRED    terminal, and the handshake outlived `expiresAt`.
        //
        // FAILED and EXPIRED both exit `remote-error` and never share a `code`:
        // one is fixed by reading `errorCode` and retrying the same connection,
        // the other only by starting a new handshake. Deliberately NOT
        // `timed-out`, whose declaration says the server may still be completing
        // the request — an expired handshake definitively is not.
        if (result.status === "COMPLETED") {
          printRecord(result, HANDSHAKE_FIELDS);
        } else if (result.status === "PENDING") {
          if (!isJsonMode()) printRecord(result, HANDSHAKE_FIELDS);
          printFailure(
            // 🚨 THE DEADLINE IS INTERPOLATED, NOT POINTED AT. Under --json the
            // error document REPLACES the record, so a hint saying "expiresAt is
            // on this document" would name a field that is not there — a hint
            // that sends the reader to nothing. The scalars this command's own
            // next-step advice depends on travel INSIDE the message and the hint.
            `The handshake is still PENDING — the browser flow has not finished. It expires at ${result.expiresAt ?? "an unpublished time"}.`,
            CLI_HANDSHAKE_PENDING,
            "Nothing failed and nothing passed. Poll again, and bound your loop with the expiry above. The exit code is UNMEASURED, never a failure."
          );
          process.exitCode = EXIT_CODES.unmeasured;
        } else if (result.status === "EXPIRED") {
          if (!isJsonMode()) printRecord(result, HANDSHAKE_FIELDS);
          printFailure(
            `The handshake EXPIRED — it outlived ${result.expiresAt ?? "its deadline"} without completing.`,
            CLI_HANDSHAKE_EXPIRED,
            'Start a new one with "nexus tool connect". This handshake can no longer complete.'
          );
          process.exitCode = EXIT_CODES["remote-error"];
        } else {
          if (!isJsonMode()) printRecord(result, HANDSHAKE_FIELDS);
          process.exitCode = reportFailure(
            "remote-error",
            // Same reason: `errorCode` is the field this command's help tells a
            // caller to branch on, so it travels in the message rather than
            // being referred to. `null` is a REAL value here — the help is
            // explicit that a null errorCode beside FAILED means "read
            // errorMessage", never "there was no error" — so it is printed as
            // `null` rather than omitted, which would make absent and
            // unclassified look identical.
            `The handshake FAILED [errorCode: ${result.errorCode ?? "null"}]: ${result.errorMessage ?? "no message given"}`,
            "Branch on the errorCode above, never on the message text. A null errorCode beside FAILED means read the message — it never means there was no error."
          );
        }
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
  $ nexus tool create-credential 11111111-1111-4111-8111-111111111111 --account-id pd-acct-456
  $ nexus tool create-credential 11111111-1111-4111-8111-111111111111 --account-id pd-acct-456 --name "Production Gmail"

Notes:
  THIS IS THE STEP AFTER THE BROWSER, NOT INSTEAD OF IT. The OAuth happens at a
  Pipedream connect link; this records the account it produced against the tool.
  Running it before that consent has nothing to record.
  --account-id IS PIPEDREAM'S ID, not a Nexus one, and it is the one identifier
  here that does not come from this CLI — read it back from the connect flow.
  --name is what tells two credentials on the same tool apart in
  "nexus tool credentials". Skip it and you get a list you cannot choose from.
  It answers with the new credential's own id, which is the handle
  "tool execute" takes.`
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
  confirmable(tool.command("delete-credential"))
    .description("Delete a tool credential")
    .argument("<tool-id>", "Tool ID")
    .argument("<credential-id>", "Credential ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool delete-credential 11111111-1111-4111-8111-111111111111 44444444-4444-4444-8444-444444444444
  $ nexus tool delete-credential 11111111-1111-4111-8111-111111111111 44444444-4444-4444-8444-444444444444 --yes

Notes:
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.

  IT REVOKES AT THE PROVIDER BEFORE IT DROPS THE ROW, AND A REFUSED REVOCATION
  ABORTS THE WHOLE DELETE. For a Pipedream-backed credential the connected
  account is revoked first; if the provider refuses, nothing is removed and the
  credential still works. That error means "try again", not "half-deleted".

  DELETING A CREDENTIAL TAKES ITS ACCESS CARDS WITH IT. Every card written
  against it goes too, including hand-written non-master ones. Agent tool
  configs and workflow nodes naming this credential are NOT updated and NOT
  warned about — they keep pointing at the dropped row and fail later, somewhere
  else, as an orphaned-credential error. List what depends on it before you
  delete, not after something breaks.`
    )
    .action(async (toolId: string, credentialId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete credential ${credentialId}?`, opts))) return;

        await client.toolConnection.deleteCredential(toolId, credentialId);
        printSuccess("Credential deleted.", { toolId, credentialId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(search, TOOL_DISCOVERY_SEARCH_CONTRACT);
  bindCommand(skills, TOOL_DISCOVERY_SKILLS_CONTRACT);
}
