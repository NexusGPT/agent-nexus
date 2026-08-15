import type { UpdateCredentialBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
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
  $ nexus credential list --search "production" --json

Notes:
  THE UNIFIED INVENTORY, not one table. SOURCE says which record backs a row —
  oauth_connection, api_key_connection or tool_credential — and decides what
  "credential delete" has to tear down on the way out.
  The ID printed here is the one "access-card list --credential-id" wants and
  the one "external-tool execute --credential" accepts.
  --search MATCHES MORE THAN THE NAME, AND NOT THE SERVICE. It is a
  case-insensitive substring over the connected account's email and name, an
  API-key connection's name and DESCRIPTION, and a tool credential's name — so
  a hit can come from text the table never shows, and the row looks arbitrary.
  It does NOT match the service; filter on that with --service instead.
  Paginated. Check meta.hasMore before concluding a credential is absent — and
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
        search: opts.search,
        sortBy: opts.sortBy,
        sortOrder: opts.sortOrder
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "service", label: "SERVICE", width: 20 },
        { key: "name", label: "NAME", width: 25 },
        { key: "source", label: "SOURCE", width: 20 },
        { key: "status", label: "STATUS", width: 15 }
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
  $ nexus credential get abc-123
  $ nexus credential get abc-123 --json

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
  $ nexus credential update abc-123 --name "Production Gmail"
  $ nexus credential update abc-123 --description "Used by marketing agents"
  $ nexus credential update abc-123 --data '{"name":"Staging","description":null}'

Notes:
  ONLY name AND description ARE WRITABLE, and WHICH OF THE TWO depends on the
  credential's SOURCE — the field "credential get" prints and "credential list
  --source" filters on. A credential is a pointer into one of three tables and
  only one of them has both columns:
    api_key_connection   name AND description
    tool_credential      name only
    oauth_connection     NEITHER — its name is the connected account's, kept in
                         step with the provider, and there is no description
  A FIELD THE SOURCE CANNOT STORE IS REFUSED: 400 CREDENTIAL_FIELD_NOT_WRITABLE,
  naming the fields, and nothing at all is changed. This used to answer 200
  having written nothing, so a rename that never happened was indistinguishable
  from one that did.
  RE-SENDING A VALUE THAT IS ALREADY SET IS NOT REFUSED, on any source. It asks
  for no change, so '"description": null' on a credential that has no
  description is accepted — and a --name in the same request still applies where
  the source can store it.
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
  credential
    .command("delete")
    .description("Delete a credential")
    .argument("<id>", "Credential ID")
    // The blast radius below is why this flag exists. Its far less destructive
    // sibling `tool delete-credential` has always confirmed; this command fired
    // on submit, so the one call that cascades over every access card on the
    // credential was the one call nobody was asked about.
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus credential delete abc-123
  $ nexus credential delete abc-123 --yes

Notes:
  BLAST RADIUS — THERE IS NO UNDO. Deleting a credential DELETES EVERY ACCESS
  CARD ON IT, including the master card that "access-card delete" refuses to
  remove, and every Vibe app grant those cards carry.
  Run "nexus access-card list --credential-id <id>" FIRST.

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

  Confirmation is prompted only on a TTY. Piped or scripted, this deletes
  immediately with or without --yes.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

          let answer: string;
          try {
            answer = await rl.question(
              `Delete credential ${id}? This also deletes its access cards. [y/N] `
            );
          } finally {
            // In a `finally`, because an interface left open holds stdin
            // readable and the process then never exits — a rejected prompt
            // would present as a hang on the one command whose whole point is
            // to be interruptible.
            rl.close();
          }

          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.credentials.delete(id);
        printSuccess("Credential deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and after the hand-written prose.
  bindCommand(credentialList, CREDENTIAL_LIST_CONTRACT);
}
