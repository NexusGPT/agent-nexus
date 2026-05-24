import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";

export function registerAccessCardCommands(program: Command): void {
  const accessCard = program
    .command("access-card")
    .description("Manage access cards for credential-level action policies");

  // ── list ──────────────────────────────────────────────────────────────
  accessCard
    .command("list")
    .description("List access cards for a credential")
    .requiredOption("--credential-id <id>", "Credential ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus access-card list --credential-id abc-123
  $ nexus access-card list --credential-id abc-123 --json`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.credentials.cards.listByCredential(opts.credentialId);
        const cards = (result as any).accessCards ?? result;

        printList(cards as unknown as Record<string, unknown>[], undefined, [
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
  $ nexus access-card get xyz-456 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const card = await client.credentials.cards.get(id);
        printRecord(card as unknown as Record<string, unknown>, [
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
    .requiredOption("--credential-id <id>", "Credential ID")
    .requiredOption("--name <name>", "Card name")
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
      --data policies.json`
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

        const card = await client.credentials.cards.create(opts.credentialId, body as any);
        printRecord(card as unknown as Record<string, unknown>, [
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
  $ nexus access-card update xyz-456 --data '{"policies":{"gmail:send_email":{"parameters":{"to":{"enabled":false,"value":"support@company.com"}}}}}'`
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

        const card = await client.credentials.cards.update(id, body as any);
        printRecord(card as unknown as Record<string, unknown>, [
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
  Master access cards cannot be deleted.`
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
    .requiredOption("--credential-id <id>", "Credential ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus access-card available-actions --credential-id abc-123
  $ nexus access-card available-actions --credential-id abc-123 --json`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.credentials.cards.availableActions(opts.credentialId);
        const actions = (result as any).actions ?? result;

        printList(actions as unknown as Record<string, unknown>[], undefined, [
          { key: "actionId", label: "ACTION ID", width: 30 },
          { key: "name", label: "NAME", width: 30 },
          { key: "description", label: "DESCRIPTION", width: 40 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
