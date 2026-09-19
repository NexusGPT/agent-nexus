import type { Command } from "commander";

import { handleError } from "../../../errors";
import { color } from "../../../output";
import { tenantRequest } from "../../../util/tenant-http";
import { type CreateVibeAppResponse } from "../../../vibe-wire-types";
import { printVibeApp } from "../_shared/print-vibe-app";
import { resolveAppName } from "../_shared/resolve-app-name";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps create` */
export function registerAppsCreateCommand(apps: Command, program: Command): Command {
  const leaf = apps
    .command("create <name>")
    .description("Create a new Vibe app")
    .option("--description <text>", "Optional app description.")
    .option(
      "--public",
      "Make the app browser-reachable (no per-app edge-auth token). Default is private — reachable only via agent tool calls."
    )
    .addHelpText(
      "after",
      `
The name is the app's org-unique handle and must be a DNS label: start
with a lowercase letter, then lowercase letters / digits / hyphens, ≤ 63
chars (it backs the app's subdomain). The canonical public URL and the
default deploy branch (main) are stamped server-side at creation.

Visibility (default PRIVATE): a private app carries a per-app edge-auth
token, so its URL is reachable only by callers that send the token — the
platform injects it on agent tool calls, so private apps are agent-tool-only.
--public skips the token, so anyone with the URL reaches the app (a
browser-viewable site / dashboard / docs / public webhook — no app auth).

If a git project already goes by this name, the app is still created and a
warning names it: "provision-repo" mints a project named after the app, so it
would conflict on that name — use "attach-repo" to point the app at the
project that already exists.

Examples:
  $ nexus apps create stripe-handler
  $ nexus apps create orders-api --description "Order webhook handler"
  $ nexus apps create landing --public

Notes:
  THAT WARNING GOES TO STDERR, AND --json DOES NOT SUPPRESS IT. stdout stays the
  bare app object a jq consumer pipes, so the collision line rides the other
  stream rather than corrupting it. A script capturing stdout alone loses the
  warning in silence, and so does a "2>&1 | head" whose window the app table
  fills first. Capture stderr on its own, or find the project again with
  "nexus apps git-project list".
`
    )
    .action(async (name: string, cmdOpts: { description?: string; public?: boolean }) => {
      try {
        const appName = resolveAppName(name);
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<CreateVibeAppResponse>(opts, {
          method: "POST",
          path: "/api/vibe/apps",
          body: {
            name: appName,
            description: cmdOpts.description,
            visibility: cmdOpts.public ? "PUBLIC" : "PRIVATE"
          }
        });
        printVibeApp(data.app);
        // The app was created; this is the collision the operator would
        // otherwise meet several commands later as a bare `provision-repo` 409.
        //
        // stderr, and unguarded by `isJsonMode()`, on purpose: stdout stays the
        // bare app object a `--json` caller pipes into jq, while a human sees
        // the warning either way. Writing it to stdout would corrupt that JSON.
        if (data.gitProjectNameCollision) {
          const p = data.gitProjectNameCollision;
          console.error(
            color.yellow(
              `A git project named "${p.name}" (${p.status}) already exists in this organization.\n` +
                `"provision-repo" mints a project named after the app, so it will conflict on that name. ` +
                `Attach the existing one instead:\n  nexus apps attach-repo ${data.app.id} ${p.id}`
            )
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
