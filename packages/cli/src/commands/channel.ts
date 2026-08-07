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
  $ nexus channel setup --type TWILIO_SMS --json`
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
  $ nexus channel connect-waba`
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

  connection
    .command("list")
    .description("List messaging connections")
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

  waSender
    .command("list")
    .description("List WhatsApp senders")
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
  $ nexus channel whatsapp-sender create --connection-id abc --phone-number-id def --sender-name "EU Support" --json`
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

  waTemplate
    .command("list")
    .description("List WhatsApp message templates")
    .option("--connection-id <id>", "Filter by messaging connection ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-template list
  $ nexus channel whatsapp-template list --connection-id abc --json`
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
  $ nexus channel whatsapp-template create --connection-id abc --friendly-name order --language en --body "Order {{1}} confirmed" --submit --category UTILITY`
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
    .description("Delete a WhatsApp template")
    .argument("<templateId>", "Template ID (Twilio SID)")
    .option("--yes", "Skip confirmation prompt")
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
  $ nexus channel whatsapp-template approvals --json`
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
  $ nexus channel whatsapp-template submit-approval --connection-id abc --template-id HX123 --name promo --category MARKETING --wait`
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
    .description(
      "Test-send a WhatsApp template to a phone number via the real Twilio/Meta pipeline"
    )
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
  $ nexus channel whatsapp-template test-send --connection-id abc --template-id HX123 --to +1234567890 --variables '{"1": "Sneakers"}' --wait`
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
