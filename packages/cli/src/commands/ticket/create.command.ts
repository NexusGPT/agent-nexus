import type { CreateTicketBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import {
  TICKET_CREATE__BODY_PRIORITY,
  TICKET_CREATE__BODY_TYPE,
  TICKET_CREATE_CONTRACT
} from "../ticket.contract.generated";
import { formatLabels } from "./_shared/format-labels";
import { parseLabels } from "./_shared/parse-labels";

/*
 * The three reserved label names are written out by hand in the `create`
 * epilogue below, and a backend governance spec asserts they still match the
 * server's own constant. This package publishes standalone, so it cannot import
 * that constant to interpolate it: `wire-types-bundle.test.ts` refuses
 * `@nexus/types` from anything the binary reaches, because it drags Zod and the
 * generated Prisma enums into a bundle whose whole point is being small. A
 * checked copy is what is left, and the check lives on the side that owns the
 * fact.
 *
 * Keep the rationale here rather than in the epilogue: that string is projected
 * verbatim onto the public docs site, where a monorepo path means nothing.
 */

const CREATE_HELP = `
Examples:
  $ nexus ticket create --title "Login fails with SSO"
  $ nexus ticket create --title "Filed by an agent" --labels CUE
  $ nexus ticket create --title "Add dark mode" --type FEATURE_REQUEST --priority MEDIUM
  $ nexus ticket create --title "Bug report" --type BUG --description "Steps to reproduce..."
  $ nexus ticket create --data '{"title":"Bug","type":"BUG"}'
  $ nexus ticket create --title "500 on upload" --data '{"context":{"endpoint":"/documents","method":"POST","statusCode":500}}'

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

  --labels ADDS LINEAR LABELS, up to 20. A name matching no label this team or
  workspace can attach is refused, naming the allowed set — it is never
  created. "Bug", "Feature request", "Improvement" are reserved for --type,
  matched case-insensitively, and refused here too. Use CUE to mark an
  agent-filed ticket.

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
  shows you what was actually stored.`;

/** `nexus ticket create` */
export function registerTicketCreateCommand(ticket: Command, program: Command): Command {
  const leaf = ticket
    .command("create")
    .description("Create a new ticket")
    .requiredOption("--title <title>", "Ticket title")
    .addOption(enumOption("--type <type>", "Ticket type", TICKET_CREATE__BODY_TYPE))
    .addOption(enumOption("--priority <priority>", "Priority", TICKET_CREATE__BODY_PRIORITY))
    .option("--description <text>", "Ticket description")
    .option("--labels <list>", "Comma-separated Linear labels to attach (e.g. CUE)")
    .option("--data <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", CREATE_HELP)
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

  bindCommand(leaf, TICKET_CREATE_CONTRACT);
  return leaf;
}
