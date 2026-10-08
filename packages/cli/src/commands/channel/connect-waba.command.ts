import type { Command } from "commander";

import { resolveDashboardHost } from "../../dashboard-host";
import { handleError } from "../../errors";
import { color, isJsonMode, printSuccess } from "../../output";
import { openUrl } from "../../util/open-url";

/** `nexus channel connect-waba` */
export function registerChannelConnectWabaCommand(channel: Command, program: Command): void {
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
        const globals = program.optsWithGlobals();
        const dashboardUrl = resolveDashboardHost(globals);
        const url = `${dashboardUrl}/app/connect-waba`;
        // The url is the only thing worth having here, and it was reachable ONLY
        // by reading four lines of prose off stdout. On a machine with no
        // browser — which the Notes above say is the normal case — that made the
        // one usable output unparseable.
        if (isJsonMode()) {
          printSuccess("Opened the Connect-with-Meta flow. Finish it in a browser.", {
            url,
            verifyWith: "nexus channel setup --type WHATSAPP"
          });
        } else {
          console.log(`Opening ${color.cyan(url)} ...`);
          console.log("");
          console.log('Complete the "Connect with Meta" flow in your browser, then verify:');
          console.log(`  ${color.dim("nexus channel setup --type WHATSAPP")}`);
        }
        openUrl(url);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
