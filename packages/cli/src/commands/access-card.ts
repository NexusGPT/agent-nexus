import type { CreateAccessCardBody, UpdateAccessCardBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";

export function registerAccessCardCommands(program: Command): void {
  const accessCard = program
    .command("access-card")
    .description("Manage access cards for credential-level action policies");

  // ── list ──────────────────────────────────────────────────────────────
  accessCard
    .command("list")
    .description("List access cards for a credential")
    .requiredOption("--credential-id <id>", "Credential ID (required)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus access-card list --credential-id abc-123
  $ nexus access-card list --credential-id abc-123 --json

Notes:
  --credential-id IS REQUIRED. Cards are scoped to one credential; there is no
  org-wide listing on this command.
  THE MASTER ROW IS IN THIS LIST (MASTER true, policies {}). It is the
  credential's own all-access card, it cannot be deleted, and its policies
  cannot be edited — do not mistake it for a card you created.
  Run this BEFORE "credential delete": deleting the credential deletes every
  row printed here.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.credentials.cards.listByCredential(opts.credentialId);
        const cards = result.accessCards ?? result;

        printList(cards, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 25 },
          { key: "isMaster", label: "MASTER", width: 8 },
          { key: "color", label: "COLOR", width: 10 },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── get ───────────────────────────────────────────────────────────────
  accessCard
    .command("get")
    .description("Get access card details")
    .argument("<id>", "Access Card ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus access-card get xyz-456
  $ nexus access-card get xyz-456 --json

Notes:
  Policies is the WHOLE policy — an action absent from it is denied, so read
  the key set, not just the entries. Use --json; the table truncates.
  A card with Master true and policies {} allows everything. A card with Master
  FALSE and policies {} allows NOTHING. Read both fields together.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const card = await client.credentials.cards.get(id);
        printRecord(card, [
          { key: "id", label: "ID" },
          { key: "credentialId", label: "Credential ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "isMaster", label: "Master" },
          { key: "color", label: "Color" },
          { key: "policies", label: "Policies" },
          { key: "variables", label: "Variables" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  accessCard
    .command("create")
    .description("Create a new access card")
    .requiredOption("--credential-id <id>", "Credential ID (required)")
    .requiredOption("--name <name>", "Card name (required)")
    .option("--description <text>", "Card description")
    .option("--color <color>", "Card color (slate, blue, green, etc.)")
    .option("--data <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus access-card create --credential-id abc-123 --name "Send Only" \\
      --data '{"policies":{"gmail:send_email":{"parameters":{"to":{"enabled":true}}}}}'
  $ nexus access-card create --credential-id abc-123 --name "Full Access" \\
      --data policies.json

Notes:
  policies IS A MAP OF ACTION ID TO { "parameters": { "<path>": { "enabled":
  ... } } }. Action ids are taken VERBATIM from "access-card available-actions
  --credential-id <id>" — nothing else is a valid key.

  AN UNLISTED ACTION IS DENIED. An action listed with no "parameters" entry is
  allowed with NO PARAMETERS AT ALL — every argument the caller sends is
  stripped before dispatch. An unlisted parameter inside a listed action is
  stripped the same way, silently.

  OMITTING policies CREATES A CARD THAT GRANTS NOTHING. This command defaults
  it to {}, and {} only means "everything" on the master card, which this
  command CANNOT create — every card created here is non-master. A {} card
  validates, is returned as created, and refuses every action.

  "enabled": true lets the caller set the parameter. "enabled": false with a
  "value" PINS it — the caller cannot override it and never sees the refusal.
  "enabled": false with no value strips the parameter.

  Prove it before trusting it: run the action through the card and confirm the
  parameters that survived.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        const base = await resolveBody(opts.data);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description }),
          ...(opts.color !== undefined && { color: opts.color })
        });

        if (!body.policies) {
          body.policies = {};
        }

        const card = await client.credentials.cards.create(
          opts.credentialId,
          asRequestBody<CreateAccessCardBody>(body)
        );
        printRecord(card, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "isMaster", label: "Master" },
          { key: "color", label: "Color" },
          { key: "credentialId", label: "Credential ID" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  accessCard
    .command("update")
    .description("Update an access card")
    .argument("<id>", "Access Card ID")
    .option("--name <name>", "Updated name")
    .option("--description <text>", "Updated description")
    .option("--color <color>", "Updated color")
    .option("--data <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus access-card update xyz-456 --name "Restricted Send"
  $ nexus access-card update xyz-456 --data '{"policies":{"gmail:send_email":{"parameters":{"to":{"enabled":false,"value":"support@company.com"}}}}}'

Notes:
  policies IS REPLACED WHOLESALE, NEVER MERGED. Send the complete map every
  time — sending one action drops every other action the card allowed, and the
  response looks like a successful update.
  Read the current map with "access-card get <id> --json" and edit that.

  THE MASTER CARD REFUSES policies AND variables: 400. Rename or recolour it
  freely; to restrict anything, create a derived card instead.

  Same semantics as create — unlisted action denied, unlisted parameter
  stripped, "enabled": false + "value" pins a value the caller cannot override.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        const base = await resolveBody(opts.data);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description }),
          ...(opts.color !== undefined && { color: opts.color })
        });

        const card = await client.credentials.cards.update(
          id,
          asRequestBody<UpdateAccessCardBody>(body)
        );
        printRecord(card, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "color", label: "Color" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  accessCard
    .command("delete")
    .description("Delete an access card")
    .argument("<id>", "Access Card ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus access-card delete xyz-456

Notes:
  Master access cards cannot be deleted — that request is a 400.
  NO CONFIRMATION AND NO CHECK ON USE. A card an agent or workflow still names
  deletes without warning, and every call through it then fails 403
  ACCESS_CARD_NOT_FOUND at run time. Repoint the consumers first.
  "nexus credential delete" removes every card on the credential, master
  included, without going through this command.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.credentials.cards.delete(id);
        printSuccess("Access card deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── available-actions ─────────────────────────────────────────────────
  accessCard
    .command("available-actions")
    .description("List available actions for a credential")
    .requiredOption("--credential-id <id>", "Credential ID (required)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus access-card available-actions --credential-id abc-123
  $ nexus access-card available-actions --credential-id abc-123 --json

Notes:
  --credential-id IS REQUIRED, and this is the ONLY authoritative source of the
  action ids "access-card create/update" accept as policy keys.
  ACTION ID IS THE KEY, copied verbatim. A key that names no real action still
  saves — it simply matches nothing, so the card denies what you meant to allow
  and nothing reports the typo.
  Use --json to read each action's parameter names before writing a policy.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.credentials.cards.availableActions(opts.credentialId);
        const actions = result.actions ?? result;

        printList(actions, undefined, [
          { key: "actionId", label: "ACTION ID", width: 30 },
          { key: "name", label: "NAME", width: 30 },
          { key: "description", label: "DESCRIPTION", width: 40 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
