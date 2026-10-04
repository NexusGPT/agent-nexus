import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { isJsonMode, printRecord, printSuccess } from "../../../output";
import { CHANNEL_WHATSAPP_TEMPLATE_CREATE_CONTRACT } from "../../channel.contract.generated";
import { resolveTemplateCreateInput } from "../_shared/resolve-template-create-input";
import { submitCreatedTemplateForApproval } from "../_shared/submit-created-template-for-approval";
import { TEMPLATE_CREATE_NOTES } from "../copy/template-create-notes";
import { addTemplateCreateOptions } from "./create.options";
/** `nexus channel whatsapp-template create` */
export function registerChannelWhatsappTemplateCreateCommand(
  waTemplate: Command,
  program: Command
): void {
  const waTemplateCreate = addTemplateCreateOptions(
    waTemplate.command("create").description("Create a WhatsApp message template")
  )
    .addHelpText("after", TEMPLATE_CREATE_NOTES)
    .action(async (opts) => {
      try {
        const input = resolveTemplateCreateInput(opts);
        if (input === undefined) return;

        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.createWhatsAppTemplate({
          connectionId: opts.connectionId,
          friendlyName: opts.friendlyName,
          language: opts.language,
          types: input.types,
          variables: input.variables
        });
        const data = result;
        // --submit turns ONE command into three terminal results — created,
        // submitted, and the poll's verdict — and each printed its own document
        // and its own prose. Under --json they concatenated into something no
        // parser accepts, on the flag that exists precisely so a script can do
        // the whole thing in one call. The human channel keeps its running
        // commentary; the script gets one document, assembled at the end.
        if (!isJsonMode()) {
          printRecord(data, [
            { key: "id", label: "ID" },
            { key: "friendly_name", label: "Friendly Name" },
            { key: "language", label: "Language" },
            { key: "created_at", label: "Created At" }
          ]);
          printSuccess("WhatsApp template created.");
        }

        let approval: Record<string, unknown> | undefined;

        // Auto-submit for approval if --submit
        if (opts.submit) {
          approval = await submitCreatedTemplateForApproval(client, opts, data);
        }

        if (isJsonMode()) {
          printRecord({ ...data, ...(approval === undefined ? {} : { approval }) });
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // BOTH ENUMS SIT INSIDE THE TWILIO TYPES OBJECT, one array element deep, and
  // `--body-file` supplies that object whole. There is no flag to give them: a
  // carousel carries one action type PER ACTION PER CARD, so a `--type` could
  // only ever set one of many.
  //
  // ⚠️ THIS LEAF'S `--body <text>` IS THE MESSAGE TEXT, NOT THE JSON BODY. The
  // JSON arrives through `--body-file`. Both reasons say `--body-file` for that
  // reason, and it is worth writing down: `contract-blocked-audit.ts` counts an
  // option merely NAMED `body` as reaching every `Body.*` path, so this leaf
  // read as reachable for a reason that was not the true one. A bodyOnly record
  // is matched by exact path, so these two are now proved rather than assumed.
  bindCommand(waTemplateCreate, CHANNEL_WHATSAPP_TEMPLATE_CREATE_CONTRACT, {
    "Body.types.twilio/call-to-action.actions[].type":
      "--body-file only; one type per action inside the call-to-action object",
    "Body.types.twilio/carousel.cards[].actions[].type":
      "--body-file only; one type per action per card inside the carousel object"
  });
}
