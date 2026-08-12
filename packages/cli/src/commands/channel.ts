import { exec } from "node:child_process";
import { readFileSync } from "node:fs";

import { Command } from "commander";

import { createClient } from "../client";
import { resolveDashboardUrl } from "../config";
import { handleError } from "../errors";
import { color, printRecord, printSuccess, printTable } from "../output";

const VARIABLE_PATTERN = /\{\{\d+\}\}/g;

/**
 * Warn if any text field in the template types has high variable density.
 * Meta rejects templates where variables dominate the content.
 */
function warnIfHighVariableDensity(types: Record<string, unknown>): boolean {
  let warned = false;

  function checkField(text: string, fieldLabel: string): void {
    const matches = text.match(VARIABLE_PATTERN) ?? [];
    if (matches.length === 0) return;
    const variableCharsLength = matches.reduce((sum, m) => sum + m.length, 0);
    const staticLength = text.length - variableCharsLength;
    if (staticLength < matches.length * 3) {
      console.warn(
        color.yellow("⚠ Warning:") +
          ` ${fieldLabel} has very high variable density (${staticLength} static chars, ${matches.length} variable(s)).` +
          ` Meta may reject this with "too many variables for its length."`
      );
      warned = true;
    }
  }

  for (const [typeKey, typeValue] of Object.entries(types)) {
    if (!typeValue || typeof typeValue !== "object") continue;
    const tv = typeValue;

    // `in` narrowing rather than a cast: the value is operator-supplied JSON,
    // so every field is genuinely a claim that has to be checked at runtime.
    if ("body" in tv && typeof tv.body === "string") checkField(tv.body, `${typeKey} body`);
    if ("title" in tv && typeof tv.title === "string") checkField(tv.title, `${typeKey} title`);
    if ("subtitle" in tv && typeof tv.subtitle === "string") {
      checkField(tv.subtitle, `${typeKey} subtitle`);
    }

    if ("cards" in tv && Array.isArray(tv.cards)) {
      tv.cards.forEach((card: unknown, i: number) => {
        if (typeof card !== "object" || card === null) return;
        if ("body" in card && typeof card.body === "string") {
          checkField(card.body, `${typeKey} card[${i}] body`);
        }
        if ("title" in card && typeof card.title === "string") {
          checkField(card.title, `${typeKey} card[${i}] title`);
        }
      });
    }
  }

  if (warned) {
    console.warn(
      color.yellow("  Tip:") +
        " Add more descriptive static text around {{N}} placeholders to avoid Meta rejection.\n"
    );
  }

  return warned;
}

