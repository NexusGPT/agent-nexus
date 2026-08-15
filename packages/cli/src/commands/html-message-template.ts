import type {
  CreateHtmlMessageTemplateBody,
  UpdateHtmlMessageTemplateBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import {
  HTML_MESSAGE_TEMPLATE_CREATE_CONTRACT,
  HTML_MESSAGE_TEMPLATE_GET_CONTRACT,
  HTML_MESSAGE_TEMPLATE_LIST_CONTRACT
} from "./html-template.contract.generated";

export function registerHtmlMessageTemplateCommands(program: Command): void {
  const tpl = program
    .command("html-template")
    .description("Manage agent-filled HTML message templates for the embed deployment");

  tpl.addHelpText(
    "after",
    `
THIS IS THE RICH-CARD MECHANISM FOR THE WEB WIDGET AND NOTHING ELSE. A template
belongs to exactly ONE EMBED deployment, chosen at create and never changeable
afterwards — "update" cannot move it. WhatsApp's rich messages are a different
system entirely; see "nexus deployment template".

TWO FIELDS DO THE WORK, AND ONE OF THEM HAS NO FLAG:
  • htmlContent — Handlebars source. {{user.name}} is a placeholder.
  • inputSchema — which placeholders the AGENT is allowed to fill. It is
    --body only, on create and on update; there is no --input-schema.

    Shape: a map of parameter name to {"type": ..., "handler": ...}, where type
    is string|number|boolean|object|array|null and handler is
    manual|prompt|variable. Nest with "properties" (object) or "items" (array).
    A JSON-Schema document is NOT this shape and is rejected.

    ONLY handler "prompt" IS AGENT-FILLABLE. "html-template fill" computes its
    schema from the "prompt" entries alone, so a template whose entries are all
    "manual" gives the agent nothing to fill: fill SKIPS the model call
    entirely, renders with no data, and returns blank HTML at 200 with no cost
    and no warning.

THE WHOLE LOOP:
  $ nexus html-template create --deployment-id <embed-dep> --name "Order card" \\
      --body '{"htmlContent":"<div>Hi {{name}}</div>","inputSchema":{"name":{"type":"string","handler":"prompt"}}}'
  $ nexus html-template render <id> --data '{"name":"Ada"}'     # no model, no cost
  $ nexus html-template fill   <id> --context "the order is for Ada"   # agent fills, billed

Rendered HTML is sanitized against a strict allow-list on the way out, so a tag
or attribute you wrote can be missing from the result without an error.`
  );

  // ── list ────────────────────────────────────────────────────────────────
  const list = tpl
    .command("list")
    .description("List HTML message templates")
    .option("--search <query>", "Search by name")
    .option("--limit <number>", "Max results", parseInt)
    .option("--deployment-id <id>", "Filter by EMBED deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus html-template list
  $ nexus html-template list --deployment-id dep-123
  $ nexus html-template list --search "order" --limit 10 --json`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.htmlMessageTemplates.list({
          search: opts.search,
          limit: opts.limit,
          deploymentId: opts.deploymentId
        });
        printList(result.items, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "deploymentId", label: "DEPLOYMENT", width: 36 },
          { key: "description", label: "DESCRIPTION", width: 40 },
          { key: "createdAt", label: "CREATED", width: 26 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── get ─────────────────────────────────────────────────────────────────
  const get = tpl
    .command("get")
    .description("Get an HTML message template (includes Handlebars source)")
    .argument("<id>", "Template ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus html-template get tpl-123
  $ nexus html-template get tpl-123 --json

Notes:
  THE TABLE OMITS inputSchema — use --json for it. It is the only read that
  shows which placeholders the agent may fill, so check it before blaming
  "html-template fill" for a blank card.
  htmlContent is the raw Handlebars source, not rendered output. The placeholder
  paths in it are exactly the keys "html-template render --data" must supply.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const t = await client.htmlMessageTemplates.get(id);
        printRecord(t, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "deploymentId", label: "Deployment" },
          { key: "htmlContent", label: "HTML" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ──────────────────────────────────────────────────────────────
  const create = tpl
    .command("create")
    .description("Create an HTML message template")
    .option("--name <name>", "Template name")
    .option("--description <text>", "Template description")
    .option("--html <html>", "Handlebars HTML source")
    .option("--deployment-id <id>", "EMBED deployment the template belongs to")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus html-template create --deployment-id dep-123 --name "Order card" --html '<div>Hi {{user.name}}</div>'
  $ nexus html-template create --body ./template.json

Notes:
  --deployment-id AND --html ARE BOTH REQUIRED by the API even though neither is
  a required option here; omitting either is a 400 naming the field, never a
  template with a default.
  THE DEPLOYMENT MUST BE AN EMBED ONE, AND A DEPLOYMENT OF THE WRONG TYPE READS
  AS A MISSING DEPLOYMENT. A real, live deployment that is WhatsApp or Slack
  answers "EMBED deployment <id> not found" — the same words a made-up id gets,
  so a 404 here sends you to check the id when the id was fine. Confirm the type
  first with "nexus deployment get <id>".
  NAMES ARE UNIQUE PER DEPLOYMENT. A second template with the same name on the
  same deployment is a 409, not a duplicate. The name is also load-bearing at run
  time: it becomes the agent's "send_html_template_<name>" tool.
  --description IS PROMPT TEXT, NOT A LABEL. The agent reads it to decide WHEN to
  send the card, and "html-template fill" passes it to the model alongside the
  name and nothing else. A blank description leaves the agent guessing from the
  name alone.
  inputSchema has no flag — send it inside --body. The namespace help above
  carries its shape and the handler rule that decides whether "fill" does
  anything.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          description: opts.description,
          htmlContent: opts.html,
          deploymentId: opts.deploymentId
        });
        const t = await client.htmlMessageTemplates.create(
          asRequestBody<CreateHtmlMessageTemplateBody>(body)
        );
        printSuccess("HTML message template created.", {
          id: t.id,
          name: t.name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ──────────────────────────────────────────────────────────────
  tpl
    .command("update")
    .description("Update an HTML message template")
    .argument("<id>", "Template ID")
    .option("--name <name>", "Template name")
    .option("--description <text>", "Template description")
    .option("--html <html>", "Handlebars HTML source")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus html-template update tpl-123 --name "Order card v2"
  $ nexus html-template update tpl-123 --html '<div>Hi {{name}}, order {{orderId}}</div>'
  $ nexus html-template update tpl-123 --body '{"inputSchema":{"name":{"type":"string","handler":"prompt"}}}'

Notes:
  THIS IS A PATCH AND IT PRESERVES WHAT IT DOES NOT NAME. Renaming with --name
  alone leaves htmlContent and inputSchema exactly as they were. That is the
  opposite of "nexus deployment update", whose settings object replaces
  wholesale — do not carry that habit here.
  AN EXPLICIT null ON inputSchema CLEARS IT, and clearing it means the agent can
  fill nothing: "html-template fill" then renders blank without calling a model.
  Omit the field to leave it alone; that is the difference between omitted and
  null on this route.
  CHANGING THE HTML DOES NOT CHANGE THE SCHEMA. Add a placeholder and its
  inputSchema entry in the same call, or the new placeholder renders empty
  forever.
  THE DEPLOYMENT CANNOT BE CHANGED. There is no deploymentId here; a template on
  the wrong deployment has to be created again and the old one deleted.
  An empty body is refused — send at least one field.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.description !== undefined) flags.description = opts.description;
        if (opts.html !== undefined) flags.htmlContent = opts.html;
        const body = mergeBodyWithFlags(base, flags);
        await client.htmlMessageTemplates.update(
          id,
          asRequestBody<UpdateHtmlMessageTemplateBody>(body)
        );
        printSuccess("HTML message template updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ──────────────────────────────────────────────────────────────
  confirmable(tpl.command("delete"))
    .description("Delete an HTML message template")
    .argument("<id>", "Template ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus html-template delete tpl-123
  $ nexus html-template delete tpl-123 --yes

Notes:
  IT TAKES A TOOL AWAY FROM THE AGENT. The deployment's agent advertises one
  "send_html_template_<name>" tool per template, and deleting this one stops that
  tool being advertised immediately. Any prompt or instruction that names it now
  names a tool that does not exist, and nothing in this command's output says the
  agent's capabilities just changed.
  THIS ONE REALLY DELETES — unlike "nexus template", which has no delete at all,
  and unlike "nexus workflow delete", which archives. The htmlContent and the
  inputSchema go with it and there is no undo, so read them back with
  "html-template get <id> --json" first if the source matters.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  It frees the name on that deployment for reuse.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        if (!(await confirmDestructive(`Delete HTML message template ${id}?`, opts))) return;
        await client.htmlMessageTemplates.delete(id);
        printSuccess("HTML message template deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── render ──────────────────────────────────────────────────────────────
  tpl
    .command("render")
    .description("Render a template with provided data (returns sanitized HTML)")
    .argument("<id>", "Template ID")
    .option("--data <json>", "Data object as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus html-template render tpl-123 --data '{"user":{"name":"Ada"}}'

Notes:
  RENDER RUNS NO MODEL AND COSTS NOTHING. It substitutes the data you hand it,
  nothing more — "html-template fill" is the one that calls an agent and bills.
  A MISSING KEY RENDERS AS EMPTY, NOT AS AN ERROR. Omit --data entirely, or leave
  one placeholder out of it, and Handlebars resolves it to an empty string: the
  call answers 200 with '<div>Hi </div>' and nothing reports the gap. Diff the
  output against the template's placeholders rather than trusting the 200.
  The keys must match the placeholder PATHS in htmlContent — {{user.name}} needs
  {"user":{"name":"..."}}, not {"name":"..."}. Read the source with
  "nexus html-template get <id>".`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const data = opts.data ? await resolveBody(opts.data) : {};
        const result = await client.htmlMessageTemplates.render(id, { data });
        printRecord(result, [{ key: "html", label: "HTML" }]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── fill ────────────────────────────────────────────────────────────────
  tpl
    .command("fill")
    .description("Let the agent fill the template's input schema from context, then render")
    .argument("<id>", "Template ID")
    .requiredOption("--context <text>", "Natural-language context for the agent")
    .option("--model <model>", "Model override")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus html-template fill tpl-123 --context "Order #42 for Ada, 2 items shipped today"

Notes:
  THIS CALLS A MODEL AND IS BILLED. "html-template render" is the free path when
  you already hold the data.
  A TEMPLATE WITH NO handler "prompt" ENTRY IS NOT FILLED AND DOES NOT ERROR. The
  model call is skipped, the template renders with no data, and you get blank
  placeholders back at 200 for free. Check inputSchema with
  "nexus html-template get <id> --json" when the card comes back empty.
  --context is the ONLY thing the agent is told, beyond the template's name and
  description. It gets no conversation and no customer record, so put every
  value the card needs into that string.
  The returned "data" is what the model produced — read it to see which fields
  it actually filled, rather than inferring from the HTML.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.htmlMessageTemplates.fill(id, {
          context: opts.context,
          model: opts.model
        });
        printRecord({ html: result.html, data: JSON.stringify(result.data, null, 2) }, [
          { key: "html", label: "HTML" },
          { key: "data", label: "Data" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`. Only the three
  // subcommands that call a v1 route are bound: update, delete, render and fill
  // reach routes the contract does not declare.
  bindCommand(list, HTML_MESSAGE_TEMPLATE_LIST_CONTRACT);
  bindCommand(get, HTML_MESSAGE_TEMPLATE_GET_CONTRACT);
  bindCommand(create, HTML_MESSAGE_TEMPLATE_CREATE_CONTRACT);
}
