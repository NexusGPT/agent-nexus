import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type GetVibeAppLogsResponse } from "../../../vibe-wire-types";
import {
  type AppLogsFlags,
  emitLogLines,
  orderForDisplay,
  resolveAppLogsRequest,
  runAppLogsFollow,
  toLogQuery,
  VIBE_LOG_CLI_DEFAULT_SINCE,
  VIBE_LOG_CLI_LIMIT_HELP
} from "../../apps-logs";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps logs` */
export function registerAppsLogsCommand(apps: Command, program: Command): Command {
  const leaf = apps
    .command("logs <appId>")
    .description("Read a deployed app's runtime logs, and optionally follow them")
    .option(
      "--since <when>",
      `How far back to read: a duration (45s, 30m, 1h, 2d) or an ISO-8601 instant. Default ${VIBE_LOG_CLI_DEFAULT_SINCE}.`
    )
    .option("--until <when>", "Stop at this instant. Same grammar as --since. Default: now.")
    .option("--color <slot>", "Restrict to one deployment slot: blue or green. Default: both.")
    .option(
      "--grep <text>",
      "Keep only lines containing this LITERAL substring. Never a regular expression."
    )
    .option("--limit <n>", VIBE_LOG_CLI_LIMIT_HELP)
    .option("-f, --follow", "Keep the connection open and print lines as they arrive.")
    .addHelpText(
      "after",
      `
Notes:
Reads what the DEPLOYED app printed — application output, not build output. For
a build log, use \`nexus apps deployments get <appId> <deploymentId>\`.

Lines print oldest-first, so time runs down the screen and a --follow continues
the same chronology.

--grep is a LITERAL substring and is never compiled as a pattern. \`--grep 'a.b'\`
matches the three characters a, dot, b — it does not match "axb".

--json emits NDJSON — ONE OBJECT PER LINE, never a JSON array — in both modes.
An array's closing bracket only exists once the stream ends, so
\`--follow --json | jq\` would hang forever on one. The shape does not change
under you depending on which flags you passed.

--follow and --until are mutually exclusive: a follow runs until you stop it.
Ctrl-C ends one cleanly and exits 0.

A SECOND SIGNAL STOPS IT AT ONCE AND EXITS 130, and it is the second signal of
EITHER kind, not the second Ctrl-C. One counter serves SIGINT and SIGTERM, so a
Ctrl-C followed by a supervisor's SIGTERM reaches it \u2014 the ordinary shape of a
shutdown \u2014 and so does a SIGTERM pair, which still reports 130 rather than 143.

Examples:
  $ nexus apps logs 11111111-2222-4333-8444-555555555555
  $ nexus apps logs <appId> --since 15m --color green
  $ nexus apps logs <appId> --grep 'POST /webhook' --limit 500
  $ nexus --json apps logs <appId> --follow | jq -r '.message'
`
    )
    .action(async (appId: string, cmdOpts: AppLogsFlags) => {
      try {
        const opts = resolveTenantOpts(program);
        const request = resolveAppLogsRequest(cmdOpts, Date.now());

        if (request.follow) {
          process.exitCode = await runAppLogsFollow(opts, appId, request);
          return;
        }

        const data = await tenantRequest<GetVibeAppLogsResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/logs`,
          query: toLogQuery(request)
        });
        emitLogLines(orderForDisplay(data.lines));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
