import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { isJsonMode, printRecord, printSuccess, printTable } from "../../output";
import {
  CHANNEL_SETUP_AUTO_PROVISION__BODY_REGION,
  CHANNEL_SETUP_AUTO_PROVISION__BODY_TYPE,
  CHANNEL_SETUP_AUTO_PROVISION_CONTRACT
} from "../channel.contract.generated";
import { reportChannelSetupNotReady } from "./_shared/report-setup-not-ready";
import { SETUP_STEP_COLUMNS } from "./_shared/setup-step-columns";
import { SETUP_NOTES } from "./copy/setup-notes";

/** `nexus channel setup` */
export function registerChannelSetupCommand(channel: Command, program: Command): void {
  //
  // Bound to `ChannelSetupAutoProvision`, the --auto branch. Without --auto the
  // same leaf reads `ChannelSetupGet`, whose only enum is the SAME deployment
  // type with the SAME values, so one binding describes both branches truthfully.
  const setup = channel
    .command("setup")
    .description("Check or auto-provision channel setup prerequisites")
    .addOption(
      enumOption(
        "--type <type>",
        "Deployment type",
        CHANNEL_SETUP_AUTO_PROVISION__BODY_TYPE
      ).makeOptionMandatory()
    )
    .option("--auto", "Auto-provision what is possible (e.g., create messaging connection)")
    .addOption(
      enumOption(
        "--region <region>",
        "Region for auto-provisioning",
        CHANNEL_SETUP_AUTO_PROVISION__BODY_REGION
      ).default("us1")
    )
    .addHelpText("after", SETUP_NOTES)
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
        if (!data.ready) {
          // The assignment stays HERE, governed by `!data.ready` — the helper's
          // docblock owns why moving it into the helper reds a gate.
          process.exitCode = reportChannelSetupNotReady(data, String(opts.type));
          return;
        }
        if (isJsonMode()) {
          // ONE document, and it carries the VERDICT — not only the steps.
          //
          // 🚨 A PRINTER PAIR LOSES THE HALF THAT MATTERS, AND STILL LOOKS RIGHT.
          // `printTable(data.steps)` then `printSuccess(...)` writes the steps
          // and then the verdict, and `emitDocument`'s first-wins rule gives
          // stdout to the steps and sends the verdict to STDERR. Nothing is
          // unparseable and nothing errors; a script simply never sees `ready`,
          // and the one fact this command exists to answer is on the channel
          // scripts do not read.
          //
          // The response has carried `ready` all along — this printer dropped
          // it. So JSON mode emits the response, and the human mode below keeps
          // the table plus the sentence that says the same thing.
          printRecord({ type: data.type, ready: data.ready, steps: data.steps });
        } else {
          printTable(data.steps, SETUP_STEP_COLUMNS);
          // `data.ready` is TRUE by construction here — the false arm returned
          // above — so the condition that used to guard this line is gone rather
          // than kept as a second, weaker copy of the same test.
          printSuccess("All prerequisites met. Ready to create deployment.");
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(setup, CHANNEL_SETUP_AUTO_PROVISION_CONTRACT);
}
