import type { Command } from "commander";

import { handleError } from "../../../errors";
import { isJsonMode } from "../../../output";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";
import { applyAppVisibility } from "./visibility.handler";
import { renderVisibilityChange } from "./visibility.render";

/** `nexus apps visibility` */
export function registerAppsVisibilityCommand(apps: Command, program: Command): Command {
  const leaf = apps
    .command("visibility <appId> <mode>")
    .description("Set who may reach a deployed app: public (anyone) or private (identity required)")
    .addHelpText(
      "after",
      `
Notes:
private requires an identity on every request: an agent tool call carries
the app's edge token automatically, and a person is sent to sign in with
Nexus and admitted if the app's access list allows them. An API client with
neither gets a 401 — never a silent 404.

public requires nothing at all. Anyone with the URL opens the app, and the
app's access list stops gating anything until it is private again.

Going private mints a FRESH edge token, so a tool already registered against
this app keeps sending the old one and starts failing at the edge. Repair it
by re-pointing that tool's auth ("external-tool update-auth"), NOT with
"register-as-tool" — that refuses an app which already has a linked tool.

Re-asserting the visibility an app already has is a no-op: no token is
minted and nothing is re-published.

Examples:
  $ nexus apps visibility 11111111-2222-4333-8444-555555555555 public
  $ nexus apps visibility 11111111-2222-4333-8444-555555555555 private
`
    )
    .action(async (appId: string, mode: string) => {
      try {
        // Validated here rather than sent on: a typo would otherwise reach the
        // server as a 400 whose message is about a Zod enum, when the real
        // answer is the two words this command accepts.
        const normalized = mode.trim().toLowerCase();
        if (normalized !== "public" && normalized !== "private") {
          throw new Error(`Visibility must be "public" or "private", got "${mode}".`);
        }

        const target = normalized === "public" ? "PUBLIC" : "PRIVATE";
        const opts = resolveTenantOpts(program);
        const outcome = await applyAppVisibility(opts, appId, target);

        if (isJsonMode()) {
          console.log(JSON.stringify(outcome.data, null, 2));
          return;
        }

        renderVisibilityChange(appId, normalized, target, outcome);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
