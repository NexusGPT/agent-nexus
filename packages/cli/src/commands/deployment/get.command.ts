import type { Command } from "commander";

import { createClient } from "../../client";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/** `nexus deployment get` */
export function registerDeploymentGetCommand(deployment: Command, program: Command): void {
  deployment
    .command("get")
    .description("Get deployment details")
    .argument("<id>", "Deployment ID (UUID)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment get 11111111-1111-4111-8111-111111111111
  $ nexus deployment get 11111111-1111-4111-8111-111111111111 --json

Notes:
  The only command that returns settings — list omits it. Read it before any
  update, because that update merges ONE level deep (see update's notes).
  A 404 here is also what a member key gets for a deployment somebody else
  created; it does not distinguish "not yours" from "not there".
  connectionStatus tracks OAuth token health. For GMAIL and OUTLOOK it is
  inboundWebhook.status that decides whether mail actually arrives — anything
  but ACTIVE means the agent is receiving nothing.

  null ON EITHER FIELD IS "THIS CHANNEL BINDS NONE", NEVER A FAULT.
  connectionStatus reads the OAuth connection and falls back to the API-key
  connection, so it is null exactly when the deployment holds neither — EMBED,
  API, TELEGRAM and the Office add-ins all report null and work.
  inboundWebhook is null on every type except GMAIL and OUTLOOK, the only two
  with a push subscription; NOT_CONFIGURED is the different fact that one of
  those two has a connection and no watch on it.
  dashboardUrl IS ADDED BY THIS CLI AND IS NOT AN API FIELD. It is this
  deployment's page, so nothing has to assemble a URL from a path pattern that
  can be renamed underneath it.`
    )
    .action(async (id: string) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const dep = await client.deployments.get(id);
        printRecord({ ...dep, dashboardUrl: dashboardUrlFor("deployment", dep.id, globals) }, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
          { key: "isActive", label: "Active", format: (v) => (v ? "yes" : "no") },
          { key: "agentId", label: "Agent ID" },
          { key: "description", label: "Description" },
          { key: "createdAt", label: "Created" },
          { key: "dashboardUrl", label: "Dashboard" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
