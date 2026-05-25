import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { resolveInputValue } from "../util/stdin";

export function registerCustomerCommands(program: Command): void {
  const customer = program.command("customer").description("Manage CRM customers");

  addPaginationOptions(
    customer
      .command("list")
      .description("List customers")
      .option("--search <query>", "Search by name, email, or phone")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus customer list
  $ nexus customer list --search "john@example.com" --json`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.customers.list({
        ...getPaginationParams(opts),
        search: opts.search
      });
      printList(
        data as unknown as Record<string, unknown>[],
        meta as unknown as Record<string, unknown>,
        [
          { key: "id", label: "ID", width: 36 },
          { key: "displayName", label: "NAME", width: 25 },
          { key: "primaryEmail", label: "EMAIL", width: 30 },
          { key: "primaryPhone", label: "PHONE", width: 15 }
        ]
      );
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  customer
    .command("get")
    .description("Get customer details")
    .argument("<id>", "Customer ID")
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const c = await client.customers.get(id);
        printRecord(c as unknown as Record<string, unknown>, [
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

  customer
    .command("get-by-external-id")
    .description("Find customer by external user ID")
    .argument("<external-user-id>", "External user ID")
    .action(async (externalUserId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const c = await client.customers.getByExternalId(externalUserId);
        if (!c) {
          console.log("No customer found.");
          return;
        }
        printRecord(c as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  customer
    .command("create")
    .description("Create a customer")
    .requiredOption("--display-name <name>", "Customer display name")
    .option("--external-user-id <id>", "External user ID")
    .option("--email <email>", "Primary email")
    .option("--phone <phone>", "Primary phone")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = { displayName: opts.displayName };
        if (opts.externalUserId) flags.externalUserId = opts.externalUserId;
        if (opts.email) flags.primaryEmail = opts.email;
        if (opts.phone) flags.primaryPhone = opts.phone;
        const body = mergeBodyWithFlags(base, flags);
        const c = await client.customers.create(body as any);
        printSuccess("Customer created.", {
          id: (c as any).id,
          displayName: (c as any).displayName
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  customer
    .command("update")
    .description("Update a customer")
    .argument("<id>", "Customer ID")
    .option("--display-name <name>", "Display name")
    .option("--email <email>", "Primary email")
    .option("--phone <phone>", "Primary phone")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.displayName) flags.displayName = opts.displayName;
        if (opts.email) flags.primaryEmail = opts.email;
        if (opts.phone) flags.primaryPhone = opts.phone;
        const body = mergeBodyWithFlags(base, flags);
        const c = await client.customers.update(id, body as any);
        printSuccess("Customer updated.", { id: (c as any).id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  customer
    .command("note")
    .description("Add a note to a customer")
    .argument("<id>", "Customer ID")
    .requiredOption("--content <text-or-->", "Note content (or '-' for stdin)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const content = opts.content ? await resolveInputValue(opts.content) : undefined;
        const body = mergeBodyWithFlags(base, content ? { content } : {});
        await client.customers.addNote(id, body as any);
        printSuccess("Note added.", { customerId: id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  customer
    .command("delete")
    .description("Delete a customer")
    .argument("<id>", "Customer ID")
    .option("--yes", "Skip confirmation")
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete customer ${id}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }
        await client.customers.delete(id);
        printSuccess("Customer deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
