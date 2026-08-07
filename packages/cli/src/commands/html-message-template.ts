import type {
  CreateHtmlMessageTemplateBody,
  UpdateHtmlMessageTemplateBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";

export function registerHtmlMessageTemplateCommands(program: Command): void {
  const tpl = program
    .command("html-template")
    .description("Manage agent-filled HTML message templates for the embed deployment");

  // ── list ────────────────────────────────────────────────────────────────
  tpl
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
  tpl
    .command("get")
    .description("Get an HTML message template (includes Handlebars source)")
    .argument("<id>", "Template ID")
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
  tpl
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
  $ nexus html-template create --body ./template.json`
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
  tpl
    .command("delete")
    .description("Delete an HTML message template")
    .argument("<id>", "Template ID")
    .option("--yes", "Skip confirmation")
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete HTML message template ${id}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }
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
  $ nexus html-template render tpl-123 --data '{"user":{"name":"Ada"}}'`
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
  $ nexus html-template fill tpl-123 --context "Order #42 for Ada, 2 items shipped today"`
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
}
