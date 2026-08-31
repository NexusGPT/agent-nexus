import type { ConnectCredentialBody, UpdateCredentialBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError, refuse } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, readStringField, resolveBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { nonBlankOr } from "../util/present-text";
import {
  CREDENTIAL_LIST__PARAMS_SORT_BY,
  CREDENTIAL_LIST__PARAMS_SORT_ORDER,
  CREDENTIAL_LIST__PARAMS_SOURCE,
  CREDENTIAL_LIST__PARAMS_STATUS,
  CREDENTIAL_LIST_CONTRACT
} from "./credential.contract.generated";

export function registerCredentialCommands(program: Command): void {
  const credential = program
    .command("credential")
    .description("Manage credentials (OAuth, API keys, tool credentials)");

  // ── connect ───────────────────────────────────────────────────────────
  credential
    .command("connect")
    .description("Connect an external app (OAuth or API key)")
    .option("--service <service>", "OAuth service or Pipedream app slug to authorize")
    .option("--api-key-value <key>", "API key to store (API-key branch)")
    .option("--tool <id>", "Marketplace tool the API key belongs to (API-key branch)")
    .option("--name <name>", "Label for the credential the API-key branch creates")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus credential connect --service GMAIL
  $ nexus credential connect --service google_sheets --json
  $ nexus credential connect --tool 11111111-1111-4111-8111-111111111111 --api-key-value sk-abc123 --name "Production key"

Notes:
  THIS IS THE WHOLE FLOW, NOT A STEP INSIDE ONE. No workflow, no agent, no node,
  and on the OAuth branch no tool id — the account is the subject. "nexus tool
  connect" reaches the same machinery through a tool, and its OAuth branch never
  reads the tool id it demands, which is why that path made connecting an app
  look like a tool operation.

  THE BRANCH IS CHOSEN BY WHICH FLAG YOU PASS, and passing both is refused
  rather than resolved: --service is OAuth, --api-key-value is the API key. --tool is
  required with --api-key-value and is REJECTED with --service, because the key is
  stored against that tool's auth block while the OAuth flow has no tool at all.

  --service NAMES AN ACCOUNT, NOT A TOOL. Use a built-in OAuth service name
  (GMAIL, GOOGLE_SHEETS, NOTION, ...) or a Pipedream app slug (google_sheets).
  Built-in names are matched case-insensitively; anything else falls through to
  the Pipedream catalog, so a typo comes back as a Pipedream failure rather than
  as "no such service".

  THE TWO BRANCHES ANSWER TWO DIFFERENT SHAPES, and authType says which:
    "oauth"    {authorizationUrl, handshakeId, expiresAt} — NOTHING IS CONNECTED
               YET. Open authorizationUrl, then poll with
               "nexus credential connect-status <handshake-id>".
    "api_key"  {credentialId, toolCredentialId, name, type, status, createdAt} —
               the credential exists as of this answer.

  ON THE API-KEY BRANCH, credentialId IS THE ID THIS NAMESPACE TAKES.
  toolCredentialId is the OTHER id space — the one "nexus tool credentials"
  lists and "nexus tool delete-credential" takes. Both are UUIDs and neither
  namespace accepts the other's, so pasting the wrong one is well-formed and
  still refused. "credential get", "credential update", "credential delete" and
  "access-card list --credential-id" all want credentialId.

  A SECOND KEY FOR THE SAME TOOL IS A SECOND CREDENTIAL, not a replacement.
  Re-running this to "try another key" leaves you with two, both live. Remove
  the one you do not want with "nexus tool delete-credential".

  credentialId CAN BE null, and that is a real state rather than a failure: a
  tool-credential row that carries no unified credential row. Nothing in this
  namespace can address such a credential; delete it through the tool commands.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);

        const service = readStringField(opts.service, base, "service");
        const apiKey = readStringField(opts.apiKeyValue, base, "apiKey");
        const toolId = readStringField(opts.tool, base, "toolId");

        if (service !== undefined && apiKey !== undefined) {
          process.exitCode = refuse(
            // 🚨 EVERY REFUSAL HERE KEEPS `--body` IN ITS FIRST STRING LITERAL, and
            // that is a constraint on the WRAP, not only on the words.
            // `util/required-field-refusals-name-both-paths.test.ts` reads the first
            // literal of the `refuse()` call, so a message whose mention of `--body`
            // prettier pushes into the second half reads as naming only the flag —
            // which is how this reddened in CI after passing locally.
            "Pass --service or --api-key-value, not both — as flags or inside --body. " +
              "--service selects OAuth; --api-key-value selects the API key.",
            "nexus credential connect --service GMAIL\n" +
              "  nexus credential connect --tool <tool-id> --api-key-value <key>"
          );
          return;
        }

        // Each arm is built as a TYPED member of the server's own discriminated
        // union, and the arm is chosen by testing the field that arm REQUIRES —
        // so the compiler carries the narrowing and no cast stands in for it.
        let body: ConnectCredentialBody;
        if (apiKey !== undefined) {
          if (toolId === undefined) {
            process.exitCode = refuse(
              "--tool is required with --api-key-value, as a flag or in --body. " +
                "The key is stored against that tool's auth block, so this branch names a " +
                "tool where the OAuth one has none.",
              "nexus credential connect --tool <tool-id> --api-key-value <key>\n" +
                "  Resolve the tool id with: nexus tool search --query <name>"
            );
            return;
          }
          const name = readStringField(opts.name, base, "name");
          body = {
            authType: "api_key",
            toolId,
            apiKey,
            ...(name !== undefined && { name })
          };
        } else if (service !== undefined) {
          if (toolId !== undefined) {
            // Not silently dropped: a caller who passed --tool believes the
            // account is being authorized FOR that tool, and it is not.
            process.exitCode = refuse(
              "--tool is not accepted with --service, as a flag or in --body. " +
                "An OAuth connection belongs to the account, not to a tool.",
              "nexus credential connect --service GMAIL"
            );
            return;
          }
          body = { authType: "oauth", service };
        } else {
          process.exitCode = refuse(
            "One of --service or --api-key-value is required, as a flag or in --body. " +
              "--service selects OAuth; --api-key-value selects the API key (a flag wins " +
              "over --body).",
            "nexus credential connect --service GMAIL\n" +
              "  nexus credential connect --tool <tool-id> --api-key-value <key>\n" +
              "  e.g. --service GMAIL (built-in OAuth) or --service google_sheets (Pipedream app slug)"
          );
          return;
        }

        const result = await client.credentials.connect(body);

        if (result.authType === "oauth") {
          printSuccess("OAuth flow initiated.", result);
          return;
        }
        printSuccess("App connected.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── connect-status ────────────────────────────────────────────────────
  credential
    .command("connect-status")
    .description('Poll a connection started by "credential connect"')
    .argument("<handshake-id>", "Handshake ID from the connect response")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus credential connect-status 22222222-2222-4222-8222-222222222222
  $ nexus credential connect-status ctok_dac4453f92a54ae7ac45e23694cc4a78 --json

Notes:
  THE ID IS NOT ALWAYS A UUID. A built-in OAuth handshake id is one; a Pipedream
  connection's is its connect token, "ctok_...". Both are accepted here, and
  nothing else is — this is not a credential id.

  FOUR STATES, AND ONLY ONE OF THEM MEANS KEEP POLLING:
    PENDING    the browser flow has not finished. Poll again.
    COMPLETED  terminal, and connectionId is now set — that is the connection.
    FAILED     terminal. Read errorMessage, and branch on errorCode.
    EXPIRED    terminal. The handshake outlived expiresAt; start again with
               "nexus credential connect".
  There is no timeout here and no retry budget, so the loop is yours to bound —
  expiresAt, returned by "credential connect", is the deadline to bound it with.

  errorCode IS THE FIELD TO BRANCH ON, NEVER errorMessage. It is
  ORG_HAS_NO_MEMBERS, PIPEDREAM_TOOL_NOT_IN_MARKETPLACE or
  PIPEDREAM_INVALID_ACCOUNT, and it is null on PENDING and COMPLETED — and also
  null on a FAILED outcome nobody has classified yet, so a null errorCode beside
  FAILED means "read errorMessage", never "no error".

  connectionId IS null UNTIL COMPLETED. Do not read its absence as a failure
  while status is still PENDING.

  A COMPLETED connection is not yet addressable by connectionId in this
  namespace — find the new row with "nexus credential list", which is the
  unified inventory this id space belongs to.`
    )
    .action(async (handshakeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.credentials.connectStatus(handshakeId);
        printRecord(result, [
          { key: "status", label: "Status" },
          { key: "connectionId", label: "Connection ID" },
          { key: "errorCode", label: "Error Code" },
          { key: "errorMessage", label: "Error" },
          { key: "expiresAt", label: "Expires At" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── list ──────────────────────────────────────────────────────────────
  const credentialList = addPaginationOptions(
    credential
      .command("list")
      .description("List credentials")
      .addOption(
        enumOption(
          "--source <source>",
          "Filter by which record backs the row",
          CREDENTIAL_LIST__PARAMS_SOURCE
        )
      )
      .addOption(
        enumOption("--status <status>", "Filter by status", CREDENTIAL_LIST__PARAMS_STATUS)
      )
      .option("--service <service>", "Filter by service name")
      .option(
        "--tool-id <id>",
        "Only credentials scoped to this tool — the exact 'is it connected' check"
      )
      .option("--search <query>", "Case-insensitive substring over several fields — see Notes")
      .addOption(enumOption("--sort-by <field>", "Sort by field", CREDENTIAL_LIST__PARAMS_SORT_BY))
      .addOption(
        enumOption("--sort-order <order>", "Sort direction", CREDENTIAL_LIST__PARAMS_SORT_ORDER)
      )
      .addHelpText(
        "after",
        `
Examples:
  $ nexus credential list
  $ nexus credential list --source oauth_connection --status CONNECTED
  $ nexus credential list --service Gmail --sort-by name
  $ nexus credential list --tool-id 11111111-1111-4111-8111-111111111111
  $ nexus credential list --search "production" --json

Notes:
  THE UNIFIED INVENTORY, not one table. SOURCE says which record backs a row —
  oauth_connection, api_key_connection or tool_credential — and decides what
  "credential delete" has to tear down on the way out.
  The ID printed here is the one "access-card list --credential-id" wants and
  the one "external-tool execute --credential" accepts.
  🔴 SERVICE IS A LABEL AND DOES NOT SAY A TOOL IS CONNECTED. For a tool
  credential it is the tool's public name, and nothing makes that unique — one
  organization held two rows reading SERVICE "Apify" that belonged to the
  Pipedream tool NAMED Apify, while the Apify-type tool that needed a
  credential had none. Both readings of that table are wrong in the same
  direction: "Apify is connected" was reported, and executing the other tool
  answered 400 "Credential not found or does not belong to this tool".
  TOOL ID is the column that settles it, and --tool-id is the question asked
  precisely: it returns only the credentials that tool can actually be executed
  with, so an EMPTY RESULT MEANS NOT CONNECTED rather than "no label matched".
  TOOL ID is "—" for oauth_connection and api_key_connection rows — those are
  organization-wide and belong to no single tool, so --tool-id never returns
  one. It is also the id "nexus tool credentials <id>" takes, which is the
  other half of the same answer.
  --search MATCHES MORE THAN THE NAME, AND NOT THE SERVICE. It is a
  case-insensitive substring over the connected account's email and name, an
  API-key connection's name and DESCRIPTION, and a tool credential's name — so
  a hit can come from text the table never shows, and the row looks arbitrary.
  It does NOT match the service; filter on that with --service instead.
  Paginated. Check meta.paging before concluding a credential is absent — and
  a zero-result --search is weak evidence of absence for the same reason.`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.credentials.list({
        ...getPaginationParams(opts),
        source: opts.source,
        status: opts.status,
        service: opts.service,
        toolId: opts.toolId,
        search: opts.search,
        sortBy: opts.sortBy,
        sortOrder: opts.sortOrder
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "service", label: "SERVICE", width: 20 },
        { key: "name", label: "NAME", width: 25 },
        { key: "source", label: "SOURCE", width: 18 },
        { key: "status", label: "STATUS", width: 15 },
        // SERVICE alone was read as an answer to "is this tool connected" and
        // it is not one — see the note in this command's --help. Full width, not
        // an abbreviation: this id is the argument of "nexus tool credentials"
        // and of --tool-id, so a cut one is a value the reader has to go and
        // look up again. "—" rather than a blank cell for the org-wide sources,
        // so "no tool" reads as an answer rather than as missing data.
        { key: "toolId", label: "TOOL ID", width: 36, format: (v) => nonBlankOr(v, "—") }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── get ───────────────────────────────────────────────────────────────
  credential
    .command("get")
    .description("Get credential details")
    .argument("<id>", "Credential ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus credential get 11111111-1111-4111-8111-111111111111
  $ nexus credential get 11111111-1111-4111-8111-111111111111 --json

Notes:
  SOURCE IS THE FIELD THAT DECIDES WHAT ELSE WORKS, and it is the one printed
  here that nothing on this screen explains. It says which record backs the row —
  oauth_connection, api_key_connection or tool_credential — and it settles two
  separate questions: what "credential delete" has to tear down on the way out,
  and which of name/description "credential update" can actually store. Only
  api_key_connection stores both; see "credential update --help".
  A null description is normal rather than empty: two of the three sources have
  no description column at all, so the field is null for every row backed by one.
  NO SECRET MATERIAL IS RETURNED and none ever will be — this is the inventory
  record, not the token. Use "external-tool test-auth" to find out whether the
  stored credentials still work.
  ACCESS CARDS ARE A SEPARATE READ: "nexus access-card list --credential-id
  <id>". This record does not say how many policies hang off it.
  STATUS is the stored connection state, not a live probe.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const cred = await client.credentials.get(id);
        printRecord(cred, [
          { key: "id", label: "ID" },
          { key: "service", label: "Service" },
          { key: "name", label: "Name" },
          { key: "source", label: "Source" },
          { key: "status", label: "Status" },
          { key: "accountIdentifier", label: "Account" },
          { key: "failureReason", label: "Failure Reason" },
          { key: "description", label: "Description" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" },
          { key: "lastUsedAt", label: "Last Used" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  credential
    .command("update")
    .description("Update a credential's name or description")
    .argument("<id>", "Credential ID")
    .option("--name <name>", "Updated name")
    .option("--description <text>", "Updated description")
    .option("--data <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus credential update 11111111-1111-4111-8111-111111111111 --name "Production Gmail"
  $ nexus credential update 11111111-1111-4111-8111-111111111111 --description "Used by marketing agents"
  $ nexus credential update 11111111-1111-4111-8111-111111111111 --data '{"name":"Staging","description":null}'

Notes:
  ONLY name AND description ARE WRITABLE, and WHICH OF THE TWO depends on the
  credential's SOURCE — the field "credential get" prints and "credential list
  --source" filters on. A credential is a pointer into one of three tables, and
  ALL THREE now store both fields:
    api_key_connection   name AND description
    tool_credential      name AND description
    oauth_connection     name AND description
  ON AN OAUTH CREDENTIAL, --name SETS YOUR OWN LABEL AND DOES NOT TOUCH THE
  ACCOUNT NAME. Those are two different values: the account name comes from the
  provider and is refreshed on every reconnect, so it is what still identifies
  WHICH account this is after you rename the credential. "credential get" keeps
  showing it as the account identifier, and a credential you never named reports
  the account name as its name.
  name CANNOT BE CLEARED and description CAN. name is a non-empty string on the
  wire — '"name": null' and '"name": ""' are both refused — so a label can be
  replaced but not removed. '"description": null' does clear the description.
  A FIELD A SOURCE CANNOT STORE IS STILL REFUSED — 400
  CREDENTIAL_FIELD_NOT_WRITABLE, naming the fields, nothing changed. No source
  refuses either of these two today; the refusal is what a future source with
  fewer columns will get. This surface used to answer 200 having written nothing,
  so a rename that never happened was indistinguishable from one that did.
  RE-SENDING A VALUE THAT IS ALREADY SET IS NOT REFUSED, on any source. It asks
  for no change, so '"description": null' on a credential that has no
  description is accepted.
  Any key other than those two is silently DROPPED by the contract — a 200 comes
  back having applied nothing you sent.
  THIS CANNOT REPAIR A BROKEN CREDENTIAL. There is no token field here, so a
  NEEDS_REAUTH credential stays broken however it is renamed; reconnect it.
  "description": null CLEARS the description. Omitting the key leaves it as it
  was — null and absent are different requests.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        const base = await resolveBody(opts.data);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description })
        });

        const cred = await client.credentials.update(id, asRequestBody<UpdateCredentialBody>(body));
        printRecord(cred, [
          { key: "id", label: "ID" },
          { key: "service", label: "Service" },
          { key: "name", label: "Name" },
          { key: "status", label: "Status" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  confirmable(credential.command("delete"))
    .description("Delete a credential")
    .argument("<id>", "Credential ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus credential delete 11111111-1111-4111-8111-111111111111
  $ nexus credential delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  BLAST RADIUS — THERE IS NO UNDO. Deleting a credential DELETES EVERY ACCESS
  CARD ON IT, including the master card that "access-card delete" refuses to
  remove, and every Vibe app grant those cards carry.
  Run "nexus access-card list --credential-id <id>" FIRST.

  THAT CHECK IS ONLY EVIDENCE IF IT ANSWERED. It REFUSES an id naming no
  credential rather than printing an empty list, so "no rows" is a fact about
  the credential and not about your paste. Read a refusal as "wrong id", never
  as "nothing to lose" — and never as "already deleted": the same 404 answers
  the TOOL-SCOPED id from "nexus tool credentials", which names a live account
  in the other id space, and says so when it can.

  NOTHING REPOINTS WHAT NAMES IT. Agent tool configs, workflow nodes and
  deployments store the credential id as plain data with no foreign key, so they
  keep the dead id and fail at call time. Nothing here reports them.

  A 2xx IS NOT ALWAYS A COMPLETE DELETE. The inventory row goes first; if the
  underlying OAuth or API-key connection is still referenced (e.g. by a
  Deployment) its cleanup is logged and skipped. The connection then serves
  those deployments while appearing in no "credential list".

  REFUSED WHILE A VIBE APP IS BOUND: 409 CREDENTIAL_STILL_BOUND, naming every
  app. Unbind each one, then retry — the refusal is the guard, not a glitch.

  A PIPEDREAM ACCOUNT IS REVOKED UPSTREAM BEFORE ANYTHING LOCAL HAPPENS. If
  Pipedream refuses you get 502 and NOTHING was deleted — the credential still
  works. Retry; the retry is idempotent.

  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (
          !(await confirmDestructive(
            `Delete credential ${id}? This also deletes its access cards.`,
            opts
          ))
        )
          return;

        await client.credentials.delete(id);
        printSuccess("Credential deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and after the hand-written prose.
  bindCommand(credentialList, CREDENTIAL_LIST_CONTRACT);
}
