import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { SKILLS_GET_EXTERNAL_TOOL_CONTRACT } from "../external-tool.contract.generated";

const GET_HELP = `
Examples:
  $ nexus external-tool get 11111111-1111-4111-8111-111111111111
  $ nexus external-tool get 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE STORED openApiSpec IS NOT RETURNED — not here and not by the REST route.
  KEEP YOUR OWN COPY: "update-spec" overwrites it and there is no baseline to
  roll back to.
  NEITHER ARE THE OPERATION IDS. --json carries actionsCount, a number, and no
  action list — so this command cannot tell you what to pass to
  "external-tool test --operation-id" or "execute --action". Read them from
  your spec.
  actionsCount is what the spec parsed to at create/refresh time, not a
  liveness check. "external-tool test" is the liveness check.
  dashboardUrl IS ADDED BY THIS CLI AND IS NOT AN API FIELD. It is this tool's
  page, so nothing has to assemble a URL from a path pattern that can be
  renamed underneath it.`;

/** `nexus external-tool get` */
export function registerExternalToolGetCommand(externalTool: Command, program: Command): Command {
  const leaf = externalTool
    .command("get")
    .description("Get external tool details")
    .argument("<id>", "External tool ID")
    .addHelpText("after", GET_HELP)
    .action(async (id: string) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const t = await client.skills.getExternalTool(id);
        printRecord({ ...t, dashboardUrl: dashboardUrlFor("externalTool", t.id, globals) }, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "endpointUrl", label: "Endpoint URL" },
          { key: "createdAt", label: "Created" },
          { key: "dashboardUrl", label: "Dashboard" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, SKILLS_GET_EXTERNAL_TOOL_CONTRACT);
  return leaf;
}
