import type {
  CreateDeploymentBody,
  CreateDeploymentFolderBody,
  DeploymentCarouselTemplateGroup,
  DeploymentSingleItemCardTemplateGroup,
  DeploymentTemplateGroup,
  DeploymentTemplateVariable,
  UpdateDeploymentBody,
  UpdateDeploymentFolderBody,
  UpdateDeploymentTemplateBody,
  UpdateEmbedConfigBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { dashboardUrlFor } from "../dashboard-url";
import { handleError, refuse } from "../errors";
import {
  absent,
  isJsonMode,
  printDryRun,
  printEnvelope,
  printList,
  printRecord,
  printSuccess,
  printTable
} from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { booleanFlag } from "../util/boolean-flag";
import { confirmable, confirmDestructive } from "../util/confirm";
import { withMemberCounts } from "../util/folder-membership";
import { getPaginationParams } from "../util/pagination";
import {
  DEPLOYMENT_CREATE__BODY_TYPE,
  DEPLOYMENT_CREATE_CONTRACT,
  DEPLOYMENT_LIST__PARAMS_TYPE,
  DEPLOYMENT_LIST_CONTRACT,
  DEPLOYMENT_UPDATE_CONTRACT,
  DEPLOYMENT_UPDATE_EMBED_CONFIG_CONTRACT,
  DEPLOYMENT_WHATSAPP_TEMPLATE_ATTACH__BODY_TYPE,
  DEPLOYMENT_WHATSAPP_TEMPLATE_ATTACH_CONTRACT
} from "./deployment.contract.generated";

/**
 * `--type` accepts lowercase; the contract does not. That is the only remaining
 * divergence on this flag, and it is a WIDENING.
 *
 * ── What used to be here, and why it is worth one paragraph ─────────────────
 *
 * A declared NARROWING sat here, omitting `SMS`: the contract listed it, no
 * settings schema existed behind it, and the create failed as a 500 rather than
 * a validation message. The CLI omitted it on purpose and spent three lines of
 * `--help` saying so.
 *
 * It is gone because the CONTRACT was fixed rather than routed around.
 * `DeploymentTypeSchema` now derives from the Prisma enum, so `SMS` is not a
 * value anywhere and `INSTAGRAM` — which had a receiver, a sender, a validator
 * and a settings schema, and was invisible to every API consumer — is one. That
 * is the outcome a CLI-side omission could never have reached: the SDK and the
 * MCP catalog read the same schema and were being told the same false thing.
 *
 * The generator is what made the change impossible to miss. It refused to write
 * this namespace the moment the two lists stopped agreeing, printed both, and
 * named `INSTAGRAM` as present upstream and undeclared here. It picked no
 * winner, which was correct — on the previous run the contract was the wrong
 * list, and on this one the CLI was.
 */
const CASE_INSENSITIVE = {
  because: "Values are case-insensitive"
} as const;

/** `--type embed` has always worked; the action upper-cases before sending. */
const upperCase = (value: string): string => value.toUpperCase();

/**
 * A SETTING TURNED ON BY `--enable-<x>` AND OFF BY `--no-<x>` LANDS ON TWO
 * SEPARATE COMMANDER KEYS, AND READING ONLY ONE OF THEM IS SILENT.
 *
 * Commander derives an option key from that option's OWN long name. So
 * `--enable-multi-language` writes `opts.enableMultiLanguage` and
 * `--no-multi-language` writes `opts.multiLanguage` — two flags for one
 * setting, on two keys that never meet. `deployment template update` read only
 * the first, so both negative flags parsed, were accepted, contributed NOTHING
 * to the request body, and the command still printed `Deployment template
 * updated.` over an unchanged setting.
 *
 * ── Why `=== false` and never a bare forward ─────────────────────────────────
 *
 * A `--no-x` flag declared with no positive twin ON ITS OWN KEY carries
 * commander's implicit default `true`. Forwarding `opts.multiLanguage` as-is
 * would therefore write `enableMultiLanguage: true` into every body that never
 * named the flag, turning the setting ON for an operator who only meant to
 * rename a template. That is the same defect one layer up, and it would pass a
 * test that only checked the negative case.
 *
 * ── Why both flags together is a REFUSAL, not a precedence rule ──────────────
 *
 * Two keys means commander records no ordering between them, so there is no
 * last-one-wins to read and any winner this file picked would be a guess about
 * what the operator meant. `util/boolean-flag.ts` is the house precedent: a
 * boolean surface here refuses what it cannot understand rather than coercing.
 */
type EnableDisablePair =
  | { readonly contradiction: true }
  | { readonly contradiction: false; readonly value: boolean | undefined };

function readEnableDisablePair(enabled: unknown, notDisabled: unknown): EnableDisablePair {
  const turnedOn = enabled === true;
  const turnedOff = notDisabled === false;

  if (turnedOn && turnedOff) return { contradiction: true };
  if (turnedOn) return { contradiction: false, value: true };
  if (turnedOff) return { contradiction: false, value: false };
  return { contradiction: false, value: undefined };
}

/** The hint both contradiction refusals share, so they cannot drift apart. */
const CONTRADICTORY_TOGGLE_HINT =
  "Send one of the two. They land on separate commander keys, so there is no " +
  "last-one-wins order to read and this command will not guess which you meant.";

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
  const list = deployment
    .command("list")
    .description("List deployments")
    .option("--search <query>", "Search by name")
    .addOption(
      enumOption(
        "--type <type>",
        "Filter by deployment type",
        DEPLOYMENT_LIST__PARAMS_TYPE,
        CASE_INSENSITIVE,
        upperCase
      )
    )
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
  $ nexus deployment get 11111111-1111-4111-8111-111111111111
  $ nexus deployment get 11111111-1111-4111-8111-111111111111 --json

Notes:
  The only command that returns settings — list omits it. Read it before any
  update, because that update merges ONE level deep (see update's notes).
  A 404 here is also what a member key gets for a deployment somebody else
  created; it does not distinguish "not yours" from "not there".
  connectionStatus tracks OAuth token health. For GMAIL and OUTLOOK it is
  inboundWebhook.status that decides whether mail actually arrives — anything
  but ACTIVE means the agent is receiving nothing.

  null ON EITHER FIELD IS "THIS CHANNEL BINDS NONE", NEVER A FAULT.
  connectionStatus reads the OAuth connection and falls back to the API-key
  connection, so it is null exactly when the deployment holds neither — EMBED,
  API, TELEGRAM and the Office add-ins all report null and work.
  inboundWebhook is null on every type except GMAIL and OUTLOOK, the only two
  with a push subscription; NOT_CONFIGURED is the different fact that one of
  those two has a connection and no watch on it.
  dashboardUrl IS ADDED BY THIS CLI AND IS NOT AN API FIELD. It is this
  deployment's page, so nothing has to assemble a URL from a path pattern that
  can be renamed underneath it.`
    )
    .action(async (id: string) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const dep = await client.deployments.get(id);
        printRecord({ ...dep, dashboardUrl: dashboardUrlFor("deployment", dep.id, globals) }, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
          { key: "isActive", label: "Active", format: (v) => (v ? "yes" : "no") },
          { key: "agentId", label: "Agent ID" },
          { key: "description", label: "Description" },
          { key: "createdAt", label: "Created" },
          { key: "dashboardUrl", label: "Dashboard" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  const create = deployment
    .command("create")
    .description("Create a new deployment")
    // --name and --type are part of the API contract (CreateDeploymentBody)
    // but they can also come from --body, so neither is a Commander-required
    // option — the API returns a clean validation error if either is missing.
    .option("--name <name>", "Deployment name")
    // The 21 values were retyped here as one long sentence. They now come from
    // the contract minus the declared omission, so this list cannot drift from
    // the schema and cannot re-acquire `SMS` without the gate saying so.
    .addOption(
      enumOption(
        "--type <type>",
        "Deployment type",
        DEPLOYMENT_CREATE__BODY_TYPE,
        CASE_INSENSITIVE,
        upperCase
      )
    )
    .option("--agent-id <id>", "Agent ID to deploy")
    .option("--description <text>", "Deployment description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment create --name "Web Widget" --type EMBED --agent-id 33333333-3333-4333-8333-333333333333 --body embed-settings.json
  $ nexus deployment create --name "Slack Bot" --type SLACK --agent-id 44444444-4444-4444-8444-444444444444
  $ nexus deployment create --name "WhatsApp Bot" --type WHATSAPP --agent-id 44444444-4444-4444-8444-444444444444 --body '{"whatsappSenderId":"XE..."}'

Notes:
  FIVE TYPES REJECT A CREATE THAT CARRIES NO SETTINGS: EMBED, TELEGRAM,
  TWILIO_VOICE, GOOGLE_SHEETS and OUTLOOK_ADDIN. The 400 lists every missing
  field — build --body from that error. EMBED alone needs five objects
  (embedSettings, securitySettings, leadsSettings, assistantSettings,
  advancedSettings), which is why the example above passes a file.

  THOSE FIVE OBJECTS NEST UNDER A TOP-LEVEL "settings" KEY. The contract
  declares exactly one place for them, and a Zod object strips what it does
  not declare — so --body '{"embedSettings":{...},"securitySettings":{...}}'
  parses clean, loses every one of those keys, and reaches the route as a
  create with no settings at all. It then answers the same 400 an empty body
  gets. A correct body missing one level therefore reads as an empty body.
  The shape is '{"settings":{"embedSettings":{...},"securitySettings":{...},
  "leadsSettings":{...},"assistantSettings":{},"advancedSettings":{}}}'.
  "--print-contract" renders it as
  'Body.settings [optional, opaque; shape not described by the contract]' —
  that is the contract declining to describe the inside, not a gap here.

  THE ENUM-VALUED LEAVES INSIDE settings ARE PRINTABLE, JUST NOT FROM HERE.
  Because settings is opaque on this route, "--print-contract" stops at the
  wrapper. The embedSettings half is fully described by the sibling verb:
  "nexus deployment embed-config-update --print-contract" renders format
  bubble|classic, bubblePosition bottom-right|bottom-left|top-right|top-left,
  bubbleBorderRadius none|sm|md|lg|full, bubbleSize small|medium|large,
  uiAppearance system|light|dark, uiRadius sm|md|lg and uiContainerRadius
  sm|md|lg|none. securitySettings is the one that bites and no command prints
  it: visibility is REQUIRED and is exactly public|private. assistantSettings
  and advancedSettings default every field, so {} is a valid value for both,
  and leadsSettings is optional throughout.

  WHATSAPP: pass --body '{"whatsappSenderId":"<id>"}' and phoneNumberId plus
  apiKeyConnectionId are resolved from it. A number another ACTIVE WhatsApp
  deployment already holds is a 409 and NOTHING is taken from it — there is
  no force here, deactivate the other deployment first.

  WHATSAPP, TWILIO_SMS and TWILIO_VOICE need a phone number that is ACTIVE and
  owned by this organization. A released number still resolves by id and is
  refused; WHATSAPP additionally 400s unless a sender is registered on it.

  TWILIO_SMS IS THE SMS CHANNEL. A bare "SMS" is now refused before the request
  leaves. It was a contract value that could not work in two independent ways:
  no settings schema stood behind it, so the lookup was undefined and the call
  threw rather than answering a validation error, and it was not a database
  enum value either, so no row could have held it. It is gone from the contract.

  settings is capped at 50 top-level keys and 50KB serialized.
  Verify with "nexus deployment get <id>" — it is the only read carrying
  settings back.
  dashboardUrl in the payload is the new deployment's page, added by this CLI
  rather than returned by the API — open it, or hand it to whoever asked.`
    )
    .action(async (opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
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
          type: dep.type,
          dashboardUrl: dashboardUrlFor("deployment", dep.id, globals)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  const update = deployment
    .command("update")
    .description("Update a deployment")
    .argument("<id>", "Deployment ID")
    .option("--name <name>", "Deployment name")
    .option("--description <text>", "Description (use 'null' to clear)")
    .option("--agent-id <id>", "Agent ID (use 'null' to detach)")
    .option("--active <bool>", "Set active status — true or false", booleanFlag)
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment update 11111111-1111-4111-8111-111111111111 --name "Renamed Widget"
  $ nexus deployment update 11111111-1111-4111-8111-111111111111 --active false
  $ nexus deployment update 11111111-1111-4111-8111-111111111111 --agent-id 44444444-4444-4444-8444-444444444444
  $ nexus deployment update 11111111-1111-4111-8111-111111111111 --body '{"name":"Renamed"}'

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
  create would have refused, and it fails at runtime instead.

  THE 50-KEY / 50KB CAP APPLIES HERE TOO, AND IT MEASURES YOUR PATCH, NOT THE
  RESULT. Both bodies validate settings through the same bounded schema, so
  this refuses a 51-key object exactly as create does — but it counts the keys
  you SENT, and the merge above then writes them over what is already stored.
  Thirty keys patched onto forty stored keys is seventy keys in the column and
  a 200, because nothing re-measures the merged object. The cap itself is
  documented under "nexus deployment create --help".`
    )
    .action(async (id: string, opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
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
          flags.isActive = opts.active;
        }
        const body = mergeBodyWithFlags(base, flags);

        await client.deployments.update(id, asRequestBody<UpdateDeploymentBody>(body));
        printSuccess("Deployment updated.", {
          id,
          dashboardUrl: dashboardUrlFor("deployment", id, globals)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  confirmable(deployment.command("delete"))
    .description("Delete a deployment")
    .argument("<id>", "Deployment ID")
    .option("--dry-run", "Preview without deleting")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment delete 11111111-1111-4111-8111-111111111111
  $ nexus deployment delete 11111111-1111-4111-8111-111111111111 --yes
  $ nexus deployment delete 11111111-1111-4111-8111-111111111111 --dry-run

Notes:
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  Pass --dry-run first if the id came from anywhere but your own eyes.

  --dry-run IGNORES --json AND PRINTS PROSE. The line is
  'DRY RUN: Would delete deployment "<name>" (<id>)' on stdout, on every
  invocation, so a script piping this into jq gets a parse error rather than a
  document. The habit does not transfer from elsewhere in this CLI:
  "agent-skill sync --dry-run" and "claude-code ... --dry-run" both branch on
  --json and emit a real document. A dry run also READS the deployment first,
  so it needs deployments:read as well, and a 404 on that read is what it
  reports.

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
          printDryRun(`Would delete deployment "${dep.name}" (${id})`, { id });
          return;
        }

        if (!(await confirmDestructive(`Delete deployment ${id}? This cannot be undone.`, opts)))
          return;

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
  $ nexus deployment stats 11111111-1111-4111-8111-111111111111
  $ nexus deployment stats 11111111-1111-4111-8111-111111111111 --json

Notes:
  totalSessions AND totalMessages ARE CAPPED AT THE NEWEST 500 SESSIONS. They
  are computed from the returned page, not queried, so a busier deployment
  reports exactly 500 sessions and stops growing. Nothing marks the cut.
  EMULATOR SESSIONS ARE NOT COUNTED, in either term. Testing a deployment
  through "nexus emulator" leaves these figures untouched — they are what real
  customers did. Use "nexus emulator session list" to see test traffic. There is
  no date range and no filter here; use "nexus analytics" for anything
  time-bounded or cross-deployment.

  THE RESPONSE CARRIES A THIRD KEY THE TWO COUNTERS ARE COMPUTED FROM:
  sessions, an array of {id, chatId, messageCount, updatedAt, createdAt},
  newest first. totalSessions is that array's LENGTH and totalMessages is the
  sum of its messageCount fields, so the 500 cut above is checkable rather
  than taken on trust — count the array. chatId is the "nexus conversation"
  id for that session, or null where the session produced no chat.`
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
  $ nexus deployment duplicate 11111111-1111-4111-8111-111111111111

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
  $ nexus deployment embed-config 11111111-1111-4111-8111-111111111111
  $ nexus deployment embed-config 11111111-1111-4111-8111-111111111111 --json
  $ nexus deployment embed-config 11111111-1111-4111-8111-111111111111 --json > widget.json

Notes:
  THIS IS WHAT THE WIDGET ACTUALLY RENDERS. It reads settings.embedSettings —
  the same group the dashboard writes and the same one the widget loads — and
  returns all 61 published keys: the ui* palette, the bubble* placement, the
  header, footer and landing-screen groups, the localized* variants beside
  every translatable string, and suggestedMessages.

  EMBED DEPLOYMENTS ONLY. Any other type is a 400 with code
  NOT_AN_EMBED_DEPLOYMENT, naming the type it found. Other channels keep their
  settings elsewhere — read those with "nexus deployment get <id>".

  ONE KEY OF THE 62 IS NEVER RETURNED: identityVerificationSecret. It is the
  server-side HMAC key that signs a visitor's externalUserId, so anyone holding
  it can forge a visitor identity — publishing it would hand that to every
  deployments:read caller. The contract omits it; nothing here filters it, so
  it cannot be re-exposed by accident. identityVerificationEnabled IS returned,
  because whether verification is on is not a secret. The secret survives an
  update untouched (see "embed-config-update").

  THE OUTPUT IS A VALID UPDATE BODY. The update accepts exactly these 61 keys,
  every one optional, so a read can be edited and PATCHed straight back.`
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
  const embedConfigUpdate = deployment
    .command("embed-config-update")
    .description("Update deployment embed configuration")
    .argument("<id>", "Deployment ID")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment embed-config-update 11111111-1111-4111-8111-111111111111 --body '{"uiAppearance":"dark"}'
  $ nexus deployment embed-config-update 11111111-1111-4111-8111-111111111111 --body '{"uiPrimaryColor":"#0055ff","bubblePosition":"bottom-left"}'
  $ nexus deployment embed-config-update 11111111-1111-4111-8111-111111111111 --body widget.json

Notes:
  A 200 MEANS THE WIDGET CHANGED. The patch lands inside settings.embedSettings,
  which is the group the widget loads, and the response is a fresh read of what
  was stored.

  🚨 AN UNDECLARED KEY IS DROPPED SILENTLY, NOT REFUSED. The write parses
  against a non-strict schema, so a misspelling — "primaryColor" for
  "uiPrimaryColor", "theme" for "uiAppearance" — is stripped before the column
  and answers 200 with the old value still in place. Nothing reports it. THE
  CHECK IS THE RESPONSE: the key you sent is in it with the value you sent, or
  the write did not happen. Run "embed-config" first for the exact spellings.

  PATCH SEMANTICS, AND THEY ARE REAL. Only the keys you name change; the rest
  of the group is re-read from storage and written back. That is also what
  preserves identityVerificationSecret, which this API never returns and
  therefore can never send back — a full-object PUT would erase it. An empty
  --body is a valid no-op.

  EMBED DEPLOYMENTS ONLY — a 400 with code NOT_AN_EMBED_DEPLOYMENT otherwise,
  on this verb and on the read alike.`
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
  --json CARRIES assignments[] — the deployment-to-folder map, and the only
  report of it anywhere in this CLI. Folder rows hold no membership, so which
  folder a deployment sits in is answered by matching deploymentId in
  assignments[] and by nothing else.
  DEPLOYMENTS counts the assignments pointing at each folder. The pairs
  themselves are read under --json.
  Unpaginated. Folders can nest (each carries a parentId) but this is a flat
  list — build the tree from parentId yourself.

  --json HERE IS THE ROUTE'S OWN OBJECT, not {data,meta} and not a bare array.
  "deployment list" is the {data,meta} shape, so a jq '.data[]' carried over
  from it selects nothing AND DOES NOT ERROR — it just prints an empty result,
  which reads as "no folders". Use jq '.folders[]'.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.deploymentFolders.list();

        printEnvelope(result, () => {
          printTable(withMemberCounts(result.folders, result.assignments), [
            { key: "id", label: "ID", width: 36 },
            { key: "name", label: "NAME", width: 30 },
            { key: "members", label: "DEPLOYMENTS", width: 11 }
          ]);
        });
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
  $ nexus deployment folder create --body '{"name":"EU","parentId":"55555555-5555-4555-8555-555555555555"}'

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
  $ nexus deployment folder update 55555555-5555-4555-8555-555555555555 --name "Renamed"
  $ nexus deployment folder update 55555555-5555-4555-8555-555555555555 --body '{"name":"Renamed"}'
  $ nexus deployment folder update 55555555-5555-4555-8555-555555555555 --body '{"parentId":null}'

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
  confirmable(depFolder.command("delete"))
    .description("Delete a deployment folder")
    .argument("<id>", "Folder ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment folder delete 55555555-5555-4555-8555-555555555555
  $ nexus deployment folder delete 55555555-5555-4555-8555-555555555555 --yes

Notes:
  UNFILES, DOES NOT DELETE. Every deployment in this folder survives and
  keeps serving; it simply belongs to no folder afterwards, and nothing
  reports which ones moved. Run "nexus api GET /deployment-folders" first if
  you need that list.
  Child folders are NOT deleted: they lose their parent and reappear at the
  top level, keeping the deployments filed in them.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete deployment folder ${id}?`, opts))) return;

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
  $ nexus deployment folder assign --deployment-id 11111111-1111-4111-8111-111111111111 --folder-id 66666666-6666-4666-8666-666666666666
  $ nexus deployment folder assign --deployment-id 11111111-1111-4111-8111-111111111111 --folder-id null

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
  $ nexus deployment template list 11111111-1111-4111-8111-111111111111
  $ nexus deployment template list 11111111-1111-4111-8111-111111111111 --json

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

  const templateAttach = depTemplate
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
    // The list used to be typed into the description, where nothing checked it
    // and nothing refused a fourth value. Commander prints the choices itself,
    // so repeating them here would be a second copy to go stale.
    .addOption(
      enumOption(
        "--type <type>",
        "Template type",
        DEPLOYMENT_WHATSAPP_TEMPLATE_ATTACH__BODY_TYPE
      ).default("template")
    )
    .option("--enable-multi-language", "Enable multi-language support")
    .option(
      "--template-group <json>",
      "Template group JSON mapping languages to template IDs (standard templates)"
    )
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
  $ nexus deployment template attach 11111111-1111-4111-8111-111111111111 --template-id HX456 --name welcome --description "Welcome message"
  $ nexus deployment template attach 11111111-1111-4111-8111-111111111111 --template-id HX456 --name order --description "Order confirmation" --variables '{"1":{"description":"Customer name","isBodyVariable":true}}'
  $ nexus deployment template attach 11111111-1111-4111-8111-111111111111 --template-id HX456 --name products --description "Product carousel" --type carousel --enable-dynamic-size --carousel-template-group '{"baseName":"products","availableTemplates":[{"language":"en","carouselSize":3,"templateId":"HX111"},{"language":"en","carouselSize":5,"templateId":"HX222"}],"minCarouselSize":3,"maxCarouselSize":5}'
  $ nexus deployment template attach 11111111-1111-4111-8111-111111111111 --template-id HX456 --name welcome --description "Welcome message" --enable-multi-language --template-group '{"baseName":"welcome","availableLanguages":[{"language":"en","templateId":"HX456"},{"language":"fr","templateId":"HX789"}],"defaultLanguage":"en"}'

Notes:
  --enable-multi-language ON ITS OWN CHANGES NOTHING AT SEND TIME. The setting
  is the switch; --template-group is the per-language map it reads. A standard
  template with the switch on and no group resolves no language and fails when
  the agent sends. Name both, in the same command.
  --template-group is the STANDARD-template map (baseName, availableLanguages,
  defaultLanguage). --carousel-template-group is the carousel one. Naming BOTH
  is a 400 — they are mutually exclusive.
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
            process.exitCode = refuse("--variables must be valid JSON.");
            return;
          }
        }

        let templateGroup: DeploymentTemplateGroup | undefined;
        if (opts.templateGroup) {
          try {
            templateGroup = asRequestBody<DeploymentTemplateGroup>(JSON.parse(opts.templateGroup));
          } catch {
            process.exitCode = refuse("--template-group must be valid JSON.");
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
            process.exitCode = refuse("--carousel-template-group must be valid JSON.");
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
            process.exitCode = refuse("--single-item-card-template-group must be valid JSON.");
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
          templateGroup,
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
    .option(
      "--template-group <json>",
      "Template group JSON mapping languages to template IDs (standard templates)"
    )
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
  $ nexus deployment template update 11111111-1111-4111-8111-111111111111 HX456 --name "Updated Welcome"
  $ nexus deployment template update 11111111-1111-4111-8111-111111111111 HX456 --variables '{"1":{"description":"Full name"}}'
  $ nexus deployment template update 11111111-1111-4111-8111-111111111111 HX456 --enable-dynamic-size --carousel-template-group '{"baseName":"products","availableTemplates":[...]}'
  $ nexus deployment template update 11111111-1111-4111-8111-111111111111 HX456 --enable-multi-language --template-group '{"baseName":"welcome","availableLanguages":[{"language":"en","templateId":"HX456"},{"language":"fr","templateId":"HX789"}],"defaultLanguage":"en"}'

Notes:
  --enable-multi-language ON ITS OWN CHANGES NOTHING AT SEND TIME. It is the
  switch; --template-group is the per-language map a standard template reads.
  Turning the switch on without a group leaves the template unable to resolve
  any language.
  --template-group REPLACES the whole group, exactly as --variables replaces the
  whole map. --carousel-template-group is the carousel sibling; the two are
  mutually exclusive.
  --variables REPLACES the whole map, it does not merge one key in. Read
  "deployment template list 11111111-1111-4111-8111-111111111111 --json" and
  send the complete map back.
  A template id that is not attached to this deployment is a 404, not a
  silent create.
  Each setting has an ON flag and an OFF flag: --enable-multi-language /
  --no-multi-language, and --enable-dynamic-size / --no-dynamic-size. Naming
  neither leaves the stored value alone. Naming BOTH is refused, because the
  two spellings carry no order and this command will not guess.
  Sending nothing is accepted and changes nothing.`
    )
    .action(async (deploymentId: string, templateId: string, opts) => {
      try {
        // `readEnableDisablePair` owns why this reads two keys per setting and
        // why both flags together is a refusal rather than a precedence rule.
        const multiLanguage = readEnableDisablePair(opts.enableMultiLanguage, opts.multiLanguage);
        if (multiLanguage.contradiction) {
          process.exitCode = refuse(
            "--enable-multi-language and --no-multi-language contradict each other.",
            CONTRADICTORY_TOGGLE_HINT
          );
          return;
        }

        const dynamicSize = readEnableDisablePair(opts.enableDynamicSize, opts.dynamicSize);
        if (dynamicSize.contradiction) {
          process.exitCode = refuse(
            "--enable-dynamic-size and --no-dynamic-size contradict each other.",
            CONTRADICTORY_TOGGLE_HINT
          );
          return;
        }

        const body: Record<string, unknown> = {};
        if (opts.name !== undefined) body.name = opts.name;
        if (opts.description !== undefined) body.description = opts.description;
        if (multiLanguage.value !== undefined) body.enableMultiLanguage = multiLanguage.value;
        if (dynamicSize.value !== undefined) body.enableDynamicSize = dynamicSize.value;
        if (opts.singleItemCardTemplateId !== undefined)
          body.singleItemCardTemplateId = opts.singleItemCardTemplateId;
        if (opts.variables) {
          try {
            body.variables = JSON.parse(opts.variables);
          } catch {
            process.exitCode = refuse("--variables must be valid JSON.");
            return;
          }
        }
        if (opts.templateGroup) {
          try {
            body.templateGroup = JSON.parse(opts.templateGroup);
          } catch {
            process.exitCode = refuse("--template-group must be valid JSON.");
            return;
          }
        }
        if (opts.carouselTemplateGroup) {
          try {
            body.carouselTemplateGroup = JSON.parse(opts.carouselTemplateGroup);
          } catch {
            process.exitCode = refuse("--carousel-template-group must be valid JSON.");
            return;
          }
        }
        if (opts.singleItemCardTemplateGroup) {
          try {
            body.singleItemCardTemplateGroup = JSON.parse(opts.singleItemCardTemplateGroup);
          } catch {
            process.exitCode = refuse("--single-item-card-template-group must be valid JSON.");
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

  confirmable(depTemplate.command("detach"))
    .description("Detach a template from a deployment")
    .argument("<deploymentId>", "Deployment ID")
    .argument("<templateId>", "Template ID (Twilio SID)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment template detach 11111111-1111-4111-8111-111111111111 HX456
  $ nexus deployment template detach 11111111-1111-4111-8111-111111111111 HX456 --yes

Notes:
  THE TEMPLATE ITSELF IS NOT DELETED. This unwires it from this deployment
  only; it stays in Twilio, stays approved, and stays attached to any other
  deployment using it. "nexus channel whatsapp-template delete" is the one
  that removes it for good.
  The agent stops being able to send it here immediately.
  Detaching a template that is not attached is a 404.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (deploymentId: string, templateId: string, opts) => {
      try {
        if (
          !(await confirmDestructive(
            `Detach template ${templateId} from deployment ${deploymentId}?`,
            opts
          ))
        )
          return;
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
      "Allow agent to dynamically create and send templates — true or false",
      booleanFlag
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment template settings 11111111-1111-4111-8111-111111111111
  $ nexus deployment template settings 11111111-1111-4111-8111-111111111111 --allow-dynamic-templates true

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
          const value = opts.allowDynamicTemplates;
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
          const attached = Array.isArray(data) ? data.length : 0;
          // A count and a tip, both as prose, were the whole of stdout — so the
          // one fact this branch produces was unreachable under --json. The
          // count is a field now; the tip is human copy and stays human.
          if (isJsonMode()) {
            printRecord({ deploymentId, templatesAttached: attached });
          } else {
            console.log(`Templates attached: ${attached}`);
            console.log(
              `Tip: Use --allow-dynamic-templates true/false to toggle agent template creation.`
            );
          }
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists and after the hand-written prose, so
  // the generated reference lands below the Notes rather than above them.
  bindCommand(list, DEPLOYMENT_LIST_CONTRACT);
  bindCommand(create, DEPLOYMENT_CREATE_CONTRACT);
  bindCommand(update, DEPLOYMENT_UPDATE_CONTRACT);
  // A pure `--body` PATCH: every one of these seven enums is reachable, and none
  // has a flag. Naming them keeps the gate honest, and the contract block above
  // is now the ONLY place their values are written down — the Notes below this
  // command say to read them off a prior `embed-config`, which is a round trip
  // an operator should not have to make to learn a closed list.
  bindCommand(embedConfigUpdate, DEPLOYMENT_UPDATE_EMBED_CONFIG_CONTRACT, {
    "Body.format": "--body only; embed-config-update takes no flags at all",
    "Body.bubblePosition": "--body only; embed-config-update takes no flags at all",
    "Body.bubbleBorderRadius": "--body only; embed-config-update takes no flags at all",
    "Body.bubbleSize": "--body only; embed-config-update takes no flags at all",
    "Body.uiAppearance": "--body only; embed-config-update takes no flags at all",
    "Body.uiRadius": "--body only; embed-config-update takes no flags at all",
    "Body.uiContainerRadius": "--body only; embed-config-update takes no flags at all"
  });
  // Its one enum, `Body.type`, is on `--type` above, so this needs no bodyOnly
  // exemption. What the binding adds beyond the enum is the 28-field shape: the
  // three nested template-group objects reach the operator only as `--*-group
  // <json>`, and `--print-contract` is now the only place their keys are
  // written down.
  bindCommand(templateAttach, DEPLOYMENT_WHATSAPP_TEMPLATE_ATTACH_CONTRACT);
}
