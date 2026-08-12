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
import { absent, color, printList, printRecord, printSuccess, printTable } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { getPaginationParams } from "../util/pagination";

export function registerDeploymentCommands(program: Command): void {
  const deployment = program
    .command("deployment")
    .description("Manage agent deployments — an agent bound to one channel");

  deployment.addHelpText(
    "after",
    `
A deployment is one agent on one channel. What else must exist first is
decided by the TYPE, so run "nexus channel setup --type <TYPE>" before
creating one.

Two facts decide whether a create works at all:
  • SETTINGS ARE VALIDATED AGAINST THE TYPE. EMBED, TELEGRAM, TWILIO_VOICE,
    GOOGLE_SHEETS and OUTLOOK_ADDIN reject a create that carries no settings
    and 400 listing every missing field. Every other type is created from
    name, type and agent-id alone.
  • WHATSAPP, TWILIO_SMS and TWILIO_VOICE also need an ACTIVE phone number
    this organization owns, and WHATSAPP needs a sender registered on it.

Reads need deployments:read, writes deployments:write, delete needs
deployments:delete.`
  );

  // ── list ──────────────────────────────────────────────────────────────
  deployment
    .command("list")
    .description("List deployments")
    .option("--search <query>", "Search by name")
    .option("--type <type>", "Filter by deployment type")
    .option("--active", "Show only active deployments")
    // Declared here rather than through addPaginationOptions so the cap can be
    // stated: the server bounds limit at 1-100 and 400s outside it, which the
    // shared helper's "Items per page" cannot say without claiming the same
    // bound for every other namespace that calls it.
    .option("--page <number>", "Page number (default 1)", parseInt)
    .option("--limit <number>", "Items per page — 1-100, default 20", parseInt)
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment list
  $ nexus deployment list --type WHATSAPP --limit 10
  $ nexus deployment list --active --json

Notes:
  --limit above 100 is a 400, NOT a clamp. Page with meta.hasMore; meta.total
  counts the filtered set, so it moves when --search or --type does.
  --type takes the uppercase enum. --active selects isActive=true only —
  there is no flag for the inactive half, omit it and read the ACTIVE column.

  A KEY MINTED BY AN ORG MEMBER SEES ONLY THE DEPLOYMENTS THAT USER CREATED,
  and nothing says so: the list is simply shorter. Admin and org-level keys
  see all of them.`
    )
    .action(async (opts) => {
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
    .argument("<id>", "Deployment ID (UUID)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment get dep-123
  $ nexus deployment get dep-123 --json

Notes:
  The only command that returns settings — list omits it. Read it before any
  update, because that update merges ONE level deep (see update's notes).
  A 404 here is also what a member key gets for a deployment somebody else
  created; it does not distinguish "not yours" from "not there".
  connectionStatus tracks OAuth token health. For GMAIL and OUTLOOK it is
  inboundWebhook.status that decides whether mail actually arrives — anything
  but ACTIVE means the agent is receiving nothing.`
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
      "Deployment type — one of EMBED, WHATSAPP, TELEGRAM, OUTLOOK, SLACK, TEAMS, TWILIO_SMS, TWILIO_VOICE, GMAIL, FB_MESSENGER, GOOGLE_SHEETS, EXCEL_ADDIN, OUTLOOK_ADDIN, POWERPOINT_ADDIN, WORD_ADDIN, AIRTABLE, GOOGLE_MEET, ZOOM, API, IMAP, SMTP (case-insensitive)"
    )
    .option("--agent-id <id>", "Agent ID to deploy")
    .option("--description <text>", "Deployment description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment create --name "Web Widget" --type EMBED --agent-id agt-123 --body embed-settings.json
  $ nexus deployment create --name "Slack Bot" --type SLACK --agent-id agt-456
  $ nexus deployment create --name "WhatsApp Bot" --type WHATSAPP --agent-id agt-456 --body '{"whatsappSenderId":"XE..."}'

Notes:
  FIVE TYPES REJECT A CREATE THAT CARRIES NO SETTINGS: EMBED, TELEGRAM,
  TWILIO_VOICE, GOOGLE_SHEETS and OUTLOOK_ADDIN. The 400 lists every missing
  field — build --body from that error. EMBED alone needs five objects
  (embedSettings, securitySettings, leadsSettings, assistantSettings,
  advancedSettings), which is why the example above passes a file.

  WHATSAPP: pass --body '{"whatsappSenderId":"<id>"}' and phoneNumberId plus
  apiKeyConnectionId are resolved from it. A number another ACTIVE WhatsApp
  deployment already holds is a 409 and NOTHING is taken from it — there is
  no force here, deactivate the other deployment first.

  WHATSAPP, TWILIO_SMS and TWILIO_VOICE need a phone number that is ACTIVE and
  owned by this organization. A released number still resolves by id and is
  refused; WHATSAPP additionally 400s unless a sender is registered on it.

  SMS IS NOT A USABLE TYPE. The parser accepts it and no settings schema
  exists behind it, so the create fails as a server error rather than a
  validation message. TWILIO_SMS is the SMS channel.

  settings is capped at 50 top-level keys and 50KB serialized.
  Verify with "nexus deployment get <id>" — it is the only read carrying
  settings back.`
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
  --active accepts "true" or "false" as strings.

  THE SETTINGS MERGE IS ONE LEVEL DEEP. Top-level keys you send replace their
  whole value, so sending {"embedSettings":{"displayName":"x"}} keeps the
  other top-level objects and DISCARDS every other key inside embedSettings.
  Read "nexus deployment get <id>" first and send the branch back complete.

  phoneNumberId, oauthConnectionId and apiKeyConnectionId ARE ACCEPTED HERE
  AND SILENTLY DISCARDED. The body validates, the call returns 200, and the
  deployment still points at the old connection. Rebinding a number or a
  connection is not expressible through this command today.

  --active false stops the channel serving but does NOT free its WhatsApp
  number: the number is held by every non-deleted WHATSAPP deployment, active
  or not, so the next create still 409s until this one is deleted.
  Settings are NOT re-validated on update — an update can write a shape that
  create would have refused, and it fails at runtime instead.`
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
  $ nexus deployment delete dep-123 --dry-run

Notes:
  THE PROMPT ONLY APPEARS ON A TTY. Piped or in CI there is no prompt and no
  --yes is needed — the delete simply happens. Pass --dry-run first if the id
  came from anywhere but your own eyes.

  ITS CONNECTIONS ARE DISCONNECTED, NOT DELETED. The OAuth or API-key
  connection this deployment used is detached and survives for other
  deployments; the agent's prompt loses this channel's tab. A WhatsApp or SMS
  number is freed and stays purchased — release it separately if you are done
  with it, or it keeps billing.

  Whether the row survives is an organization-wide policy (SOFT keeps it with
  deletedAt set, HARD drops it and keeps a tombstone). Either way it stops
  being visible to every read here, and conversations and analytics survive.`
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
  $ nexus deployment stats dep-123 --json

Notes:
  totalSessions AND totalMessages ARE CAPPED AT THE NEWEST 500 SESSIONS. They
  are computed from the returned page, not queried, so a busier deployment
  reports exactly 500 sessions and stops growing. Nothing marks the cut.
  Emulator sessions are counted alongside real ones — a deployment you have
  only tested reports traffic. There is no date range and no filter here;
  use "nexus analytics" for anything time-bounded or cross-deployment.`
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
    .description("Duplicate a deployment — NOT SERVED, every call 404s")
    .argument("<id>", "Deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment duplicate dep-123

Notes:
  THIS COMMAND CANNOT SUCCEED. The Public API v1 serves no
  POST /deployments/:id/duplicate, so every invocation is a 404 whatever the
  id. "nexus agent duplicate" and "nexus workflow duplicate" do exist; the
  deployment equivalent does not.
  To copy one: read "nexus deployment get <id>", then create a new deployment
  with the same type and settings. A WhatsApp number cannot be copied — it is
  held by one deployment at a time.`
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
  $ nexus deployment embed-config dep-123 --json

Notes:
  ALL-NULL IS THE NORMAL ANSWER AND DOES NOT MEAN UNCONFIGURED. This reads
  eight flat keys (theme, primaryColor, position, initialMessage,
  suggestedMessages, logoUrl, avatarUrl, headerTitle) off the top of
  settings, while a widget built through the dashboard stores its appearance
  under settings.embedSettings.* instead. The two do not meet.
  To read what the widget actually renders, use "nexus deployment get <id>"
  and look at settings.embedSettings.
  Works on any deployment id, not just EMBED — it never checks the type.`
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
  $ nexus deployment embed-config-update dep-123 --body config.json

Notes:
  A 200 HERE DOES NOT MEAN THE WIDGET CHANGED. The eight keys this accepts
  are written flat at the top of settings; the widget reads its appearance
  from settings.embedSettings.*, which this never touches. The value comes
  back in the response and in "embed-config" because both sides read the same
  flat keys — that round-trip is not evidence the widget moved.
  Change the rendered widget through the dashboard, or by sending a complete
  settings.embedSettings object to "nexus deployment update".
  Only those eight keys are accepted; anything else in --body is dropped
  without an error. An empty --body is a valid no-op PATCH.`
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

  depFolder.addHelpText(
    "after",
    `
A folder is filing only — it grants nothing and changes no runtime behaviour.
A deployment belongs to at most ONE folder, so "folder assign" MOVES it.

These run on their own scopes — deployment_folders:read / :write / :delete —
which a key holding deployments:* does not imply.`
  );

  // ── folder list ─────────────────────────────────────────────────────
  depFolder
    .command("list")
    .description("List deployment folders")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment folder list
  $ nexus deployment folder list --json

Notes:
  PRINTS THE FOLDERS ONLY. The route also returns the deployment→folder
  assignments and this command drops them, in --json too, so there is no way
  to read which deployment sits in which folder from here. Fetch the route
  directly for that: "nexus api GET /deployment-folders".
  Unpaginated. Folders can nest (each carries a parentId) but this is a flat
  list — build the tree from parentId yourself.`
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
  $ nexus deployment folder create --body '{"name":"Staging"}'
  $ nexus deployment folder create --body '{"name":"EU","parentId":"fld-123"}'

Notes:
  Names are not unique — two "Production" folders can exist side by side and
  nothing warns. Check "folder list" first if you are scripting this.
  Nesting is only expressible through --body parentId; there is no flag.`
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
  $ nexus deployment folder update fld-123 --body '{"name":"Renamed"}'
  $ nexus deployment folder update fld-123 --body '{"parentId":null}'

Notes:
  Renaming and re-parenting only — the deployments filed here are untouched.
  --body '{"parentId":null}' lifts the folder back to the top level;
  a parentId string moves it under that folder. No flag covers either.
  A folder an org-member key cannot see is a 404, not a 403.`
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
  $ nexus deployment folder delete fld-123 --yes

Notes:
  UNFILES, DOES NOT DELETE. Every deployment in this folder survives and
  keeps serving; it simply belongs to no folder afterwards, and nothing
  reports which ones moved. Run "nexus api GET /deployment-folders" first if
  you need that list.
  Child folders are NOT deleted: they lose their parent and reappear at the
  top level, keeping the deployments filed in them.
  The prompt only appears on a TTY — piped or in CI it deletes without one.`
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
    .description("File a deployment in a folder — THIS MOVES IT out of its current one")
    .requiredOption("--deployment-id <id>", "Deployment ID")
    .requiredOption("--folder-id <id>", "Folder ID, or 'null' to unfile the deployment")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment folder assign --deployment-id dep-123 --folder-id fld-456
  $ nexus deployment folder assign --deployment-id dep-123 --folder-id null

Notes:
  THIS IS A MOVE, NOT AN ADD. A deployment belongs to exactly ONE folder, so
  this takes it out of whichever folder held it. Nothing in the response names
  the folder it left.
  --folder-id null unfiles it: the assignment row is deleted and the response
  reports assigned=false. Re-running the same assign is idempotent.
  Both ids must be visible to this key or it is a 404 — for a member key that
  includes a folder somebody else created.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // "null" is the token this CLI already uses for a wire null on
        // `deployment update`. The route's body types folderId as
        // `uuid | null` and treats null as an unassignment, but a required
        // string flag has no other way to say it — without this the only
        // documented way out of a folder is unreachable from the CLI.
        const folderId = opts.folderId === "null" ? null : opts.folderId;
        await client.deploymentFolders.assign({
          deploymentId: opts.deploymentId,
          folderId
        });
        printSuccess(folderId === null ? "Deployment unfiled." : "Deployment assigned to folder.", {
          deploymentId: opts.deploymentId,
          folderId: folderId ?? absent("(none)")
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── template (WhatsApp deployment templates) ───────────────────────
  const depTemplate = deployment
    .command("template")
    .description("Manage WhatsApp templates attached to a deployment");

  depTemplate.addHelpText(
    "after",
    `
WHATSAPP DEPLOYMENTS ONLY. All five commands here refuse anything else with
"Templates can only be managed on WhatsApp deployments" — including the reads,
so a 400 from "template list" means you named the wrong deployment.

These wire an EXISTING Twilio template to a deployment. Nothing here creates a
template or asks Meta for anything — build and submit it with
"nexus channel whatsapp-template create --submit", wait for approval, then
attach the SID here. An unapproved template attaches without complaint and
fails when the agent tries to send it.

Attaching is what makes a template reachable by the agent on this deployment.`
  );

  depTemplate
    .command("list")
    .description("List templates attached to a WhatsApp deployment")
    .argument("<deploymentId>", "Deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment template list dep-123
  $ nexus deployment template list dep-123 --json

Notes:
  Lists what is ATTACHED here, not what exists in Twilio — a template can be
  approved and absent from this list. "nexus channel whatsapp-template list"
  is the Twilio-side inventory.
  Says nothing about Meta approval. Read that from
  "nexus channel whatsapp-template approvals".`
    )
    .action(async (deploymentId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.deployments.listDeploymentTemplates(deploymentId);
        const data = result;
        const items = Array.isArray(data) ? data : [data];
        const rows = items.map((t) => ({
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
  $ nexus deployment template attach dep-123 --template-id HX456 --name products --description "Product carousel" --type carousel --enable-dynamic-size --carousel-template-group '{"baseName":"products","availableTemplates":[{"language":"en","carouselSize":3,"templateId":"HX111"},{"language":"en","carouselSize":5,"templateId":"HX222"}],"minCarouselSize":3,"maxCarouselSize":5}'

Notes:
  A DRAFT OR REJECTED TEMPLATE ATTACHES WITHOUT AN ERROR. Approval is not
  checked here; the failure arrives when the agent sends. Confirm with
  "nexus channel whatsapp-template approvals" first.
  --template-id is the Twilio content SID (HX...), not the friendly name.
  --description is REQUIRED and is not decoration — it is what the agent reads
  to decide when to use this template.
  Each --variables entry is keyed by the {{N}} position:
  '{"1":{"description":"Customer name","isBodyVariable":true}}'. The
  description tells the agent what to put there.
  The four carousel options (--enable-dynamic-size, --carousel-template-group,
  --single-item-card-template-id, --single-item-card-template-group) are a 400
  unless --type carousel. They are not ignored.
  Attaching a template id that is already attached is a 409 — use
  "deployment template update" to change one.`
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
  $ nexus deployment template update dep-123 HX456 --enable-dynamic-size --carousel-template-group '{"baseName":"products","availableTemplates":[...]}'

Notes:
  --variables REPLACES the whole map, it does not merge one key in. Read
  "deployment template list dep-123 --json" and send the complete map back.
  A template id that is not attached to this deployment is a 404, not a
  silent create.
  Sending nothing is accepted and changes nothing.`
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
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment template detach dep-123 HX456
  $ nexus deployment template detach dep-123 HX456 --yes

Notes:
  THE TEMPLATE ITSELF IS NOT DELETED. This unwires it from this deployment
  only; it stays in Twilio, stays approved, and stays attached to any other
  deployment using it. "nexus channel whatsapp-template delete" is the one
  that removes it for good.
  The agent stops being able to send it here immediately.
  Detaching a template that is not attached is a 404.
  The prompt only appears on a TTY — piped or in CI it detaches without one.`
    )
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
  $ nexus deployment template settings dep-123 --allow-dynamic-templates true

Notes:
  WITHOUT THE FLAG THIS DOES NOT SHOW THE SETTING. It prints how many
  templates are attached — the current value of
  allowAgentToCreateAndSendTemplates is only readable from
  "nexus deployment get <id>" under settings.
  --allow-dynamic-templates true lets the agent author and send templates that
  were never reviewed here. Anything but the exact string "true" is read as
  false, including a typo, so it fails closed.`
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
