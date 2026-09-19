import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type ListEnvVarsResponse } from "../../../vibe-wire-types";
import { printEnvVarList } from "../_shared/print-env-var-list";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps env list` */
export function registerAppsEnvListCommand(env: Command, program: Command): Command {
  const leaf = env
    .command("list <appId>")
    .description("List an app's environment (all scopes), ordered by scope then name")
    .addHelpText(
      "after",
      `
One table, one row per name, because the app sees one environment. The
Source column says what backs each row:

  variable  A plaintext env var. Set and removed with the two verbs below.
  card      An access card imported into this app's environment. READ-ONLY
            here — see below.

Values are plaintext — secrets do NOT belong there (a separate secret-ref
surface lands with the Vault wiring). Long values are truncated in the
table; use --json for the full value.

A card row's value is a handle (nxc_…), not a secret: it is an address the
app resolves through the broker, which re-authorizes the app on every call.
The Status column is the one to read — only "active" projects, and every
other state makes the next deployment refuse that entry by name.

Cards are imported from the console, never from here, and that is the route's
shape rather than a missing feature: importing a card delegates a person's
credential authority, so the import route accepts no API key at all — and an
API key is the only credential this CLI holds.

Older servers do not report cards. They answer with variables only and this
table has no card rows, which is not the same as an app having no cards.

Examples:
  $ nexus apps env list 11111111-2222-4333-8444-555555555555
  $ nexus apps env list 11111111-2222-4333-8444-555555555555 --json | jq '.envVars[].name'
  $ nexus apps env list 11111111-2222-4333-8444-555555555555 --json | jq '.cardBindings[] | select(.status != "ACTIVE")'

Notes:
  THE Card COLUMN NAMES WHOSE AUTHORITY A CARD ROW CARRIES — the credential
  first, because that is what its owner recognises as theirs, then the access
  card that attenuates it. On a "variable" row it reads "—", which means the
  column DOES NOT APPLY, never that a card is missing or unset.
  THE Scope COLUMN IS ALL, PROD OR STAGING, and the table is sorted by it in the
  order the deployer resolves: ALL first, then the scope that overwrites it by
  name. A scope this CLI does not recognise sorts to the TOP rather than being
  buried in the middle. Which scope a deployment actually reads is on
  "nexus apps env set".`
    )
    .action(async (appId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<ListEnvVarsResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/env`
        });
        printEnvVarList(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
