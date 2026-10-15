import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { addPaginationOptions, getPaginationParams } from "../../util/pagination";
import { VERSION_LIST__PARAMS_TYPE, VERSION_LIST_CONTRACT } from "../version.contract.generated";

const LIST_HELP = `
Examples:
  $ nexus version list 11111111-1111-4111-8111-111111111111
  $ nexus version list 11111111-1111-4111-8111-111111111111 --type CHECKPOINT
  $ nexus version list 11111111-1111-4111-8111-111111111111 --limit 5 --json

Notes:
  PROD=yes MARKS THE VERSION THE AGENT ACTUALLY RUNS. No row saying yes means
  the agent has never published and is running its draft, which appears in no
  version list at all — read it with "nexus agent get <agent-id>".
  NO PROMPTS HERE. The list carries names and types only; the prompt text is
  returned by "nexus version get" and nothing else.
  Newest first, and paginated — the default page is 20, so PROD=yes can be on
  page 2. --type CHECKPOINT is the usual filter; AUTO rows accumulate on every
  prompt change and are the bulk of the list.
  ONE PROMPT WRITE PRODUCES TWO ROWS. "agent update --prompt" files the OUTGOING
  draft as an AUTO row and the new text as a CHECKPOINT, so the list grows by
  two per edit rather than one. Counting rows is not counting edits, and a list
  that jumped by more than you expected is this, not a duplicate write.
  meta CARRIES total, page AND paging — there is no checkpointCount. To count
  the checkpoints, ask for them and read the total:
  "nexus version list <agent-id> --type CHECKPOINT --json" -> meta.total.
  An agent id your key cannot see answers 404, the same as one that does not
  exist.`;

/** `nexus version list` */
export function registerVersionListCommand(version: Command, program: Command): void {
  const list = addPaginationOptions(
    version
      .command("list")
      .description("List prompt versions for an agent")
      .argument("<agent-id>", "Agent ID")
      // The values are NOT repeated in the description: commander prints
      // `(choices: …)` from the generated list, and a second hand-typed copy is
      // a second thing to go stale.
      .addOption(enumOption("--type <type>", "Filter by type", VERSION_LIST__PARAMS_TYPE))
      .addHelpText("after", LIST_HELP)
  );

  list.action(async (agentId: string, opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.agents.versions.list(agentId, {
        ...getPaginationParams(opts),
        type: opts.type
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "name", label: "NAME", width: 25 },
        { key: "type", label: "TYPE", width: 12 },
        { key: "isProduction", label: "PROD", width: 6, format: (v) => (v ? "yes" : "no") },
        { key: "createdAt", label: "CREATED", width: 20 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // Bound LAST, after every option exists — including the pagination flags
  // `addPaginationOptions` adds. `bindCommand` renders its block from the
  // command's own options, so anything added afterwards is invisible to it.
  bindCommand(list, VERSION_LIST_CONTRACT);
}
