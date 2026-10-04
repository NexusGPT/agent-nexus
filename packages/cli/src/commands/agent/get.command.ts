import type { Command } from "commander";

import { createClient } from "../../client";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/** `nexus agent get` */
export function registerAgentGetCommand(agent: Command, program: Command): void {
  agent
    .command("get")
    .description("Get agent details")
    .argument("<id>", "Agent ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent get 11111111-1111-4111-8111-111111111111
  $ nexus agent get 11111111-1111-4111-8111-111111111111 --json

Notes:
  The system prompt is at top-level .prompt, and is null until a version has
  been published. The table above never shows it — use --json.
  .prompt IS THE DRAFT, NOT WHAT THE AGENT RUNS. A published agent serves its
  production version, so after "nexus version restore" this field changes and
  the running agent does not. "nexus version --help" owns that distinction.
  .prompt IS NOT BARE MARKDOWN. Your text arrives wrapped in Nexus section
  directives — a "::: section: name=…" line, then a "::: tab: NEXUS :::" line,
  then the text. Feeding that whole string straight back to
  "nexus agent update --prompt" round-trips it: the wrapper is not applied a
  second time. Strip the directives only if you want the sections gone.
  MODEL reads "DEFAULT", not null, on an agent that was never given one — a
  "model === null" test never fires. modelConfig.modelName and
  modelConfig.modelProvider are the model in use, mirrored at top level as
  modelName / modelProvider.
  modelConfig itself reads null whenever the stored config is missing either
  modelName or modelProvider, because half a config cannot be published — the
  top-level mirrors still answer, so read those before concluding "no model".
  modelConfig.customModelId IS THE ONLY PLACE A CUSTOM MODEL SHOWS UP, and it is
  --json only. Present means the agent runs that endpoint and modelName /
  modelProvider are the fallback, so MODEL and the two mirrors all describe a
  model this agent is not using. Absent means it runs the platform model named.
  --json also carries bio, tags, gender and playgroundFirstMessage, which the
  table omits.
  dashboardUrl IS ADDED BY THIS CLI AND IS NOT AN API FIELD. It is the page for
  this agent, so a script never has to assemble one from a path pattern that
  can be renamed underneath it. The skills tab is the same URL with
  /tabs/skills in place of /tabs/prompt.`
    )
    .action(async (id: string) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const agent = await client.agents.get(id);
        printRecord({ ...agent, dashboardUrl: dashboardUrlFor("agent", agent.id, globals) }, [
          { key: "id", label: "ID" },
          { key: "firstName", label: "First Name" },
          { key: "lastName", label: "Last Name" },
          { key: "role", label: "Role" },
          { key: "status", label: "Status" },
          { key: "model", label: "Model" },
          { key: "createdAt", label: "Created" },
          { key: "dashboardUrl", label: "Dashboard" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
