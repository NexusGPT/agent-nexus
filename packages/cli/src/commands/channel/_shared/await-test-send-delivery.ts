import type { NexusClient } from "@agent-nexus/sdk";

import { isJsonMode } from "../../../output";
import {
  awaitDeliveryOutcome,
  type DeliveryOutcome,
  isDeliveryTerminal
} from "../template-test-send.await-delivery";
import { renderDeliveryOutcome } from "../template-test-send.delivery.render";
import { applyDeliveryVerdictExitCode } from "../template-test-send.exit-category";
import { applyWaitExitCode } from "../template-wait.exit-category";
import { emitPartialThenRethrow } from "./emit-partial-then-rethrow";

/**
 * The `--wait` branch of `nexus channel whatsapp-template test-send`, lifted out
 * of the action verbatim. The caller keeps the `if (opts.wait)` test.
 */
export async function awaitTestSendDelivery(
  client: NexusClient,
  opts: { connectionId: string },
  data: { messageSid: string; status: string }
): Promise<DeliveryOutcome | undefined> {
  let delivery: DeliveryOutcome | undefined;
  try {
    if (!isJsonMode()) console.log("Polling delivery status...");

    delivery = await awaitDeliveryOutcome(
      () =>
        client.channels.getTestSendStatus(data.messageSid, {
          connectionId: opts.connectionId
        }),
      data.status
    );

    if (!isJsonMode()) renderDeliveryOutcome(delivery);
    // A BILLED, UNDELIVERED SEND IS `outcome-not-reached`, NOT A BARE
    // `1` — the last such site in this file.
    // `template-test-send.exit-category.ts` owns the category, and owns
    // why the old `observedTerminal &&` guard was a hole.
    applyDeliveryVerdictExitCode(delivery.status);
    // And the timeout, from the same rule `submit-approval --wait` uses:
    // giving up with the message still moving exited 0, which read as
    // delivered.
    applyWaitExitCode({ waited: true, settled: isDeliveryTerminal(delivery.status) });
  } catch (pollError) {
    // The message WAS sent, and it was billed. Its sid survives the poll.
    emitPartialThenRethrow(data, "delivery-poll", pollError);
  }
  return delivery;
}