function openUrl(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${JSON.stringify(url)}`);
}

export function registerChannelCommands(program: Command): void {
  const channel = program
    .command("channel")
    .description("Set up deployment channels: connections, phone numbers, WhatsApp senders");

  channel.addHelpText(
    "after",
    `
Everything here is what must exist BEFORE "nexus deployment create" can work.
Run "nexus channel setup --type <TYPE>" first — it names the next missing
piece and stops there.

WhatsApp, in the order the pieces have to arrive:
  1. channel connection create        one messaging connection per org
  2. channel connect-waba             browser only, links your Meta account
  3. nexus phone-number buy           A PURCHASE — it bills, see its help
  4. channel whatsapp-sender create   registers the number, Meta must approve
  5. nexus deployment create --type WHATSAPP

Two things here reach the outside world and cannot be undone from the CLI:
"whatsapp-template test-send" sends a real billed message to a real phone, and
"whatsapp-template create --submit" files the template with Meta.

Needs channels:read / channels:write; the phone-number steps run on
phone_numbers:read / :write / :delete instead.`
  );

  // ── setup ──────────────────────────────────────────────────────────
  channel
    .command("setup")
    .description("Check or auto-provision channel setup prerequisites")
    .requiredOption(
      "--type <type>",
      "Deployment type (WHATSAPP, TWILIO_SMS, TWILIO_VOICE, EMBED, etc.)"
    )
    .option("--auto", "Auto-provision what is possible (e.g., create messaging connection)")
    .option("--region <region>", "Region for auto-provisioning (us1 or ie1)", "us1")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel setup --type WHATSAPP
  $ nexus channel setup --type WHATSAPP --auto
  $ nexus channel setup --type TWILIO_SMS --json

Notes:
  THE "DEPLOYMENT" STEP ALWAYS READS action_needed. It is the thing you run
  this before doing, and it is never checked — do not wait for it to turn
  green. When every step ABOVE it is completed the response reports
  ready: true, and that is the signal to create the deployment.

  THIS STOPS AT THE FIRST GAP. The first step that reads action_needed blocks
  the rest, and every step after it reads "pending" whatever its real state
  is. So one run answers "what is the next thing to do", not "what is
  missing" — fix that step and run it again.

  Only WHATSAPP, TWILIO_SMS and TWILIO_VOICE have real prerequisite checks.
  Every other --type returns the single always-action_needed deployment step,
  so ready: true there means nothing was checked.

  --auto ONLY CREATES THE MESSAGING CONNECTION, and only for those three
  phone-backed types. Nothing buys a number, opens the Meta flow or registers
  a sender for you. If the creation fails the error is swallowed and you get
  the same checklist back with no explanation — compare the "connection" step
  before and after.

  --region is read only while creating that connection. An organization gets
  one connection, so once it exists this flag does nothing and the region
  cannot be changed here.
  Each step carries an action.endpoint and action.hint; read them with --json.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        let result;
        if (opts.auto) {
          result = await client.channels.autoProvision({
            type: opts.type,
            region: opts.region
          });
        } else {
          result = await client.channels.getSetupStatus(opts.type);
        }
        const data = result;
        printTable(data.steps, [
          { key: "step", label: "#", width: 3 },
          { key: "label", label: "STEP", width: 25 },
          { key: "status", label: "STATUS", width: 16 },
          { key: "description", label: "DESCRIPTION", width: 45 }
        ]);
        if (data.ready) {
          printSuccess("All prerequisites met. Ready to create deployment.");
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── connect-waba ────────────────────────────────────────────────────
  channel
    .command("connect-waba")
    .description("Open browser to connect your WhatsApp Business Account (Meta signup)")
    .addHelpText(
      "after",
      `
This step requires a browser — it cannot be done via API.
Opens the Nexus dashboard where you can click "Connect with Meta"
to link your WhatsApp Business Account.

Examples:
  $ nexus channel connect-waba

Notes:
  OPENS A BROWSER AND RETURNS IMMEDIATELY. It waits for nothing and verifies
  nothing; a zero exit code means a URL was opened, not that Meta is linked.
  Confirm with "nexus channel setup --type WHATSAPP" — the WhatsApp Business
  Account step reads completed once the connection carries a wabaId.
  There is no headless path. On a server with no browser the command still
  exits 0, so print the URL and finish the flow somewhere with a screen.
  Create the messaging connection first — this links Meta to that connection.`
    )
    .action(async () => {
      try {
        const dashboardUrl = resolveDashboardUrl(program.optsWithGlobals().dashboardUrl);
        const url = `${dashboardUrl}/app/connect-waba`;
        console.log(`Opening ${color.cyan(url)} ...`);
        console.log("");
        console.log('Complete the "Connect with Meta" flow in your browser, then verify:');
        console.log(`  ${color.dim("nexus channel setup --type WHATSAPP")}`);
        openUrl(url);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── connection ─────────────────────────────────────────────────────
  const connection = channel.command("connection").description("Manage messaging connections");

  connection.addHelpText(
    "after",
    `
The messaging connection is the account WhatsApp, SMS and Voice all hang off,
and an organization gets exactly ONE. Its region is fixed when it is created
and every number bought afterwards lives there, so create it deliberately.

There is no delete and no update here — a second create is a 409.`
  );

  connection
    .command("list")
    .description("List messaging connections")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel connection list
  $ nexus channel connection list --json

Notes:
  An organization has at most one, so this is a zero- or one-row table. Its ID
  is the --connection-id every WhatsApp command below wants.
  Credentials are redacted server-side and never appear here.
  STATUS describes the Twilio account, not WhatsApp. Whether Meta is linked
  shows up as a wabaId on the connection — read it with --json, or use
  "nexus channel setup --type WHATSAPP".`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.listConnections();
        const data = result;
        printTable(Array.isArray(data) ? data : [data], [
          { key: "id", label: "ID", width: 38 },
          { key: "name", label: "NAME", width: 20 },
          { key: "region", label: "REGION", width: 8 },
          { key: "status", label: "STATUS", width: 12 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  connection
    .command("create")
    .description("Create a messaging connection (max 1 per organization)")
    .option("--region <region>", "Region: us1 or ie1", "us1")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel connection create
  $ nexus channel connection create --region ie1

Notes:
  THE REGION IS PERMANENT AND THERE IS ONLY ONE CONNECTION PER ORGANIZATION.
  Nothing here changes it afterwards and a second create is a 409
  LIMIT_REACHED, so choosing us1 by accident means every WhatsApp, SMS and
  Voice number this organization ever buys lives in us1. Pick ie1 deliberately
  if the data has to stay in Europe.
  Not idempotent in the useful direction: run "connection list" first rather
  than relying on the 409.
  Only us1 and ie1 are accepted; anything else is a 400.
  This is the FIRST step for WhatsApp, SMS and Voice — the number purchase and
  the WhatsApp sender both hang off this connection.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.createConnection({ region: opts.region });
        const data = result;
        printRecord(data, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "accountSid", label: "Account SID" },
          { key: "region", label: "Region" },
          { key: "status", label: "Status" }
        ]);
        printSuccess("Messaging connection created.");
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── whatsapp-sender ────────────────────────────────────────────────
  const waSender = channel.command("whatsapp-sender").description("Manage WhatsApp senders");

  waSender.addHelpText(
    "after",
    `
A sender is a phone number registered with WhatsApp Business through Meta. It
needs a messaging connection with a linked WABA and an ACTIVE phone number
bought on that connection, in that order.

CREATING ONE DOES NOT MAKE IT USABLE. It starts OFFLINE and only Meta can make
it ONLINE, which takes minutes and can be refused. "whatsapp-sender list" is
the poll, and its offline_reasons — visible only with --json — is the one
place a refusal is stated.

There is no delete here: a sender is removed by releasing its phone number,
which deregisters and deletes it.`
  );

  waSender
    .command("list")
    .description("List WhatsApp senders — the live Meta registration state")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-sender list
  $ nexus channel whatsapp-sender list --json

Notes:
  THIS IS THE POLL. STATUS is fetched live from Twilio on every call, and a
  sender is unusable until it reads ONLINE. Registration takes minutes.
  OFFLINE MEANS BOTH "STILL WAITING" AND "REJECTED" — the display folds every
  non-ONLINE state into one word. Which one it is only appears in
  offline_reasons, which this table does not show: read it with --json. An
  empty offline_reasons on an OFFLINE sender means still in progress; entries
  there are Meta's refusal, and waiting longer will not fix it.
  A rejected sender is repaired by fixing the cause on Meta's side and
  recreating the sender, not by retrying this command.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.listWhatsAppSenders();
        const data = result;
        printTable(Array.isArray(data) ? data : [data], [
          { key: "id", label: "ID", width: 38 },
          { key: "name", label: "NAME", width: 20 },
          { key: "status", label: "STATUS", width: 10 },
          { key: "phoneNumberId", label: "PHONE NUMBER ID", width: 38 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  waSender
    .command("create")
    .description("Create a WhatsApp sender (registers phone with WhatsApp Business)")
    .requiredOption("--connection-id <id>", "Messaging connection ID")
    .requiredOption("--phone-number-id <id>", "Phone number ID")
    .requiredOption("--sender-name <name>", "Display name for the WhatsApp sender")
    .option("--waba-id <id>", "WhatsApp Business Account ID (reads from connection if omitted)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-sender create --connection-id abc --phone-number-id def --sender-name "My Business"
  $ nexus channel whatsapp-sender create --connection-id abc --phone-number-id def --sender-name "EU Support" --json

Notes:
  THE SENDER STARTS OFFLINE AND ONLY META CAN MAKE IT ONLINE. A 201 here means
  the registration was filed, not that the number can send. Poll
  "nexus channel whatsapp-sender list" until STATUS reads ONLINE; a refusal
  comes back as OFFLINE with offline_reasons rather than as an error.
  Registration takes minutes and can fail hours later.

  --phone-number-id is the Nexus phone number UUID from
  "nexus phone-number list", not the number itself. It must be ACTIVE and
  bought on this same connection.
  --sender-name is the display name Meta shows recipients and what Meta
  reviews — a name that misrepresents the business is a rejection reason.
  --waba-id is read off the connection when omitted; pass it only if you hold
  several WhatsApp Business Accounts.
  Then create the deployment with
  --body '{"whatsappSenderId":"<sender id>"}'.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.createWhatsAppSender({
          connectionId: opts.connectionId,
          phoneNumberId: opts.phoneNumberId,
          senderName: opts.senderName,
          wabaId: opts.wabaId
        });
        const data = result;
        printRecord(data, [
          { key: "id", label: "ID" },
          { key: "senderId", label: "Sender ID" },
          { key: "name", label: "Name" },
          { key: "wabaId", label: "WABA ID" },
          { key: "phoneNumberId", label: "Phone Number ID" }
        ]);
        printSuccess("WhatsApp sender created. Status may be OFFLINE while Meta approves.");
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  waSender
    .command("get")
    .description("Get WhatsApp sender details")
    .argument("<id>", "Sender ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-sender get XEabc123
  $ nexus channel whatsapp-sender get XEabc123 --json

Notes:
  Same live Twilio read as "whatsapp-sender list", for one sender. STATUS is
  ONLINE or OFFLINE only — use --json for offline_reasons, which is the sole
  place a Meta rejection is stated.
  The <id> is the sender id from the list, not the phone number id.`
    )
    .action(async (id) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.getWhatsAppSender(id);
        const data = result;
        printRecord(data, [
          { key: "id", label: "ID" },
          { key: "senderId", label: "Sender ID" },
          { key: "name", label: "Name" },
          { key: "status", label: "Status" },
          { key: "wabaId", label: "WABA ID" },
          { key: "phoneNumberId", label: "Phone Number ID" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── whatsapp-template ──────────────────────────────────────────────
  const waTemplate = channel
    .command("whatsapp-template")
    .description("Manage WhatsApp message templates (Twilio Content API)");

  waTemplate.addHelpText(
    "after",
    `
A template goes through four states and each one is a different command:
  create           written to Twilio, unsubmitted — cannot be sent
  submit-approval  filed with Meta, pending — still cannot be sent
  approvals        read the verdict: approved, pending or rejected
  test-send        SENDS A REAL BILLED MESSAGE to a real phone

Templates live on the CONNECTION, not on a deployment. Attach an approved one
to a deployment with "nexus deployment template attach" before an agent can
use it.

Meta's review is not instant and not guaranteed. Nothing here polls to
completion — "create --submit" and "submit-approval --wait" give up after 30s
and 2m and tell you to check "approvals".`
  );

  waTemplate
    .command("list")
    .description("List WhatsApp message templates")
    .option("--connection-id <id>", "Filter by messaging connection ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-template list
  $ nexus channel whatsapp-template list --connection-id abc --json

Notes:
  SAYS NOTHING ABOUT META APPROVAL. Every template in the Twilio account is
  listed, approved or not, and a row here is not permission to send. Read
  "nexus channel whatsapp-template approvals" for the verdict.
  This is the Twilio-side inventory; "nexus deployment template list <depId>"
  is what a given deployment has attached. The two differ routinely.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.listWhatsAppTemplates({
          connectionId: opts.connectionId
        });
        const data = result;
        printTable(Array.isArray(data) ? data : [data], [
          { key: "id", label: "ID", width: 38 },
          { key: "friendly_name", label: "FRIENDLY NAME", width: 25 },
          { key: "language", label: "LANG", width: 8 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  waTemplate
    .command("get")
    .description("Get WhatsApp template details")
    .argument("<templateId>", "Template ID (Twilio SID)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-template get HX123
  $ nexus channel whatsapp-template get HX123 --json

Notes:
  <templateId> is the Twilio content SID (HX...), not the friendly name.
  Returns the content only — approval status is not part of it. Read
  "nexus channel whatsapp-template approvals" for that.
  "types" is the Twilio Types object as stored; use it as the starting point
  for a --body-file when creating a variant.`
    )
    .action(async (templateId) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.getWhatsAppTemplate(templateId);
        const data = result;
        printRecord(data, [
          { key: "id", label: "ID" },
          { key: "friendly_name", label: "Friendly Name" },
          { key: "language", label: "Language" },
          { key: "types", label: "Types" },
          { key: "variables", label: "Variables" },
          { key: "created_at", label: "Created At" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  waTemplate
    .command("create")
    .description("Create a WhatsApp message template")
    .requiredOption("--connection-id <id>", "Messaging connection ID")
    .requiredOption("--friendly-name <name>", "Template name (e.g., order_confirmation)")
    .requiredOption("--language <lang>", "Language code (e.g., en, en_US)")
    .option("--body <text>", "Template body text (auto-wraps as twilio/text type)")
    .option("--body-file <path>", "Path to JSON file with full Twilio Types object")
    .option("--type <type>", "Twilio type key when using --body", "twilio/text")
    .option("--variables <json>", 'Template variables as JSON (e.g., \'{"1":"default"}\')')
    .option("--submit", "Also submit for Meta approval after creation")
    .option(
      "--category <category>",
      "Approval category (required with --submit): UTILITY, MARKETING, AUTHENTICATION"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-template create --connection-id abc --friendly-name welcome --language en --body "Hello {{1}}, welcome!"
  $ nexus channel whatsapp-template create --connection-id abc --friendly-name promo --language en --body-file template.json
  $ nexus channel whatsapp-template create --connection-id abc --friendly-name order --language en --body "Order {{1}} confirmed" --submit --category UTILITY

Notes:
  CREATING IS NOT SUBMITTING AND SUBMITTING IS NOT APPROVAL. Without --submit
  the template exists in Twilio and can never be sent. With --submit it is
  filed with Meta and this command polls for 30 SECONDS ONLY — a still-pending
  verdict is reported as pending and the command exits 0. Read the real answer
  from "nexus channel whatsapp-template approvals".

  --category IS PERMANENT AND IT IS A BILLING DECISION. UTILITY, MARKETING and
  AUTHENTICATION are priced differently by Meta and reviewed differently;
  a MARKETING message filed as UTILITY is a rejection. It cannot be changed
  after submission — create a new template instead.

  Variables are positional: {{1}}, {{2}} in the body text. Meta rejects
  templates where variables dominate the static text and this command warns
  before sending — the warning does NOT stop the create.
  --body and --body-file are mutually exclusive and one is required.
  --body-file takes the full Twilio Types object, which is what you need for
  cards, carousels or media; --body only builds a twilio/text template.
  --language is the Twilio language code (en, en_US) and is part of the
  template's identity — a second language is a second template.`
    )
    .action(async (opts) => {
      try {
        // Validate: --body or --body-file required, not both
        if (!opts.body && !opts.bodyFile) {
          console.error("Error: Either --body or --body-file is required.");
          process.exitCode = 1;
          return;
        }
        if (opts.body && opts.bodyFile) {
          console.error("Error: Cannot use both --body and --body-file.");
          process.exitCode = 1;
          return;
        }
        if (opts.submit && !opts.category) {
          console.error("Error: --category is required when using --submit.");
          process.exitCode = 1;
          return;
        }

        // Build types object
        let types: Record<string, unknown>;
        if (opts.bodyFile) {
          try {
            const content = readFileSync(opts.bodyFile, "utf-8");
            types = JSON.parse(content);
          } catch (e) {
            console.error(
              `Error reading --body-file: ${e instanceof Error ? e.message : String(e)}`
            );
            process.exitCode = 1;
            return;
          }
        } else {
          types = { [opts.type]: { body: opts.body } };
        }

        // Parse variables
        let variables: Record<string, string> | undefined;
        if (opts.variables) {
          try {
            variables = JSON.parse(opts.variables);
          } catch {
            console.error("Error: --variables must be valid JSON.");
            process.exitCode = 1;
            return;
          }
        }

        // Warn about variable density before submission
        warnIfHighVariableDensity(types);

        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.createWhatsAppTemplate({
          connectionId: opts.connectionId,
          friendlyName: opts.friendlyName,
          language: opts.language,
          types,
          variables
        });
        const data = result;
        printRecord(data, [
          { key: "id", label: "ID" },
          { key: "friendly_name", label: "Friendly Name" },
          { key: "language", label: "Language" },
          { key: "created_at", label: "Created At" }
        ]);
        printSuccess("WhatsApp template created.");

        // Auto-submit for approval if --submit
        if (opts.submit) {
          console.log("");
          console.log("Submitting for Meta approval...");
          const approval = await client.channels.submitTemplateApproval({
            connectionId: opts.connectionId,
            templateId: data.id,
            name: opts.friendlyName,
            category: opts.category
          });
          const approvalData = approval;
          printRecord(approvalData, [
            { key: "sid", label: "Approval SID" },
            { key: "status", label: "Status" }
          ]);
          printSuccess("Template submitted for Meta approval.");

          // Brief poll to catch immediate Meta rejections (up to 30s)
          const pollMaxMs = 30_000;
          const pollIntervalMs = 5_000;
          const pollStart = Date.now();
          let resolved = false;

          console.log("Checking approval status...");

          while (Date.now() - pollStart < pollMaxMs) {
            await new Promise((r) => setTimeout(r, pollIntervalMs));
            try {
              const approvals = await client.channels.listTemplateApprovals({
                connectionId: opts.connectionId
              });
              const approvalsArr = approvals;
              const items = Array.isArray(approvalsArr) ? approvalsArr : [approvalsArr];
              const match = items.find((a: any) => a.sid === data.id);

              if (match?.approvalRequests?.status) {
                const status = match.approvalRequests.status;
                if (status === "rejected") {
                  console.log(color.red(`✗ Template rejected by Meta: ${status}`));
                  if (match.approvalRequests.rejection_reason) {
                    console.log(`  Reason: ${match.approvalRequests.rejection_reason}`);
                  }
                  resolved = true;
                  process.exitCode = 1;
                  break;
                } else if (status === "approved") {
                  console.log(color.green(`✓ Template approved by Meta.`));
                  resolved = true;
                  break;
                }
              }
            } catch {
              // Ignore polling errors — best effort
            }
          }

          if (!resolved) {
            console.log(
              `Status still pending. Check later: ${color.dim("nexus channel whatsapp-template approvals")}`
            );
          }
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  waTemplate
    .command("delete")
    .description("Delete a WhatsApp template — permanent, and Meta approval dies with it")
    .argument("<templateId>", "Template ID (Twilio SID)")
    .option("--yes", "Skip confirmation prompt")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-template delete HX123
  $ nexus channel whatsapp-template delete HX123 --yes

Notes:
  THE META APPROVAL GOES WITH IT AND CANNOT BE RECOVERED. Recreating the same
  text produces a new SID that starts unsubmitted and has to be reviewed
  again, which takes as long as the first time did.

  DEPLOYMENTS STILL HOLDING THIS TEMPLATE ARE NOT UPDATED. Their attachment
  keeps the dead SID, nothing errors here, and the agent's send fails later.
  Run "nexus deployment template list <depId>" across your WhatsApp
  deployments first and detach it from each.

  The prompt only appears on a TTY — piped or in CI it deletes without one.`
    )
    .action(async (templateId, opts) => {
      try {
        if (!opts.yes && process.stdin.isTTY) {
          const readline = await import("node:readline");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          const answer = await new Promise<string>((resolve) => {
            rl.question(`Delete template ${templateId}? (y/N) `, resolve);
          });
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Cancelled.");
            return;
          }
        }
        const client = createClient(program.optsWithGlobals());
        await client.channels.deleteWhatsAppTemplate(templateId);
        printSuccess("WhatsApp template deleted.", { id: templateId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  waTemplate
    .command("approvals")
    .description("List template approval status from Meta")
    .option("--connection-id <id>", "Filter by messaging connection ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-template approvals
  $ nexus channel whatsapp-template approvals --json

Notes:
  THIS IS THE AUTHORITATIVE ANSWER to "can this template be sent". approved is
  the only status that can; pending and unsubmitted cannot, and rejected never
  will until the template is rewritten and resubmitted.
  A template that was never submitted may carry an EMPTY status rather than
  "unsubmitted" — a blank STATUS column is not approval.
  REJECTION REASON is Meta's own text and is the only thing that says what to
  change. Read it before resubmitting anything.
  Omitting --connection-id lists across every connection; an organization has
  one, so it rarely matters.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.listTemplateApprovals({
          connectionId: opts.connectionId
        });
        const data = result;
        const items = Array.isArray(data) ? data : [data];

        // Flatten approvalRequests for table display
        const rows = items.map((item: any) => ({
          sid: item.sid,
          name: item.approvalRequests?.name ?? "",
          category: item.approvalRequests?.category ?? "",
          status: item.approvalRequests?.status ?? "",
          rejection_reason: item.approvalRequests?.rejection_reason ?? ""
        }));

        printTable(rows, [
          { key: "sid", label: "SID", width: 38 },
          { key: "name", label: "NAME", width: 20 },
          { key: "category", label: "CATEGORY", width: 15 },
          { key: "status", label: "STATUS", width: 12 },
          { key: "rejection_reason", label: "REJECTION REASON", width: 30 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  waTemplate
    .command("submit-approval")
    .description("Submit a template for Meta WhatsApp approval")
    .requiredOption("--connection-id <id>", "Messaging connection ID")
    .requiredOption("--template-id <id>", "Template ID (Twilio SID)")
    .requiredOption("--name <name>", "Template name for approval")
    .requiredOption(
      "--category <category>",
      "Approval category: UTILITY, MARKETING, or AUTHENTICATION"
    )
    .option("--wait", "Poll approval status until resolved (up to 2 minutes)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-template submit-approval --connection-id abc --template-id HX123 --name welcome --category UTILITY
  $ nexus channel whatsapp-template submit-approval --connection-id abc --template-id HX123 --name promo --category MARKETING --wait

Notes:
  A 200 MEANS FILED, NOT APPROVED. The template still cannot be sent. Only
  "nexus channel whatsapp-template approvals" reporting approved says it can.

  --category IS PERMANENT AND PRICED. UTILITY, MARKETING and AUTHENTICATION
  bill differently and are reviewed against different rules; picking the wrong
  one is a rejection, and it cannot be corrected on this template afterwards.

  --wait POLLS FOR 2 MINUTES AND THEN GIVES UP, exiting 0 with the status
  still pending. That is a timeout, not a verdict — Meta commonly takes
  longer. Do not treat a successful exit as approval.
  --name is the name filed with Meta for this approval; --template-id is the
  Twilio content SID (HX...) of the template it reviews.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.submitTemplateApproval({
          connectionId: opts.connectionId,
          templateId: opts.templateId,
          name: opts.name,
          category: opts.category
        });
        const data = result;
        printRecord(data, [
          { key: "sid", label: "Approval SID" },
          { key: "status", label: "Status" }
        ]);
        printSuccess("Template submitted for Meta approval.");

        // Poll if --wait
        if (opts.wait) {
          const maxWaitMs = 120_000;
          const intervalMs = 5_000;
          const startTime = Date.now();
          let finalStatus = data.status;

          console.log("Waiting for approval...");

          while (Date.now() - startTime < maxWaitMs) {
            await new Promise((r) => setTimeout(r, intervalMs));
            const approvals = await client.channels.listTemplateApprovals({
              connectionId: opts.connectionId
            });
            const approvalsData = approvals;
            const items = Array.isArray(approvalsData) ? approvalsData : [approvalsData];
            const match = items.find((a: any) => a.sid === opts.templateId);

            if (match?.approvalRequests?.status) {
              finalStatus = match.approvalRequests.status;
              if (finalStatus !== "pending" && finalStatus !== "unsubmitted") {
                console.log(`Approval resolved: ${color.cyan(finalStatus)}`);
                if (finalStatus === "rejected" && match.approvalRequests.rejection_reason) {
                  console.log(`Reason: ${match.approvalRequests.rejection_reason}`);
                }
                break;
              }
            }
          }

          if (finalStatus === "pending" || finalStatus === "unsubmitted") {
            console.log(
              `Still ${finalStatus} after 2m. Check again: ${color.dim("nexus channel whatsapp-template approvals")}`
            );
          }
        }

        console.log(
          `\nNext: Attach to deployment: ${color.dim("nexus deployment template attach <depId> --template-id ...")}`
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  waTemplate
    .command("test-send")
    .description("Send this template to a real phone for real money — there is no dry run")
    .requiredOption("--connection-id <id>", "Messaging connection ID")
    .requiredOption("--template-id <id>", "Template ID (Twilio content SID)")
    .requiredOption("--to <phone>", "Recipient phone number in E.164 format (e.g., +1234567890)")
    .option("--variables <json>", 'Template variables as JSON (e.g., \'{"1": "Hello"}\')')
    .option("--wait", "Poll delivery status until resolved (up to 2 minutes)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-template test-send --connection-id abc --template-id HX123 --to +1234567890
  $ nexus channel whatsapp-template test-send --connection-id abc --template-id HX123 --to +1234567890 --variables '{"1": "Sneakers"}' --wait

Notes:
  THIS SENDS A REAL WHATSAPP MESSAGE TO A REAL PHONE THROUGH TWILIO AND META,
  AND IT BILLS. There is no dry-run mode, no sandbox and no confirmation
  prompt — it fires on submit. "test" describes your intent, not the pipeline.
  The recipient sees an ordinary message from your business and cannot tell it
  was a test. Send to a number you own.

  Each send is a separate charge, so a --wait loop that you re-run costs money
  each time. Nothing here is refundable and nothing can be recalled.
  --to must be E.164 (+ then digits, no spaces or dashes) or it is a 400.
  --variables is a flat map of position to value: '{"1":"Sneakers"}'. A
  missing position sends the template with the placeholder unfilled.

  --wait polls delivery for up to 2 minutes and exits non-zero on failed or
  undelivered. Without it the command returns as soon as Twilio accepts the
  message — "queued" is not "delivered", and a delivery failure is invisible.
  Check later with the messageSid it prints.
  An unapproved template is refused by Meta at send time, not here.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        let variables: Record<string, string> | undefined;
        if (opts.variables) {
          try {
            variables = JSON.parse(opts.variables);
          } catch {
            console.error('Invalid JSON for --variables. Example: \'{"1": "Hello"}\'');
            process.exitCode = 1;
            return;
          }
        }

        const result = await client.channels.testSendWhatsAppTemplate(opts.templateId, {
          connectionId: opts.connectionId,
          to: opts.to,
          variables
        });
        const data = result;

        printRecord(data, [
          { key: "messageSid", label: "Message SID" },
          { key: "status", label: "Status" },
          { key: "to", label: "To" },
          { key: "from", label: "From" },
          { key: "sentAt", label: "Sent At" }
        ]);
        printSuccess("Template test-send initiated.");

        // Poll delivery status if --wait
        if (opts.wait) {
          const maxWaitMs = 120_000;
          const intervalMs = 5_000;
          const startTime = Date.now();
          let lastStatus = data.status;

          console.log("Polling delivery status...");

          while (Date.now() - startTime < maxWaitMs) {
            await new Promise((r) => setTimeout(r, intervalMs));
            try {
              const statusResult = await client.channels.getTestSendStatus(
                opts.templateId,
                data.messageSid,
                { connectionId: opts.connectionId }
              );
              const statusData = statusResult;
              lastStatus = statusData.status;

              // Terminal statuses
              if (["delivered", "read"].includes(lastStatus)) {
                console.log(color.green(`\u2713 Message ${lastStatus}.`));
                break;
              } else if (["failed", "undelivered"].includes(lastStatus)) {
                console.log(color.red(`\u2717 Message ${lastStatus}.`));
                if (statusData.errorCode) {
                  console.log(
                    `  Error ${statusData.errorCode}: ${statusData.errorMessage ?? "Unknown error"}`
                  );
                }
                process.exitCode = 1;
                break;
              }
            } catch {
              // Ignore transient polling errors
            }
          }

          if (!["delivered", "read", "failed", "undelivered"].includes(lastStatus)) {
            console.log(
              `Status still '${lastStatus}' after 2m. The message may still be in transit.`
            );
          }
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
