import type { Command } from "commander";

import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type ExternalToolDetail } from "../../../vibe-wire-types";
import { VIBE_REGISTER_APP_AS_TOOL_CONTRACT } from "../../apps.contract.generated";
import { printRegisteredTool } from "../_shared/print-registered-tool";
import { resolveOpenApiSpec } from "../_shared/resolve-open-api-spec";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps register-as-tool` */
export function registerAppsRegisterAsToolCommand(apps: Command, program: Command): Command {
  const leaf = apps
    .command("register-as-tool <appId>")
    .description("Register a deployed Vibe app as a CUSTOM_MANIFEST agent tool")
    .option("--spec-file <path>", "Path to the app's OpenAPI spec file (JSON or YAML).")
    .option(
      "--spec <string>",
      "The app's OpenAPI spec inline, as a string. Alternative to --spec-file."
    )
    .option("--name <name>", "Override the registered tool's name. Default: the app's name.")
    .option("--description <text>", "Override the registered tool's description.")
    .addHelpText(
      "after",
      `
Notes:
DEPLOY FIRST. This is the last step of the flow, not a way to set one up: an app
with no healthy deployment is refused with a 409 saying exactly that, and it is
the first thing most people hit. Run "nexus apps deploy <appId>" and confirm
with "nexus apps deploy-state <appId>" before coming here.

The platform owns the tool's endpoint URL — it is the app's canonical
public URL (\`VibeApp.publicUrl\`), set server-side. You cannot point the
tool at an arbitrary host. Supply exactly one of --spec-file / --spec.

The app must not already be registered
(idempotent: a second call returns 409 with the existing tool id). Auth
defaults to none at v1 — a deployed Vibe app is reachable without extra
credentials; tighten per-app as Vault-backed secrets land.

Examples:
  $ nexus apps register-as-tool 11111111-2222-4333-8444-555555555555 --spec-file ./openapi.json
  $ nexus apps register-as-tool 11111111-2222-4333-8444-555555555555 --spec-file ./api.yaml --name "Orders API"
  $ nexus apps register-as-tool 11111111-2222-4333-8444-555555555555 --spec-file ./openapi.json --json | jq .id
`
    )
    .action(
      async (
        appId: string,
        cmdOpts: { specFile?: string; spec?: string; name?: string; description?: string }
      ) => {
        try {
          const openApiSpec = resolveOpenApiSpec(cmdOpts);
          const opts = resolveTenantOpts(program);
          const tool = await tenantRequest<ExternalToolDetail>(opts, {
            method: "POST",
            path: `/api/public/v1/vibe/apps/${encodeURIComponent(appId)}/register-as-tool`,
            body: {
              openApiSpec,
              name: cmdOpts.name,
              description: cmdOpts.description
            }
          });
          printRegisteredTool(tool);
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  // THE ONLY LEAF OF THIS NAMESPACE THE v1 CONTRACT DECLARES, and the split is a
  // property of the server rather than of this rollout: every other verb here
  // posts to the `/api/vibe/...` tenant surface, which `ZPublicApiV1` does not
  // declare, so there is nothing to derive for them. Bound here, immediately
  // after its own chain, because nothing else adds an option to this leaf — see
  // `bindCommand` on why the call must come last.
  bindCommand(leaf, VIBE_REGISTER_APP_AS_TOOL_CONTRACT);

  return leaf;
}
