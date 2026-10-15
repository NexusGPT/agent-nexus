import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

const GET_HELP = `
Examples:
  $ nexus version get 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus version get 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --json

Notes:
  THIS IS THE ONLY WAY TO READ AN OLD VERSION'S PROMPT — "version list" omits it
  entirely. It is not the only source of A prompt: "agent get" returns the
  agent's current DRAFT at .prompt, and "version restore" returns the text it
  restored. Use this one when you want a specific historical version.
  THE PROMPT IS NEXUS SECTION MARKUP, NOT PLAIN MARKDOWN. It comes back wrapped
  in "::: section: ... :::" and "::: tab: ... :::" directives that carry the
  prompt's structure. Feed it back into "nexus agent update --prompt" verbatim —
  that round-trip is exact and does not double-wrap. Do NOT strip the
  directives, and do not expect prose you can diff against hand-written
  markdown.
  Production is a fact about the AGENT, not about the row: this prints
  Production yes/no by comparing the version to the agent's current published
  one, so the same version can read yes today and no tomorrow.
  A version id belonging to a different agent answers 404 even when it exists.`;

/** `nexus version get` */
export function registerVersionGetCommand(version: Command, program: Command): void {
  version
    .command("get")
    .description("Get version details with full prompt")
    .argument("<agent-id>", "Agent ID")
    .argument("<version-id>", "Version ID")
    .addHelpText("after", GET_HELP)
    .action(async (agentId: string, versionId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const ver = await client.agents.versions.get(agentId, versionId);
        printRecord(ver, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
          { key: "isProduction", label: "Production", format: (v) => (v ? "yes" : "no") },
          { key: "prompt", label: "Prompt" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
