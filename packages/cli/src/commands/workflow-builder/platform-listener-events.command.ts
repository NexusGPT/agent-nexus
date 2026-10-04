import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printList } from "../../output";

/** `nexus workflow platform-listener-events` */
export function registerWorkflowPlatformListenerEventsCommand(
  workflow: Command,
  program: Command
): void {
  workflow
    .command("platform-listener-events")
    .description("List event types a platformListenerTrigger can subscribe to")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow platform-listener-events
  $ nexus workflow platform-listener-events --json
  $ nexus workflow platform-listener-events --json | jq '.events[] | select(.eventType=="conversation.idle")'

Notes:
  Use the eventType as 'platformEventType' on a platformListenerTrigger node.
  THE TABLE PRINTS 3 OF THE 6 FIELDS A ROW CARRIES. eventType, category and label
  are the columns; description, filterFields and samplePayload are --json only,
  and they are the three you actually need to author a subscription.
  filterFields enumerates the valid keys and operators for the trigger's
  filters.conditions[], so a filtered subscription needs no source reading.
  samplePayload mirrors what the workflow receives at fire time.
  THIS LISTING IS ALREADY FILTERED. Events marked comingSoon are dropped
  server-side and never appear, because subscribing to one that emits nothing
  would fail silently at run time rather than at subscribe time.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.listPlatformListenerEvents();
        printList(result.events, undefined, [
          { key: "eventType", label: "EVENT", width: 36 },
          { key: "category", label: "CATEGORY", width: 18 },
          { key: "label", label: "LABEL", width: 36 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
