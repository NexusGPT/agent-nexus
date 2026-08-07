import fs from "node:fs";
import path from "node:path";

import type { CreateTicketBody, UpdateTicketBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { resolveInputValue } from "../util/stdin";

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

export function registerTicketCommands(program: Command): void {
  const ticket = program
    .command("ticket")
    .description("Manage tickets (bugs, feature requests, improvements)");

  // ── list ──────────────────────────────────────────────────────────────
  addPaginationOptions(
    ticket
      .command("list")
      .description("List tickets")
      .option("--type <type>", "Filter by type (BUG, FEATURE_REQUEST, IMPROVEMENT)")
      .option("--priority <priority>", "Filter by priority (NONE, URGENT, HIGH, MEDIUM, LOW)")
      .option("--status <status>", "Filter by status")
      .option("--search <query>", "Search by title or description")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus ticket list
  $ nexus ticket list --type BUG --priority HIGH
  $ nexus ticket list --search "login" --json`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.tickets.list({
        ...getPaginationParams(opts),
        type: opts.type,
        priority: opts.priority,
        status: opts.status,
        search: opts.search
      });

      printList(data, meta, [
        { key: "identifier", label: "IDENTIFIER", width: 12 },
        { key: "title", label: "TITLE", width: 40 },
        { key: "type", label: "TYPE", width: 18 },
        { key: "priority", label: "PRIORITY", width: 10 },
        { key: "status", label: "STATUS", width: 15 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── get ───────────────────────────────────────────────────────────────
  ticket
    .command("get")
    .description("Get ticket details")
    .argument("<id>", "Ticket ID or identifier")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket get TKT-42
  $ nexus ticket get TKT-42 --json`
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
  ticket
    .command("create")
    .description("Create a new ticket")
    .requiredOption("--title <title>", "Ticket title")
    .option("--type <type>", "Ticket type (BUG, FEATURE_REQUEST, IMPROVEMENT)")
    .option("--priority <priority>", "Priority (NONE, URGENT, HIGH, MEDIUM, LOW)")
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

Notes:
  Uses --data (not --body) for JSON input — this differs from other commands.
  "ticket comment" uses --body for comment text (not JSON).`
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
  ticket
    .command("update")
    .description("Update a ticket")
    .argument("<id>", "Ticket ID or identifier")
    .option("--title <title>", "Updated title")
    .option("--type <type>", "Updated type (BUG, FEATURE_REQUEST, IMPROVEMENT)")
    .option("--priority <priority>", "Updated priority (NONE, URGENT, HIGH, MEDIUM, LOW)")
    .option("--description <text>", "Updated description")
    .option(
      "--status <status>",
      "Transition status (Triage, Backlog, Todo, In Progress, In Review, Done, Canceled)"
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
  $ nexus ticket update TKT-42 --priority URGENT
  $ nexus ticket update TKT-42 --labels "CUE,needs-triage"
  $ nexus ticket update TKT-42 --labels ""
  $ nexus ticket update TKT-42 --title "Updated title" --type BUG
  $ nexus ticket update TKT-42 --status "In Progress"
  $ nexus ticket update TKT-42 --status Canceled
  $ nexus ticket update TKT-42 --data '{"priority":"URGENT"}'`
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
    .argument("<id>", "Ticket ID or identifier")
    .option("--as <status>", "Status to close as (e.g. Canceled, Done)", "Canceled")
    .option("--comment <text-or-->", "Optional comment to add before closing ('-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket close TKT-42
  $ nexus ticket close TKT-42 --as Done
  $ nexus ticket close TKT-42 --as Canceled --comment "Duplicate of TKT-41"`
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
    .argument("<id>", "Ticket ID or identifier")
    .requiredOption("--body <text-or-->", "Comment body (text or '-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket comment TKT-42 --body "This is fixed in v2.1"
  $ echo "Detailed comment" | nexus ticket comment TKT-42 --body -`
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
    .argument("<id>", "Ticket ID or identifier")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket comments TKT-42
  $ nexus ticket comments TKT-42 --json`
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
    .argument("<id>", "Ticket ID or identifier")
    .requiredOption("--file <path>", "Path to the file to upload")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket attach TKT-42 --file ./screenshot.png
  $ nexus ticket attach TKT-42 --file ~/Downloads/error-log.txt`
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
    .argument("<id>", "Ticket ID or identifier")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket attachments TKT-42
  $ nexus ticket attachments TKT-42 --json`
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
}
