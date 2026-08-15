import fs from "node:fs";
import path from "node:path";

import type {
  CreateTicketBody,
  ListTicketsParams,
  NexusClient,
  UpdateTicketBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError, refuse } from "../errors";
import { color, printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { resolveInputValue } from "../util/stdin";
import {
  TICKET_CREATE__BODY_PRIORITY,
  TICKET_CREATE__BODY_TYPE,
  TICKET_CREATE_CONTRACT,
  TICKET_LIST__PARAMS_PRIORITY,
  TICKET_LIST__PARAMS_TYPE,
  TICKET_LIST_CONTRACT,
  TICKET_UPDATE__BODY_PRIORITY,
  TICKET_UPDATE__BODY_TYPE,
  TICKET_UPDATE_CONTRACT
} from "./ticket.contract.generated";

/**
 * Parse a `--labels` value into the array the API expects. An empty value
 * yields `[]`, which on update clears the ticket's non-type labels.
 */
function parseLabels(raw: string): string[] {
  return raw
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
}

/** Renders a ticket's `labels` array for the human-readable record output. */
function formatLabels(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : "";
}

/**
 * Renders the owning organization of a cross-org ticket. The API sends
 * `organizationName: null` for an org that has never been named, so the column
 * falls back to a dash rather than printing the word "null". The
 * `organizationId` is always present in `--json` output when the name is not
 * enough to tell two orgs apart.
 */
function formatOrganizationName(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "—";
}

/** The columns shared by both the org-scoped and the cross-org ticket table. */
const TICKET_COLUMNS = [
  { key: "identifier", label: "IDENTIFIER", width: 12 },
  { key: "title", label: "TITLE", width: 40 },
  { key: "type", label: "TYPE", width: 18 },
  { key: "priority", label: "PRIORITY", width: 10 },
  { key: "status", label: "STATUS", width: 15 }
] as const;

/**
 * List tickets from EVERY organization the caller belongs to, instead of only
 * the profile's active org.
 *
 * The same NEX-* Linear team backs every org, so a ticket filed under one org
 * profile was invisible from another — which made "search before you file"
 * unreliable and duplicated tickets. Cross-org aggregation needs a personal
 * (cross-org) token: an org-scoped key reaches exactly one org by construction,
 * and the API answers it with a 403 rather than a silently single-org list.
 */
async function listAcrossOrganizations(
  client: NexusClient,
  params: ListTicketsParams
): Promise<void> {
  const result = await client.tickets.listAcrossOrganizations(params);

  printList(
    result.tickets,
    {
      total: result.total,
      page: result.page,
      hasMore: result.hasMore,
      organizationCount: result.organizationCount,
      skippedOrganizationIds: result.skippedOrganizationIds
    },
    [
      { key: "identifier", label: "IDENTIFIER", width: 12 },
      { key: "organizationName", label: "ORG", width: 20, format: formatOrganizationName },
      { key: "title", label: "TITLE", width: 32 },
      { key: "type", label: "TYPE", width: 18 },
      { key: "priority", label: "PRIORITY", width: 10 },
      { key: "status", label: "STATUS", width: 15 }
    ]
  );

  warnAboutSkippedOrganizations(result.skippedOrganizationIds);
}

/**
 * Report the organizations whose fetch failed, on STDERR.
 *
 * Aggregation is best-effort: the API skips an org it could not read rather
 * than failing the whole request. Left unsaid, that turns a partial answer into
 * a confident "no such ticket exists" — the exact false negative this command
 * exists to remove. STDERR keeps `--json` output on STDOUT parseable, and the
 * ids also travel inside that JSON's `meta` for a scripted caller.
 */
function warnAboutSkippedOrganizations(skippedOrganizationIds: readonly string[]): void {
  if (skippedOrganizationIds.length === 0) return;

  console.error(
    color.yellow("Warning:") +
      ` ${skippedOrganizationIds.length} organization(s) could not be read and were skipped, ` +
      "so this list is incomplete: " +
      skippedOrganizationIds.join(", ")
  );
}

export function registerTicketCommands(program: Command): void {
  const ticket = program
    .command("ticket")
    .description("Manage tickets (bugs, feature requests, improvements)");

  ticket.addHelpText(
    "after",
    `
A TICKET IS A LINEAR ISSUE. Every organization files into the SAME Linear
team, so identifiers are global and a ticket raised under another organization
is invisible to a single-org read — "ticket list --all-orgs" before you file,
or you will duplicate one.

--data, NOT --body, ON create AND update. This namespace is the exception in
the CLI. "ticket comment --body" is a third thing again: plain comment text,
not JSON.

STATUS IS A LINEAR WORKFLOW-STATE NAME, matched case-insensitively against the
states the team actually has. An unknown name is refused with the full allowed
set, so a bad filter never comes back as an empty page.

WHAT IS REDACTED AND WHAT IS NOT: only context.requestBody and
context.responseBody are scrubbed, and only where a KEY inside that JSON looks
secret. A token in --title, --description or a comment reaches Linear
verbatim. Redaction is not a safety net — do not paste secrets.`
  );

  // ── list ──────────────────────────────────────────────────────────────
  //
  // Bound to `TicketList`. `--all-orgs` routes the SAME leaf to
  // `TicketListAcrossOrganizations`, whose params are the same two enums plus the
  // same free-string status — one command, two descriptors, and `bindCommand`
  // takes one shape. Binding the org-scoped one is the honest choice: it is the
  // default branch, and the values are identical, so the printed contract block
  // is true of both. `TicketListAcrossOrganizations` is therefore not in the
  // ledger and its own enums are not separately gated.
  const list = addPaginationOptions(
    ticket
      .command("list")
      .description("List tickets")
      .addOption(enumOption("--type <type>", "Filter by type", TICKET_LIST__PARAMS_TYPE))
      .addOption(
        enumOption("--priority <priority>", "Filter by priority", TICKET_LIST__PARAMS_PRIORITY)
      )
      .option(
        "--status <status>",
        "Filter by workflow-state name — comma-separate for several. See Notes for how to read the set your team defines"
      )
      .option("--search <query>", "Search by title or description")
      .option(
        "--all-orgs",
        "List across EVERY organization you belong to, not just the active one. " +
          "Requires a personal (cross-org) token; adds an ORG column."
      )
      .addHelpText(
        "after",
        `
Examples:
  $ nexus ticket list
  $ nexus ticket list --type BUG --priority HIGH
  $ nexus ticket list --status "Todo,In Progress"
  $ nexus ticket list --search "login" --json
  $ nexus ticket list --all-orgs --search "webhook"

Notes:
  READ THE STATUS SET, NEVER ASSUME IT. Statuses are the workflow states
  configured on the Linear team, so the team renames and adds them and any list
  written down here is a lie waiting to happen. They are matched
  case-insensitively, and a name the team does not define is rejected with the
  COMPLETE allowed set rather than an empty page — so the fastest way to see
  today's states is to ask for one that cannot exist:

    $ nexus ticket list --status zzz

  The states are not the generic Linear defaults. Do not guess "Done".

  Without --all-orgs, results come from the profile's active organization only.
  Every organization is backed by the same ticket workspace, so a ticket filed
  under another organization is invisible to a single-org search — use
  --all-orgs before filing to avoid duplicates.

  --all-orgs needs a personal (cross-org) token; an organization-scoped key is
  refused with a 403. Get one from Settings -> API Keys -> Personal Tokens,
  then run "nexus auth login".

  --all-orgs IS BEST-EFFORT AND CAN ANSWER SHORT. An organization it could not
  read is SKIPPED rather than failing the call, so "no such ticket" may just
  mean "not in the orgs that answered". A warning naming the skipped ids goes
  to STDERR, and they also travel in meta.skippedOrganizationIds under --json —
  check it before concluding a ticket does not exist.

  NO DESCRIPTION AND NO context HERE. The list carries the summary fields only;
  read either with "nexus ticket get <id>". --search matches the description
  too, so a row can look like an arbitrary hit — the text that matched it is not
  in this output. "ticket get" is where you see why.

  LABELS AND TYPE OVERLAP — LABELS IS NOT SAFE TO FEED BACK. The label a ticket
  was typed with stays in LABELS as well as being surfaced as TYPE, so passing
  the LABELS list straight into --labels on update re-sends a reserved label.
  Drop the type-bearing label before you send it back.

  TYPE IS OFTEN EMPTY, AND THAT IS NOT A DATA FAULT. A ticket filed outside this
  CLI carries its type as an ordinary label and never gets the typed field set,
  so filtering or grouping on TYPE silently omits those rows. Filter on the
  label when you need every ticket of a kind.

  Paginated: --limit / --page, and the total is in the meta line (in --json,
  meta.total). --search is a substring over title and description.`
      )
  );

  list.action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const params = {
        ...getPaginationParams(opts),
        type: opts.type,
        priority: opts.priority,
        status: opts.status,
        search: opts.search
      };

      if (opts.allOrgs) {
        await listAcrossOrganizations(client, params);
        return;
      }

      const { data, meta } = await client.tickets.list(params);
      printList(data, meta, TICKET_COLUMNS);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── get ───────────────────────────────────────────────────────────────
  ticket
    .command("get")
    .description("Get ticket details")
    .argument("<id>", 'Ticket id (see "nexus ticket list")')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket get NEX-3469
  $ nexus ticket get NEX-3469 --json

Notes:
  This reads the profile's ACTIVE organization only, so a ticket filed under
  another organization answers 404. Find it with "nexus ticket list --all-orgs"
  — every row carries its url and, in --json, its organizationId. Then either
  open the url, or switch with "nexus auth use-org <orgId>" and read it here.

  TAKES THE IDENTIFIER OR THE UUID. "NEX-42" is what you normally have; the
  identifier is global across organizations, which is why the 404 above is
  about permission, not about the identifier being unknown.

  THE ONLY COMMAND THAT RETURNS description AND context. context comes back
  reconstructed by parsing the Linear description, so a ticket whose
  description was hand-edited in Linear can read back with fields missing or
  changed. Treat context on read as best-effort, and the Linear issue as the
  source of truth.

  Attachments and comments are separate reads: "nexus ticket comments <id>",
  "nexus ticket attachments <id>".`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const t = await client.tickets.get(id);
        printRecord(t, [
          { key: "id", label: "ID" },
          { key: "identifier", label: "Identifier" },
          { key: "title", label: "Title" },
          { key: "type", label: "Type" },
          { key: "priority", label: "Priority" },
          { key: "status", label: "Status" },
          { key: "labels", label: "Labels", format: formatLabels },
          { key: "url", label: "URL" },
          { key: "description", label: "Description" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  const create = ticket
    .command("create")
    .description("Create a new ticket")
    .requiredOption("--title <title>", "Ticket title")
    .addOption(enumOption("--type <type>", "Ticket type", TICKET_CREATE__BODY_TYPE))
    .addOption(enumOption("--priority <priority>", "Priority", TICKET_CREATE__BODY_PRIORITY))
    .option("--description <text>", "Ticket description")
    .option("--labels <list>", "Comma-separated Linear labels to attach (e.g. CUE)")
    .option("--data <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket create --title "Login fails with SSO"
  $ nexus ticket create --title "Filed by an agent" --labels CUE
  $ nexus ticket create --title "Add dark mode" --type FEATURE_REQUEST --priority MEDIUM
  $ nexus ticket create --title "Bug report" --type BUG --description "Steps to reproduce..."
  $ nexus ticket create --data '{"title":"Bug","type":"BUG"}'
  $ nexus ticket create --title "500 on upload" --data '{"context":{
      "endpoint":"/documents","method":"POST","statusCode":500,
      "requestBody":"{\\"name\\":\\"x\\"}","reproductionSteps":"1. ..."}}'

Notes:
  Uses --data (not --body) for JSON input — this differs from other commands.
  "ticket comment" uses --body for comment text (not JSON).

  context IS A JSON OBJECT INSIDE --data, and it has no flag. Its fields:
  endpoint, method, statusCode, errorCode, requestBody, responseBody,
  reproductionSteps, expectedBehavior, actualBehavior, environment,
  sdkVersion, agentId. ANY OTHER KEY IN IT IS SILENTLY DROPPED — the server
  strips what it does not know rather than refusing, so a typo looks accepted.

  requestBody AND responseBody ARE STRINGS, NOT OBJECTS. Pass JSON-encoded
  text, not a nested object, or the call is refused. Each is capped at 2000
  characters and is truncated with "... (truncated)" beyond that. statusCode
  is a NUMBER; agentId must be a UUID.

  endpoint WITHOUT method IS SILENTLY LOST ON READ. The pair is stored as one
  line and parsed back as one, so an endpoint filed without a method comes back
  from "ticket get" with BOTH fields missing. Always send them together.

  ONLY requestBody AND responseBody ARE REDACTED, and only where a KEY inside
  the parsed JSON matches password, secret, token, apiKey, api-key,
  authorization, cookie or credential — that value becomes "[REDACTED]". A
  secret anywhere else, including --description, reaches Linear verbatim. A
  requestBody that is not valid JSON is not scanned at all, only truncated.

  DEFAULTS ARE APPLIED, NOT LEFT EMPTY: type defaults to BUG and priority to
  MEDIUM. Say so explicitly rather than letting a feature request file as a bug.

  --labels ADDS LINEAR LABELS and creates them on the team if absent (max 20).
  "bug", "feature-request" and "improvement" are reserved for --type and are
  refused here. Use CUE to mark an agent-filed ticket.

  ONE LINEAR TEAM BACKS EVERY ORGANIZATION, so the ticket you are about to file
  may already exist under another one of yours. Run
  "nexus ticket list --all-orgs --search ..." first — a duplicate is the normal
  failure here, and nothing rejects it.
  The output carries the identifier and url; keep the identifier.

  VERIFY WITH "nexus ticket get". Every transform above is silent and this
  response does not distinguish what the server KEPT from what you SENT — an
  unknown context key is dropped, a long requestBody is truncated, an endpoint
  without a method comes back with both fields gone. "ticket get" is the only
  command that returns description and context, so it is the only read that
  shows you what was actually stored.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        const base = await resolveBody(opts.data);
        const body = mergeBodyWithFlags(base, {
          ...(opts.title !== undefined && { title: opts.title }),
          ...(opts.type !== undefined && { type: opts.type }),
          ...(opts.priority !== undefined && { priority: opts.priority }),
          ...(opts.description !== undefined && { description: opts.description }),
          ...(opts.labels !== undefined && { labels: parseLabels(opts.labels) })
        });

        const t = await client.tickets.create(asRequestBody<CreateTicketBody>(body));
        printRecord(t, [
          { key: "id", label: "ID" },
          { key: "identifier", label: "Identifier" },
          { key: "title", label: "Title" },
          { key: "type", label: "Type" },
          { key: "priority", label: "Priority" },
          { key: "status", label: "Status" },
          { key: "labels", label: "Labels", format: formatLabels },
          { key: "url", label: "URL" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  const update = ticket
    .command("update")
    .description("Update a ticket")
    .argument("<id>", 'Ticket id (see "nexus ticket list")')
    .option("--title <title>", "Updated title")
    .addOption(enumOption("--type <type>", "Updated type", TICKET_UPDATE__BODY_TYPE))
    .addOption(
      enumOption("--priority <priority>", "Updated priority", TICKET_UPDATE__BODY_PRIORITY)
    )
    .option("--description <text>", "Updated description")
    .option(
      "--status <status>",
      'Transition to a workflow-state name defined by the team — run "nexus ticket list --status zzz" to print the real set'
    )
    .option(
      "--labels <list>",
      "Comma-separated Linear labels; replaces the ticket's labels (empty value clears them)"
    )
    .option("--data <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket update NEX-3469 --priority URGENT
  $ nexus ticket update NEX-3469 --labels "CUE,needs-triage"
  $ nexus ticket update NEX-3469 --labels ""
  $ nexus ticket update NEX-3469 --title "Updated title" --type BUG
  $ nexus ticket update NEX-3469 --status "In Progress"
  $ nexus ticket update NEX-3469 --status Canceled
  $ nexus ticket update NEX-3469 --data '{"priority":"URGENT"}'

Notes:
  Uses --data (not --body) for JSON input, like "ticket create".

  --labels REPLACES THE TICKET'S LABELS WHOLESALE — it does not add. Sending a
  subset removes the rest; --labels "" clears them all. Read the current set
  with "nexus ticket get" and send it back plus your addition. The type label
  is preserved regardless and cannot be passed here.

  --description REPLACES THE WHOLE DESCRIPTION, INCLUDING THE CONTEXT BLOCK the
  ticket was filed with. That block is where context lives, so overwriting it
  is how a ticket loses its reproduction steps. There is no context field on
  update: to keep it, read the description first and re-send it with your edit.

  --status IS A LINEAR WORKFLOW-STATE NAME and is validated against the team's
  real states; an unknown one is refused with the allowed set. Read that set
  before you write against it — the states are configured per team and are not
  the generic Linear defaults, so a name that reads as obviously right can be
  one the team does not define. "nexus ticket list --status zzz" prints them.

  VERIFY WITH "nexus ticket get". Create and update both transform silently —
  unknown context keys dropped, a long requestBody truncated — and the response
  here does not distinguish what was kept from what was sent.

  AN EMPTY UPDATE IS A SUCCESS THAT CHANGES NOTHING — every field is optional.
  A flag always overrides the same field in --data.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        const base = await resolveBody(opts.data);
        const body = mergeBodyWithFlags(base, {
          ...(opts.title !== undefined && { title: opts.title }),
          ...(opts.type !== undefined && { type: opts.type }),
          ...(opts.priority !== undefined && { priority: opts.priority }),
          ...(opts.description !== undefined && { description: opts.description }),
          ...(opts.status !== undefined && { status: opts.status }),
          ...(opts.labels !== undefined && { labels: parseLabels(opts.labels) })
        });

        const t = await client.tickets.update(id, asRequestBody<UpdateTicketBody>(body));
        printRecord(t, [
          { key: "id", label: "ID" },
          { key: "identifier", label: "Identifier" },
          { key: "title", label: "Title" },
          { key: "type", label: "Type" },
          { key: "priority", label: "Priority" },
          { key: "status", label: "Status" },
          { key: "labels", label: "Labels", format: formatLabels },
          { key: "url", label: "URL" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── close ─────────────────────────────────────────────────────────────
  ticket
    .command("close")
    .description("Close a ticket by transitioning it to a terminal status")
    .argument("<id>", 'Ticket id (see "nexus ticket list")')
    .option("--as <status>", "Workflow-state name to close as", "Canceled")
    .option("--comment <text-or-->", "Optional comment to add before closing ('-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket close NEX-3469
  $ nexus ticket close NEX-3469 --as Canceled --comment "Duplicate of NEX-3468"

Notes:
  IT CLOSES AS Canceled BY DEFAULT, WHICH READS AS "we are not doing this".
  That is the right state for a ticket being dropped and the wrong one for work
  that shipped.
  THERE IS NO "Done" STATE TO PASS. --as takes a workflow-state name the LINEAR
  TEAM defines, and the generic Linear vocabulary is not what this team uses —
  so the obvious --as Done is refused. Print the real set before closing
  anything as shipped:

    $ nexus ticket list --status zzz

  --as IS A WORKFLOW-STATE NAME, so this is "ticket update --status" with a
  default. Nothing checks that the state you name is terminal — --as Backlog
  is accepted and reopens the ticket.
  THE COMMENT IS POSTED FIRST, AS A SEPARATE CALL. If the transition then fails
  — an unknown --as, a permission error — the comment is already on the ticket
  and is not rolled back. Re-running would post it twice.
  --comment - reads the comment body from stdin.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (opts.comment !== undefined) {
          const commentBody = await resolveInputValue(opts.comment);
          await client.tickets.addComment(id, { body: commentBody });
        }

        const t = await client.tickets.update(id, { status: opts.as });
        printRecord(t, [
          { key: "id", label: "ID" },
          { key: "identifier", label: "Identifier" },
          { key: "title", label: "Title" },
          { key: "type", label: "Type" },
          { key: "priority", label: "Priority" },
          { key: "status", label: "Status" },
          { key: "url", label: "URL" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── comment ───────────────────────────────────────────────────────────
  ticket
    .command("comment")
    .description("Add a comment to a ticket")
    .argument("<id>", 'Ticket id (see "nexus ticket list")')
    .requiredOption("--body <text-or-->", "Comment body (text or '-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket comment NEX-3469 --body "This is fixed in v2.1"
  $ echo "Detailed comment" | nexus ticket comment NEX-3469 --body -

Notes:
  --body HERE IS COMMENT TEXT, NOT JSON. It is the one --body in this namespace
  — create and update take --data — and passing JSON just posts that JSON as
  the comment's text.
  "-" reads the body from stdin, which is how you post anything multi-line.
  NOTHING IS REDACTED IN A COMMENT. The scrubbing that applies to
  context.requestBody on create does not apply here; a pasted token goes to
  Linear as typed.
  Comments cannot be edited or deleted through this API.

  YOUR COMMENT IS NOT ATTRIBUTED TO YOU. Every comment this route posts lands
  under ONE shared internal account, whichever key sent it, and nothing in the
  response says so. Nobody reading the ticket can tell which person or which
  automation wrote it, and there is no flag that changes this. Sign the body
  yourself when the author matters:

    $ nexus ticket comment NEX-3469 --body "[deploy-bot] retried, green on 2nd run"

  A FAILURE HERE NAMES ITS CAUSE. When the comment does not post, the error says
  what went wrong — a rate limit, a rejected body, an upstream fault — so read
  it rather than retrying blind. Retrying a rate limit immediately just spends
  the next attempt.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveInputValue(opts.body);
        await client.tickets.addComment(id, { body });
        printSuccess("Comment added.", { ticketId: id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── comments ──────────────────────────────────────────────────────────
  ticket
    .command("comments")
    .description("List comments on a ticket")
    .argument("<id>", 'Ticket id (see "nexus ticket list")')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket comments NEX-3469
  $ nexus ticket comments NEX-3469 --json

Notes:
  THE BODY COLUMN IS TRUNCATED TO 50 CHARACTERS in the table. Use --json to
  read a comment in full — the table is a index, not the content.
  Unpaginated — there are no --limit / --page options here.
  THE AUTHOR COLUMN IS "authorName" IN --json, not "author". A script reading
  .author gets undefined on every row and reads it as an unattributed comment.
  IT IS null FOR A COMMENT WRITTEN BY AN INTEGRATION, and renders blank rather
  than saying so. Every comment posted with "nexus ticket comment" is written by
  an integration, so this column cannot tell you who ran the command.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tickets.listComments(id);
        const comments = result.comments ?? result;

        printList(comments, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "authorName", label: "AUTHOR", width: 20 },
          { key: "body", label: "BODY", width: 50 },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── attach ───────────────────────────────────────────────────────────
  ticket
    .command("attach")
    .description("Upload a file attachment to a ticket")
    .argument("<id>", 'Ticket id (see "nexus ticket list")')
    .requiredOption("--file <path>", "Path to the file to upload")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket attach NEX-3469 --file ./screenshot.png
  $ nexus ticket attach NEX-3469 --file ~/Downloads/error-log.txt

Notes:
  THE WHOLE FILE IS READ INTO MEMORY AND UPLOADED IN ONE REQUEST. There is no
  chunking and no resume, so a large file fails as a single timeout — raise the
  global --timeout <seconds> rather than retrying.
  A MISSING PATH EXITS 1 BEFORE ANY REQUEST, printing the resolved absolute
  path. That is a local check, not a server answer.
  THE FILE IS NOT SCANNED OR REDACTED. A log with credentials in it goes to
  Linear as-is; the redaction on "ticket create" covers context bodies only.
  Confirm with "nexus ticket attachments <id>" — the upload response alone is
  not proof the attachment is listed.`
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

        const { File: NodeFile } = await import("node:buffer");
        const buffer = fs.readFileSync(absPath);
        const fileName = path.basename(absPath);
        const file = new NodeFile([buffer], fileName);

        const result = await client.tickets.uploadAttachment(id, file);
        printSuccess("Attachment uploaded.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── attachments ───────────────────────────────────────────────────────
  ticket
    .command("attachments")
    .description("List attachments on a ticket")
    .argument("<id>", 'Ticket id (see "nexus ticket list")')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket attachments NEX-3469
  $ nexus ticket attachments NEX-3469 --json

Notes:
  THIS IS THE VERIFICATION STEP FOR "ticket attach" — a 2xx on the upload is
  not proof the attachment landed on the ticket.
  Unpaginated. There is no download and no delete command: open the ticket's
  url for the file itself.

  THE ROW IS {id, filename, url, contentType, size, createdAt}. The table prints
  four of those; url and size are --json only, and url is the field you actually
  need, because there is no download here.

  contentType AND size ARE NULLABLE, and a row with both null is not a broken
  upload. An attachment does not have to be a file this CLI sent: anything that
  links itself to the ticket lands in the same list, and then filename is
  whatever that system called it — a pull request title, a document name —
  rather than a name on disk. Branch on url, never on contentType.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tickets.listAttachments(id);
        const attachments = result.attachments ?? result;
        printList(attachments, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "filename", label: "FILE", width: 30 },
          { key: "contentType", label: "TYPE", width: 15 },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(list, TICKET_LIST_CONTRACT);
  bindCommand(create, TICKET_CREATE_CONTRACT);
  bindCommand(update, TICKET_UPDATE_CONTRACT);
}
