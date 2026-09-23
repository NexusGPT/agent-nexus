import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError, refuse } from "../../errors";
import { printSuccess } from "../../output";
import {
  extractSpecBreakingChangeDetails,
  reportSpecBreakingChange
} from "./spec-breaking-change.report";
import { resolveSpecString } from "./update-spec.resolve-spec-string";

const UPDATE_SPEC_HELP = `
Re-parses the spec and rebuilds the action list on the EXISTING tool, preserving
its toolId, auth, credentials, icon, and downstream wiring (workflow nodes +
agent attachments). PATCH path: /skills/external-tools/{id}

If the refresh would drop or rename an action key still bound by a workflow node
or agent tool config, it is rejected — re-run with --force to override.

Examples:
  $ nexus external-tool update-spec 11111111-1111-4111-8111-111111111111 --file openapi.yaml
  $ nexus external-tool update-spec 11111111-1111-4111-8111-111111111111 --file openapi.json --json
  $ nexus external-tool update-spec 11111111-1111-4111-8111-111111111111 --body '{"openApiSpec":"openapi: 3.0.0\\n..."}'
  $ nexus external-tool update-spec 11111111-1111-4111-8111-111111111111 --file openapi.yaml --force
  $ cat openapi.yaml | nexus external-tool update-spec 11111111-1111-4111-8111-111111111111 --file -

Notes:
  THIS OVERWRITES THE ONLY STORED COPY OF THE SPEC, and "external-tool get"
  does not return it — so there is no rollback baseline unless you kept one.
  Keep the previous file.

  THE ACTION LIST IS REBUILT FROM THE NEW SPEC. An operation the new spec drops
  stops existing; the guard only refuses when a dropped key is still BOUND by a
  workflow node or agent tool config. An unbound action disappears silently.

  DECLARE requestBody FOR EVERY WRITE OPERATION. An operation with no
  requestBody parses to no body fields, so the call goes out bodyless, returns
  200 and persists NOTHING — the refresh is where that regression is introduced.

  --force is not "retry harder": it refreshes anyway and leaves every downstream
  node bound to a removed action to be repointed by hand.

  THE RESPONSE DOES NOT SAY WHAT CHANGED. It prints {id, name} — the same two
  fields whether the refresh added twelve actions, removed one, or parsed to
  exactly what was there before. Re-read actionsCount with
  "nexus external-tool get <id>" and compare it against what you had; that
  number is the only readable evidence the rebuild did anything.`;

/**
 * `nexus external-tool update-spec`
 *
 * UNBOUND ON PURPOSE: this reaches a route the v1 contract does not declare.
 */
export function registerExternalToolUpdateSpecCommand(
  externalTool: Command,
  program: Command
): Command {
  const leaf = externalTool
    .command("update-spec")
    .description("Refresh an external tool's OpenAPI spec without recreating it")
    .argument("<id>", "External tool ID")
    .option("--file <path>", "Path to the OpenAPI spec file (JSON or YAML)")
    .option(
      "--body <json>",
      "Spec inline as '{\"openApiSpec\":\"...\"}' (JSON, .json file, or '-' for stdin)"
    )
    .option(
      "--force",
      "Override the breaking-change guard (refresh even if it drops/renames a bound action key)"
    )
    .addHelpText("after", UPDATE_SPEC_HELP)
    .action(async (id: string, opts) => {
      try {
        const openApiSpec = await resolveSpecString(opts);
        if (openApiSpec === null) {
          process.exitCode = refuse(
            "provide the spec via --file <path> or --body '{\"openApiSpec\":...}'"
          );
          return;
        }

        const client = createClient(program.optsWithGlobals());
        const t = await client.skills.updateExternalTool(
          id,
          { openApiSpec },
          { force: !!opts.force }
        );
        printSuccess("External tool spec refreshed.", { id: t.id, name: t.name });
      } catch (err) {
        const breaking = extractSpecBreakingChangeDetails(err);
        if (breaking) {
          process.exitCode = reportSpecBreakingChange(breaking);
          return;
        }
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
