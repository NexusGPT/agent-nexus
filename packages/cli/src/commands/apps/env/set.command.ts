import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type UpsertEnvVarResponse, VIBE_ENV_VAR_SCOPES } from "../../../vibe-wire-types";
import { parseEnvAssignment } from "../_shared/parse-env-assignment";
import { printEnvVar } from "../_shared/print-env-var";
import { resolveEnvScope } from "../_shared/resolve-env-scope";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps env set` */
export function registerAppsEnvSetCommand(env: Command, program: Command): Command {
  const leaf = env
    .command("set <appId> <assignment>")
    .description("Set (upsert) an env var, given as NAME=VALUE")
    .option("--scope <scope>", `Scope: ${VIBE_ENV_VAR_SCOPES.join(", ")}. Default ALL.`)
    .addHelpText(
      "after",
      `
Upsert semantics: a fresh (scope, NAME) is created, an existing one is
overwritten. NAME must be SCREAMING_SNAKE_CASE (A-Z, 0-9, underscore).
The value is everything after the first '=', so it may itself contain
'=' and may be empty (NAME= sets an empty value).

Notes:
  ⚠️ THE SCOPE IS PART OF THE KEY, SO THE SAME NAME CAN EXIST TWICE AND NEITHER
  ROW OVERWRITES THE OTHER. Setting DATABASE_URL at ALL and again at PROD leaves
  two rows, both stored, and "env list" prints both without marking which one
  wins.
  WHAT THE RUNNING APP READS IS ALL UNION PROD, WITH PROD WINNING ON A NAME
  COLLISION — AND STAGING REACHES NOTHING. The projection takes every ALL row,
  lets every PROD row overwrite by name, and drops STAGING entirely, so a
  STAGING row is set, visible in "env list", and read by no deployment. The tell
  is a value that never takes effect while the table shows it plainly.
  Keep each NAME at exactly ONE scope anyway: ALL for a value that never varies,
  PROD for one that does. Two rows for one name is legal, resolvable and
  unreadable at a glance — delete the loser with "apps env rm".

Examples:
  $ nexus apps env set 11111111-2222-4333-8444-555555555555 LOG_LEVEL=debug
  $ nexus apps env set 11111111-2222-4333-8444-555555555555 DATABASE_URL=postgres://… --scope PROD
  $ nexus apps env set 11111111-2222-4333-8444-555555555555 FEATURE_OFF=
`
    )
    .action(async (appId: string, assignment: string, cmdOpts: { scope?: string }) => {
      try {
        const { name, value } = parseEnvAssignment(assignment);
        const scope = resolveEnvScope(cmdOpts.scope);
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<UpsertEnvVarResponse>(opts, {
          method: "POST",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/env`,
          body: scope ? { name, value, scope } : { name, value }
        });
        printEnvVar(data.envVar);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
