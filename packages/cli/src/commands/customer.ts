import type { AddCustomerNoteBody, CreateCustomerBody, UpdateCustomerBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError, printNotFound } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { resolveInputValue } from "../util/stdin";
import {
  CUSTOMER_ADD_NOTE_CONTRACT,
  CUSTOMER_CREATE_CONTRACT,
  CUSTOMER_DELETE_CONTRACT,
  CUSTOMER_GET_BY_EXTERNAL_ID_CONTRACT,
  CUSTOMER_GET_CONTRACT,
  CUSTOMER_LIST__PARAMS_CHANNEL,
  CUSTOMER_LIST__PARAMS_SORT_BY,
  CUSTOMER_LIST__PARAMS_SORT_ORDER,
  CUSTOMER_LIST_CONTRACT,
  CUSTOMER_UPDATE_CONTRACT
} from "./customer.contract.generated";

export function registerCustomerCommands(program: Command): void {
  const customer = program.command("customer").description("Manage CRM customers");

  customer.addHelpText(
    "after",
    `
FOUR ENVELOPES IN ONE NAMESPACE, under --json:
  list                     {data: [...], meta: {total, page, hasMore}}
  get, get-by-external-id  one FLAT object, with no data key around it
  create, update, note     {success, message, id, ...} — an acknowledgement
  delete                   {success, message, id} — the server's own
                           {deleted: true} is dropped before you see it

So one jq expression cannot read all four. A create answers with the id and the
display name and NOTHING ELSE: none of tags, customFields or the channel
identities it just seeded comes back, so a --body field that never landed and
one that did print the same keys. Read the stored row back with
"nexus customer get <id> --json".

A CUSTOMER IS A PERSON PLUS THEIR CHANNEL IDENTITIES. The identities are what
join a CRM row to the conversations it had, and only "customer get" and
"customer get-by-external-id" return them.`
  );

  const list = addPaginationOptions(
    customer
      .command("list")
      .description("List customers")
      .option("--search <query>", "Search by name, email, or phone")
      .option("--tag <tag>", "Keep only customers carrying this tag")
      .addOption(enumOption("--sort-by <field>", "Sort by field", CUSTOMER_LIST__PARAMS_SORT_BY))
      .addOption(
        enumOption("--sort-order <dir>", "Sort direction", CUSTOMER_LIST__PARAMS_SORT_ORDER)
      )
      .addOption(
        enumOption(
          "--channel <channel>",
          "Keep only customers with an identity on this channel",
          CUSTOMER_LIST__PARAMS_CHANNEL
        )
      )
      .addHelpText(
        "after",
        `
Examples:
  $ nexus customer list
  $ nexus customer list --search "john@example.com" --json
  $ nexus customer list --tag vip --limit 50
  $ nexus customer list --channel WHATSAPP --sort-by totalMessages --sort-order desc

Notes:
  --tag IS THE READ SIDE OF "customer update". Tags are WRITTEN with
  "nexus customer update <id> --body '{"tags":["vip"]}'" and read back here.
  Before this flag existed a tag could be written and never filtered by.
  ONE TAG, MATCHED EXACTLY. There is no multi-tag form, no OR, and no partial
  match: the filter asks whether the customer's tag array CONTAINS this exact
  string, so "vip" does not match "VIP" and does not match "vip-eu".

  --sort-by, --sort-order and --channel are validated LOCALLY against the
  contract, so a bad value is refused here and never becomes a 400. --tag is
  NOT — any string is accepted, and a tag nobody carries is an empty list rather
  than an error.
  --sort-by defaults to lastSeenAt and --sort-order to desc. Both defaults live
  on the SERVER, so unset the CLI sends neither.
  --channel MATCHES A CUSTOMER'S IDENTITIES, not their messages: it keeps a
  customer who has an identity on that channel, whatever channel they last
  spoke on.`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.customers.list({
        ...getPaginationParams(opts),
        search: opts.search,
        tag: opts.tag,
        sortBy: opts.sortBy,
        sortOrder: opts.sortOrder,
        channel: opts.channel
      });
      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "displayName", label: "NAME", width: 25 },
        { key: "primaryEmail", label: "EMAIL", width: 30 },
        { key: "primaryPhone", label: "PHONE", width: 15 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  const get = customer
    .command("get")
    .description("Get customer details")
    .argument("<id>", "Customer ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus customer get 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13
  $ nexus customer get 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13 --json

Notes:
  identities[] AND recentSessions[] ARE ON THIS READ AND ON NO LIST. A script
  that pages "customer list" reads undefined for both on every row, because the
  list serializes neither. identities is where a channel identity is legible —
  identifier, service, isPrimary, verifiedAt — and it is what joins this CRM row
  to the conversations it had.
  THE TABLE PRINTS SEVEN FIELDS AND THE RESPONSE CARRIES FAR MORE: tags,
  customFields, avatarUrl, organizationId and both arrays are in the payload and
  in no column. Use --json.
  Under --json this is ONE FLAT OBJECT with no data key — see
  "nexus customer --help" for the four envelopes this namespace answers with.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const c = await client.customers.get(id);
        printRecord(c, [
          { key: "id", label: "ID" },
          { key: "displayName", label: "Name" },
          { key: "primaryEmail", label: "Email" },
          { key: "primaryPhone", label: "Phone" },
          { key: "externalUserId", label: "External User ID" },
          { key: "totalSessions", label: "Sessions" },
          { key: "totalMessages", label: "Messages" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const getByExternalId = customer
    .command("get-by-external-id")
    .description("Find customer by external user ID")
    .argument("<external-user-id>", "External user ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus customer get-by-external-id crm-4471
  $ nexus customer get-by-external-id crm-4471 --json

Notes:
  A MISS IS A 200 ON THE WIRE AND AN EXIT 1 HERE. The route answers data: null
  rather than 404; this command turns that into an error document on STDERR and
  exits 1, leaving STDOUT EMPTY. So read the exit code — empty stdout is the
  miss, never a truncated document.
  THE LOOKUP IS EXACT, CASE-SENSITIVE AND TRIMMED, and at most one customer per
  organization can hold a given external user id. A blank or whitespace-only key
  is a 400 rather than a miss.
  IT PRINTS EVERY FIELD, where "customer get" prints seven labelled ones —
  identities[] and recentSessions[] included. Both arrays carry the same content
  "customer get" returns, and recentSessions[] holds the 20 most recent.
  Set the id at create time with --external-user-id. "customer update" reaches
  it only through --body.`
    )
    .action(async (externalUserId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const c = await client.customers.getByExternalId(externalUserId);
        if (!c) {
          // A miss here is a 200 with an empty body, not a 404, so handleError
          // never sees it. printNotFound is what keeps it a FAILURE on both
          // channels — one JSON error document under --json, exit 1 either way.
          process.exitCode = printNotFound(
            `No customer with external user ID "${externalUserId}".`,
            'Run "nexus customer list --search <term>" to find the customer, then use its external user ID.'
          );
          return;
        }
        printRecord(c);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const create = customer
    .command("create")
    .description("Create a customer")
    .requiredOption("--display-name <name>", "Customer display name")
    .option("--external-user-id <id>", "External user ID")
    .option("--email <email>", "Primary email")
    .option("--phone <phone>", "Primary phone")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus customer create --display-name "Ada Lovelace"
  $ nexus customer create --display-name "Ada" --email ada@example.com
  $ nexus customer create --body '{"displayName":"Ada","tags":["vip"]}'

Notes:
  --email AND --phone EACH CREATE A CHANNEL IDENTITY, not merely a field. The
  email is stored as a GMAIL identity and the phone as a WHATSAPP one, both
  isPrimary and both verifiedAt null, whatever channel the person really uses.
  That identity is what makes "customer list --channel GMAIL" match them.
  AN IDENTITY IS UNIQUE PER ORGANIZATION AND SERVICE. An email or phone another
  customer here already holds fails the WHOLE create with 409 and leaves no
  partial row — the customer and both identities are one transaction. The same
  number held as a TWILIO_SMS identity does not collide, because the service is
  part of the key.
  "customer update" NEVER REVISITS THOSE IDENTITIES. It rewrites the scalar
  column only, so an email changed later leaves the GMAIL identity pointing at
  the old address. Create with the address you mean.
  --body REACHES TWO FIELDS NO FLAG DOES: tags (array of strings) and
  customFields (any object). A flag wins over the same key in --body, and a key
  outside the schema is dropped in silence, so a 200 is not evidence it landed.
  --display-name may come from --body as "displayName" instead of the flag.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = { displayName: opts.displayName };
        if (opts.externalUserId) flags.externalUserId = opts.externalUserId;
        if (opts.email) flags.primaryEmail = opts.email;
        if (opts.phone) flags.primaryPhone = opts.phone;
        const body = mergeBodyWithFlags(base, flags);
        const c = await client.customers.create(asRequestBody<CreateCustomerBody>(body));
        printSuccess("Customer created.", {
          id: c.id,
          displayName: c.displayName
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const update = customer
    .command("update")
    .description("Update a customer")
    .argument("<id>", "Customer ID")
    .option("--display-name <name>", "Display name")
    .option("--email <email>", "Primary email")
    .option("--phone <phone>", "Primary phone")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus customer update 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13 --display-name "Ada Byron"
  $ nexus customer update 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13 --body '{"tags":["vip","eu"]}'

Notes:
  tags AND customFields ARE REPLACED WHOLE, NEVER MERGED. Sending
  {"customFields":{"tier":"gold"}} deletes every other custom field. Read the
  stored object back with "customer get --json" and send it again with your
  change folded in. An update naming neither key leaves the metadata record
  byte-identical, so the customer's notes are never at risk from this command.
  --body REACHES FOUR FIELDS NO FLAG DOES: tags, customFields, externalUserId
  and avatarUrl. externalUserId has a flag on "create" and none here, so --body
  is the only way to change it afterwards.
  --email AND --phone REWRITE THE SCALAR AND LEAVE THE IDENTITY ALONE. The
  GMAIL / WHATSAPP identity that "customer create" seeded still carries the old
  value, and "customer list --channel" keeps matching on it.
  A key outside the schema is dropped in silence, so a 200 is not evidence the
  field was stored. Read it back.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.displayName) flags.displayName = opts.displayName;
        if (opts.email) flags.primaryEmail = opts.email;
        if (opts.phone) flags.primaryPhone = opts.phone;
        const body = mergeBodyWithFlags(base, flags);
        const c = await client.customers.update(id, asRequestBody<UpdateCustomerBody>(body));
        printSuccess("Customer updated.", { id: c.id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const note = customer
    .command("note")
    .description("Add a note to a customer")
    .argument("<id>", "Customer ID")
    .requiredOption("--content <text-or-->", "Note content (or '-' for stdin)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus customer note 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13 --content "Renewal booked"
  $ nexus customer note 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13 --content -

Notes:
  A NOTE IS WRITE-ONLY THROUGH THIS API. The write succeeds and then nothing
  reads it back: "customer get" pulls only tags and customFields out of the
  metadata record the note was appended to, and there is no notes-list,
  note-edit or note-delete verb here. Read your notes in the dashboard.
  THIS COMMAND ALSO DISCARDS THE NOTE THE WRITE RETURNS. The route answers with
  the note's id, content, author and createdAt; the CLI prints the customer id
  and nothing else, so the note id never reaches you on either channel.
  IT APPENDS AND NEVER REPLACES. Every call adds a record under a row lock, so
  two concurrent notes cannot lose each other.
  The author is the user behind the API key, or the literal "api" when the key
  identifies no user; the author NAME is always null on this route. --content is
  1-5000 characters after trimming, and "-" reads it from stdin.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const content = opts.content ? await resolveInputValue(opts.content) : undefined;
        const body = mergeBodyWithFlags(base, content ? { content } : {});
        await client.customers.addNote(id, asRequestBody<AddCustomerNoteBody>(body));
        printSuccess("Note added.", { customerId: id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const del = confirmable(customer.command("delete"))
    .description("Delete a customer")
    .argument("<id>", "Customer ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus customer delete 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13
  $ nexus customer delete 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13 --yes

Notes:
  THE CONVERSATIONS SURVIVE; THE CRM ROW AND ITS IDENTITIES DO NOT. One
  transaction unlinks every deployment session — customerId and
  customerIdentityId set to null, the session and its messages left in place —
  then deletes the customer row, taking its identities with it by cascade. The
  history stays readable and stops being attributable to a person.
  A GROUP CONVERSATION LOSES THE PARTICIPANT ROW TOO. A session participant
  hangs off the identity, so it cascades away while the messages remain.
  THE NOTES, TAGS AND customFields GO WITH THE ROW. They live in the customer's
  own metadata column, nothing copies them anywhere, and there is no undo and no
  export. Run "customer get <id> --json" first if any of it matters.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        if (!(await confirmDestructive(`Delete customer ${id}?`, opts))) return;
        await client.customers.delete(id);
        printSuccess("Customer deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  //
  // `list` WAS absent: its sortBy, sortOrder and channel are query parameters
  // and this GET leaf has no `--body` to reach them through. The three flags
  // were added rather than deferred, which is what unblocked the descriptor.
  //
  // The adapter behind this route keeps its OWN allowlist of sort fields and
  // silently falls back to lastSeenAt on a miss, so an unvalidated --sort-by
  // did not even 400 — it returned a differently-ordered page with nothing
  // saying the sort had been ignored. That is the failure this binding removes.
  bindCommand(list, CUSTOMER_LIST_CONTRACT);
  bindCommand(get, CUSTOMER_GET_CONTRACT);
  bindCommand(getByExternalId, CUSTOMER_GET_BY_EXTERNAL_ID_CONTRACT);
  bindCommand(create, CUSTOMER_CREATE_CONTRACT);
  bindCommand(update, CUSTOMER_UPDATE_CONTRACT);
  bindCommand(note, CUSTOMER_ADD_NOTE_CONTRACT);
  bindCommand(del, CUSTOMER_DELETE_CONTRACT);
}
