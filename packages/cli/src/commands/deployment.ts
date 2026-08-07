import type {
  CreateDeploymentBody,
  CreateDeploymentFolderBody,
  DeploymentCarouselTemplateGroup,
  DeploymentSingleItemCardTemplateGroup,
  DeploymentTemplateVariable,
  UpdateDeploymentBody,
  UpdateDeploymentFolderBody,
  UpdateDeploymentTemplateBody,
  UpdateEmbedConfigBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { color, printList, printRecord, printSuccess, printTable } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";

export function registerDeploymentCommands(program: Command): void {
  const deployment = program.command("deployment").description("Manage agent deployments");

  // ── list ──────────────────────────────────────────────────────────────
  addPaginationOptions(
    deployment
      .command("list")
      .description("List deployments")
      .option("--search <query>", "Search by name")
      .option("--type <type>", "Filter by deployment type")
      .option("--active", "Show only active deployments")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus deployment list
  $ nexus deployment list --type whatsapp --limit 10
  $ nexus deployment list --active --json`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.deployments.list({
        ...getPaginationParams(opts),
        search: opts.search,
        type: opts.type,
        isActive: opts.active ? true : undefined
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "name", label: "NAME", width: 25 },
        { key: "type", label: "TYPE", width: 15 },
        { key: "isActive", label: "ACTIVE", width: 8, format: (v) => (v ? "yes" : "no") },
        { key: "agentId", label: "AGENT ID", width: 36 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── get ───────────────────────────────────────────────────────────────
  deployment
    .command("get")
    .description("Get deployment details")
    .argument("<id>", "Deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment get dep-123
  $ nexus deployment get dep-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const dep = await client.deployments.get(id);
        printRecord(dep, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
          { key: "isActive", label: "Active", format: (v) => (v ? "yes" : "no") },
          { key: "agentId", label: "Agent ID" },
          { key: "description", label: "Description" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  deployment
    .command("create")
    .description("Create a new deployment")
    // --name and --type are part of the API contract (CreateDeploymentBody)
    // but they can also come from --body, so neither is a Commander-required
    // option — the API returns a clean validation error if either is missing.
    .option("--name <name>", "Deployment name")
    .option(
      "--type <type>",
      "Deployment type — one of EMBED, WHATSAPP, TELEGRAM, OUTLOOK, SLACK, TEAMS, SMS, TWILIO_SMS, TWILIO_VOICE, GMAIL, FB_MESSENGER, GOOGLE_SHEETS, EXCEL_ADDIN, OUTLOOK_ADDIN, POWERPOINT_ADDIN, WORD_ADDIN, AIRTABLE, GOOGLE_MEET, ZOOM, API, IMAP, SMTP (case-insensitive)"
    )
    .option("--agent-id <id>", "Agent ID to deploy")
    .option("--description <text>", "Deployment description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment create --name "Web Widget" --type EMBED --agent-id agt-123
  $ nexus deployment create --name "WhatsApp Bot" --type WHATSAPP --agent-id agt-456
  $ nexus deployment create --body '{"name":"Widget","type":"EMBED","agentId":"agt-123"}'`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        // DeploymentTypeSchema accepts only uppercase enum values; the CLI
        // historically advertised lowercase aliases in the help text that
        // the API never accepted. Normalise here so both styles work.
        const normalisedType = typeof opts.type === "string" ? opts.type.toUpperCase() : opts.type;
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(normalisedType !== undefined && { type: normalisedType }),
          ...(opts.agentId !== undefined && { agentId: opts.agentId }),
          ...(opts.description !== undefined && { description: opts.description })
        });

        const dep = await client.deployments.create(asRequestBody<CreateDeploymentBody>(body));
        printSuccess("Deployment created.", {
          id: dep.id,
          name: dep.name,
          type: dep.type
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  deployment
    .command("update")
    .description("Update a deployment")
    .argument("<id>", "Deployment ID")
    .option("--name <name>", "Deployment name")
    .option("--description <text>", "Description (use 'null' to clear)")
    .option("--agent-id <id>", "Agent ID (use 'null' to detach)")
    .option("--active <bool>", "Set active status (true/false)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment update dep-123 --name "Renamed Widget"
  $ nexus deployment update dep-123 --active false
  $ nexus deployment update dep-123 --agent-id agt-456
  $ nexus deployment update dep-123 --body '{"name":"Renamed"}'

Notes:
  Pass "null" as string to clear a field (e.g., --agent-id null to detach, --description null to clear).
  --active accepts "true" or "false" as strings.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.description !== undefined) {
          flags.description = opts.description === "null" ? null : opts.description;
        }
        if (opts.agentId !== undefined) {
          flags.agentId = opts.agentId === "null" ? null : opts.agentId;
        }
        if (opts.active !== undefined) {
          flags.isActive = opts.active === "true";
        }
        const body = mergeBodyWithFlags(base, flags);

        await client.deployments.update(id, asRequestBody<UpdateDeploymentBody>(body));
        printSuccess("Deployment updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  deployment
    .command("delete")
    .description("Delete a deployment")
    .argument("<id>", "Deployment ID")
    .option("--yes", "Skip confirmation")
    .option("--dry-run", "Preview without deleting")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment delete dep-123
  $ nexus deployment delete dep-123 --yes
  $ nexus deployment delete dep-123 --dry-run`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (opts.dryRun) {
          const dep = await client.deployments.get(id);
          console.log(color.yellow("DRY RUN:") + ` Would delete deployment "${dep.name}" (${id})`);
          return;
        }

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          const answer = await rl.question(
            `Delete deployment ${id}? This cannot be undone. [y/N] `
          );
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.deployments.delete(id);
        printSuccess("Deployment deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── stats ─────────────────────────────────────────────────────────────
  deployment
    .command("stats")
    .description("Get deployment statistics")
    .argument("<id>", "Deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment stats dep-123
  $ nexus deployment stats dep-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const stats = await client.deployments.getStatistics(id);
        printRecord(stats);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── duplicate ─────────────────────────────────────────────────────────
  deployment
    .command("duplicate")
    .description("Duplicate a deployment")
    .argument("<id>", "Deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment duplicate dep-123`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // `duplicate()` is typed `Promise<never>`, and that is correct rather
        // than a defect: the v1 contract declares no such route, so the call
        // cannot return a deployment to read fields off. The `as any` here used
        // to make two unreachable reads look like live code.
        await client.deployments.duplicate(id);
        printSuccess("Deployment duplicated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── embed-config ──────────────────────────────────────────────────────
  deployment
    .command("embed-config")
    .description("Get deployment embed configuration")
    .argument("<id>", "Deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment embed-config dep-123
  $ nexus deployment embed-config dep-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const config = await client.deployments.getEmbedConfig(id);
        printRecord(config);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── embed-config-update ───────────────────────────────────────────────
  deployment
    .command("embed-config-update")
    .description("Update deployment embed configuration")
    .argument("<id>", "Deployment ID")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment embed-config-update dep-123 --body '{"theme":"dark"}'
  $ nexus deployment embed-config-update dep-123 --body config.json`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // Every field of `UpdateEmbedConfigBody` is optional — this is a PATCH —
        // so `{}` is a usable value of the right type rather than an invented
        // one. The wire delta is an empty JSON object in place of no body.
        const body = (await resolveBody(opts.body)) ?? {};
        await client.deployments.updateEmbedConfig(id, asRequestBody<UpdateEmbedConfigBody>(body));
        printSuccess("Embed config updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── folder ────────────────────────────────────────────────────────────
  const depFolder = deployment.command("folder").description("Manage deployment folders");

  // ── folder list ─────────────────────────────────────────────────────
  depFolder
    .command("list")
    .description("List deployment folders")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment folder list
  $ nexus deployment folder list --json`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.deploymentFolders.list();
        const folders = result.folders ?? result;
        printTable(Array.isArray(folders) ? folders : [folders], [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── folder create ───────────────────────────────────────────────────
  depFolder
    .command("create")
    .description("Create a deployment folder")
    .requiredOption("--name <name>", "Folder name")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment folder create --name "Production"
  $ nexus deployment folder create --body '{"name":"Staging"}'`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name })
        });
        const folder = await client.deploymentFolders.create(
          asRequestBody<CreateDeploymentFolderBody>(body)
        );
        printSuccess("Deployment folder created.", {
          id: folder.id,
          name: folder.name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── folder update ───────────────────────────────────────────────────
  depFolder
    .command("update")
    .description("Update a deployment folder")
    .argument("<id>", "Folder ID")
    .option("--name <name>", "Folder name")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment folder update fld-123 --name "Renamed"
  $ nexus deployment folder update fld-123 --body '{"name":"Renamed"}'`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name })
        });
        await client.deploymentFolders.update(id, asRequestBody<UpdateDeploymentFolderBody>(body));
        printSuccess("Deployment folder updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── folder delete ───────────────────────────────────────────────────
  depFolder
    .command("delete")
    .description("Delete a deployment folder")
    .argument("<id>", "Folder ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment folder delete fld-123
  $ nexus deployment folder delete fld-123 --yes`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete deployment folder ${id}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.deploymentFolders.delete(id);
        printSuccess("Deployment folder deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── folder assign ───────────────────────────────────────────────────
  depFolder
    .command("assign")
    .description("Assign a deployment to a folder")
    .requiredOption("--deployment-id <id>", "Deployment ID")
    .requiredOption("--folder-id <id>", "Folder ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment folder assign --deployment-id dep-123 --folder-id fld-456`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.deploymentFolders.assign({
          deploymentId: opts.deploymentId,
          folderId: opts.folderId
        });
        printSuccess("Deployment assigned to folder.", {
          deploymentId: opts.deploymentId,
          folderId: opts.folderId
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── template (WhatsApp deployment templates) ───────────────────────
  const depTemplate = deployment
    .command("template")
    .description("Manage WhatsApp templates attached to a deployment");

  depTemplate
    .command("list")
    .description("List templates attached to a WhatsApp deployment")
    .argument("<deploymentId>", "Deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment template list dep-123
  $ nexus deployment template list dep-123 --json`
    )
    .action(async (deploymentId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.deployments.listDeploymentTemplates(deploymentId);
        const data = result;
        const items = Array.isArray(data) ? data : [data];
        const rows = items.map((t: any) => ({
          templateId: t.templateId,
          name: t.name,
          type: t.type ?? "template",
          variables: Object.keys(t.variables ?? {}).length,
          multiLang: t.enableMultiLanguage ? "yes" : "no"
        }));
        printTable(rows, [
          { key: "templateId", label: "TEMPLATE ID", width: 38 },
          { key: "name", label: "NAME", width: 20 },
          { key: "type", label: "TYPE", width: 10 },
          { key: "variables", label: "VARS", width: 6 },
          { key: "multiLang", label: "MULTI-LANG", width: 10 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  depTemplate
    .command("attach")
    .description("Attach a WhatsApp template to a deployment")
    .argument("<deploymentId>", "Deployment ID")
    .requiredOption("--template-id <id>", "Template ID (Twilio SID)")
    .requiredOption("--name <name>", "Display name for this template")
    .requiredOption("--description <text>", "Description of what this template does")
    .option(
      "--variables <json>",
      'Variables JSON: {"1":{"description":"Name","isBodyVariable":true}}'
    )
    .option("--type <type>", "Template type: template, card, or carousel", "template")
    .option("--enable-multi-language", "Enable multi-language support")
    .option("--enable-dynamic-size", "Enable dynamic carousel size (carousel only)")
    .option(
      "--carousel-template-group <json>",
      "Carousel template group JSON with size variants (carousel only)"
    )
    .option(
      "--single-item-card-template-id <id>",
      "Fallback card template ID for single-item carousels"
    )
    .option(
      "--single-item-card-template-group <json>",
      "Single-item card template group JSON for multi-language fallback"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment template attach dep-123 --template-id HX456 --name welcome --description "Welcome message"
  $ nexus deployment template attach dep-123 --template-id HX456 --name order --description "Order confirmation" --variables '{"1":{"description":"Customer name","isBodyVariable":true}}'
  $ nexus deployment template attach dep-123 --template-id HX456 --name products --description "Product carousel" --type carousel --enable-dynamic-size --carousel-template-group '{"baseName":"products","availableTemplates":[{"language":"en","carouselSize":3,"templateId":"HX111"},{"language":"en","carouselSize":5,"templateId":"HX222"}],"minCarouselSize":3,"maxCarouselSize":5}'`
    )
    .action(async (deploymentId: string, opts) => {
      try {
        // Each of these three flags is operator-supplied JSON crossing into a
        // typed SDK argument — the same boundary `asRequestBody` names, applied
        // to a nested field rather than to a whole body. Naming the SDK type on
        // the local is what makes the call site below check the field names.
        let variables: Record<string, DeploymentTemplateVariable> | undefined;
        if (opts.variables) {
          try {
            variables = asRequestBody<Record<string, DeploymentTemplateVariable>>(
              JSON.parse(opts.variables)
            );
          } catch {
            console.error("Error: --variables must be valid JSON.");
            process.exitCode = 1;
            return;
          }
        }

        let carouselTemplateGroup: DeploymentCarouselTemplateGroup | undefined;
        if (opts.carouselTemplateGroup) {
          try {
            carouselTemplateGroup = asRequestBody<DeploymentCarouselTemplateGroup>(
              JSON.parse(opts.carouselTemplateGroup)
            );
          } catch {
            console.error("Error: --carousel-template-group must be valid JSON.");
            process.exitCode = 1;
            return;
          }
        }

        let singleItemCardTemplateGroup: DeploymentSingleItemCardTemplateGroup | undefined;
        if (opts.singleItemCardTemplateGroup) {
          try {
            singleItemCardTemplateGroup = asRequestBody<DeploymentSingleItemCardTemplateGroup>(
              JSON.parse(opts.singleItemCardTemplateGroup)
            );
          } catch {
            console.error("Error: --single-item-card-template-group must be valid JSON.");
            process.exitCode = 1;
            return;
          }
        }

        const client = createClient(program.optsWithGlobals());
        const result = await client.deployments.attachDeploymentTemplate(deploymentId, {
          templateId: opts.templateId,
          name: opts.name,
          description: opts.description,
          variables,
          type: opts.type,
          enableMultiLanguage: opts.enableMultiLanguage,
          enableDynamicSize: opts.enableDynamicSize,
          carouselTemplateGroup,
          singleItemCardTemplateId: opts.singleItemCardTemplateId,
          singleItemCardTemplateGroup
        });
        const data = result;
        printRecord(data, [
          { key: "templateId", label: "Template ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "type", label: "Type" }
        ]);
        printSuccess("Template attached to deployment.");
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  depTemplate
    .command("update")
    .description("Update a template's configuration on a deployment")
    .argument("<deploymentId>", "Deployment ID")
    .argument("<templateId>", "Template ID (Twilio SID)")
    .option("--name <name>", "New display name")
    .option("--description <text>", "New description")
    .option("--variables <json>", "Updated variables JSON")
    .option("--enable-multi-language", "Enable multi-language support")
    .option("--no-multi-language", "Disable multi-language support")
    .option("--enable-dynamic-size", "Enable dynamic carousel size (carousel only)")
    .option("--no-dynamic-size", "Disable dynamic carousel size")
    .option(
      "--carousel-template-group <json>",
      "Carousel template group JSON with size variants (carousel only)"
    )
    .option(
      "--single-item-card-template-id <id>",
      "Fallback card template ID for single-item carousels"
    )
    .option(
      "--single-item-card-template-group <json>",
      "Single-item card template group JSON for multi-language fallback"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment template update dep-123 HX456 --name "Updated Welcome"
  $ nexus deployment template update dep-123 HX456 --variables '{"1":{"description":"Full name"}}'
  $ nexus deployment template update dep-123 HX456 --enable-dynamic-size --carousel-template-group '{"baseName":"products","availableTemplates":[...]}'`
    )
    .action(async (deploymentId: string, templateId: string, opts) => {
      try {
        const body: Record<string, unknown> = {};
        if (opts.name !== undefined) body.name = opts.name;
        if (opts.description !== undefined) body.description = opts.description;
        if (opts.enableMultiLanguage !== undefined)
          body.enableMultiLanguage = opts.enableMultiLanguage;
        if (opts.enableDynamicSize !== undefined) body.enableDynamicSize = opts.enableDynamicSize;
        if (opts.singleItemCardTemplateId !== undefined)
          body.singleItemCardTemplateId = opts.singleItemCardTemplateId;
        if (opts.variables) {
          try {
            body.variables = JSON.parse(opts.variables);
          } catch {
            console.error("Error: --variables must be valid JSON.");
            process.exitCode = 1;
            return;
          }
        }
        if (opts.carouselTemplateGroup) {
          try {
            body.carouselTemplateGroup = JSON.parse(opts.carouselTemplateGroup);
          } catch {
            console.error("Error: --carousel-template-group must be valid JSON.");
            process.exitCode = 1;
            return;
          }
        }
        if (opts.singleItemCardTemplateGroup) {
          try {
            body.singleItemCardTemplateGroup = JSON.parse(opts.singleItemCardTemplateGroup);
          } catch {
            console.error("Error: --single-item-card-template-group must be valid JSON.");
            process.exitCode = 1;
            return;
          }
        }

        const client = createClient(program.optsWithGlobals());
        const result = await client.deployments.updateDeploymentTemplate(
          deploymentId,
          templateId,
          asRequestBody<UpdateDeploymentTemplateBody>(body)
        );
        const data = result;
        printRecord(data, [
          { key: "templateId", label: "Template ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" }
        ]);
        printSuccess("Deployment template updated.");
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  depTemplate
    .command("detach")
    .description("Detach a template from a deployment")
    .argument("<deploymentId>", "Deployment ID")
    .argument("<templateId>", "Template ID (Twilio SID)")
    .option("--yes", "Skip confirmation prompt")
    .action(async (deploymentId: string, templateId: string, opts) => {
      try {
        if (!opts.yes && process.stdin.isTTY) {
          const readline = await import("node:readline");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          const answer = await new Promise<string>((resolve) => {
            rl.question(
              `Detach template ${templateId} from deployment ${deploymentId}? (y/N) `,
              resolve
            );
          });
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Cancelled.");
            return;
          }
        }
        const client = createClient(program.optsWithGlobals());
        await client.deployments.detachDeploymentTemplate(deploymentId, templateId);
        printSuccess("Template detached from deployment.", { templateId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  depTemplate
    .command("settings")
    .description("View or update deployment template settings")
    .argument("<deploymentId>", "Deployment ID")
    .option(
      "--allow-dynamic-templates <bool>",
      "Allow agent to dynamically create and send templates (true/false)"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment template settings dep-123
  $ nexus deployment template settings dep-123 --allow-dynamic-templates true`
    )
    .action(async (deploymentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (opts.allowDynamicTemplates !== undefined) {
          const value = opts.allowDynamicTemplates === "true";
          await client.deployments.updateDeploymentTemplateSettings(deploymentId, {
            allowAgentToCreateAndSendTemplates: value
          });
          printSuccess(
            `Dynamic template creation ${value ? "enabled" : "disabled"} for deployment.`
          );
        } else {
          // Show current settings by listing templates
          const result = await client.deployments.listDeploymentTemplates(deploymentId);
          const data = result;
          console.log(`Templates attached: ${Array.isArray(data) ? data.length : 0}`);
          console.log(
            `Tip: Use --allow-dynamic-templates true/false to toggle agent template creation.`
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
