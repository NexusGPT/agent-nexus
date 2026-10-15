import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { printTable } from "../output";
import { AGENT_COLLECTION_LIST_CONTRACT } from "./agent-collection.contract.generated";
import { registerAttachOrDetach } from "./agent-collection/attach-or-detach.command";

export function registerAgentCollectionCommands(program: Command): void {
  const agentCollection = program
    .command("agent-collection")
    .description("Manage knowledge collections attached to agents");

  agentCollection.addHelpText(
    "after",
    `
THERE ARE TWO WAYS TO GIVE AN AGENT A COLLECTION AND THEY LAND IN DIFFERENT
PLACES. This namespace writes the agent-to-collection LINK — the Knowledge tab.
The tool the model sees is then auto-named "search_<collection name>", with the
name lowercased and every non-alphanumeric turned into an underscore, and you
control neither the name nor the usage instructions.
"nexus agent-tool attach-collection" (or "agent-tool create --type COLLECTION")
writes a TOOL CONFIG instead: it costs one more field and gives you --label and
--instructions, which is what tells the agent WHEN to search. A tool config for
a collection takes precedence over the auto-named one.
They are also read by different commands: a link shows in "agent-collection
list" and NOT in "agent-tool list", and a tool config the other way round. An
empty "agent-tool list" is not evidence the agent has no knowledge.`
  );

  const list = agentCollection
    .command("list")
    .description("List collections attached to an agent")
    .argument("<agent-id>", "Agent ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-collection list 11111111-1111-4111-8111-111111111111
  $ nexus agent-collection list 11111111-1111-4111-8111-111111111111 --json

Notes:
  Unpaginated, and --json is a BARE ARRAY with no envelope and no meta.
  This lists LINKS ONLY. A collection reachable through an "agent-tool" config
  is not here — see the note on the namespace above.`
    )
    .action(async (agentId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const collections = await client.agentCollections.list(agentId);
        printTable(Array.isArray(collections) ? collections : [], [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "displayName", label: "DISPLAY", width: 25 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  registerAttachOrDetach(program, agentCollection, {
    verb: "attach",
    description: "Attach collections to an agent",
    done: "Collections attached.",
    call: (client, agentId, body) => client.agentCollections.attach(agentId, body)
  });
  registerAttachOrDetach(program, agentCollection, {
    verb: "detach",
    description: "Detach collections from an agent",
    done: "Collections detached.",
    call: (client, agentId, body) => client.agentCollections.detach(agentId, body)
  });

  // Bound LAST, after every option exists — see `bindCommand`. `attach` and
  // `detach` reach routes the v1 contract does not declare, so only `list` binds.
  bindCommand(list, AGENT_COLLECTION_LIST_CONTRACT);
}
