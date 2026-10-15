import { Command } from "commander";

import { registerHtmlMessageTemplateCreateCommand } from "./html-message-template/create.command";
import { registerHtmlMessageTemplateDeleteCommand } from "./html-message-template/delete.command";
import { registerHtmlMessageTemplateFillCommand } from "./html-message-template/fill.command";
import { registerHtmlMessageTemplateGetCommand } from "./html-message-template/get.command";
import { registerHtmlMessageTemplateListCommand } from "./html-message-template/list.command";
import { registerHtmlMessageTemplateRenderCommand } from "./html-message-template/render.command";
import { registerHtmlMessageTemplateUpdateCommand } from "./html-message-template/update.command";

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

  // REGISTRATION ORDER IS THE ORDER `--help` LISTS THEM, so it is part of the
  // published surface rather than a detail of this file.
  //
  // ONLY list, get AND create ARE CONTRACT-BOUND. update, delete, render and
  // fill reach routes the v1 contract does not declare, so each of those four
  // files calls no `bindCommand` and says why in its own header — the claim
  // lives here because it is a statement about the SET, not about one verb.
  registerHtmlMessageTemplateListCommand(tpl, program);
  registerHtmlMessageTemplateGetCommand(tpl, program);
  registerHtmlMessageTemplateCreateCommand(tpl, program);
  registerHtmlMessageTemplateUpdateCommand(tpl, program);
  registerHtmlMessageTemplateDeleteCommand(tpl, program);
  registerHtmlMessageTemplateRenderCommand(tpl, program);
  registerHtmlMessageTemplateFillCommand(tpl, program);
}
