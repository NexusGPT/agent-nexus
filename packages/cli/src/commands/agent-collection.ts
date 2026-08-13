import type { AttachAgentCollectionsBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { printSuccess, printTable } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { AGENT_COLLECTION_LIST_CONTRACT } from "./agent-collection.contract.generated";

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
  $ nexus agent-collection list agt-123
  $ nexus agent-collection list agt-123 --json

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

type AgentCollectionsClient = ReturnType<typeof createClient>;

interface AttachOrDetach {
  verb: "attach" | "detach";
  description: string;
  done: string;
  /**
   * The SDK call, written out at the CALL SITE rather than reached as
   * `client.agentCollections[verb]`.
   *
   * `sdk-methods-reach-the-cli.test.ts` scans this package for literal
   * `<resource>.<method>(` call sites and fails when an SDK method has none —
   * a shipped endpoint no command can reach. A computed member access is
   * invisible to it, so factoring these two commands together with `[verb]`
   * made both methods read as unreachable and turned a working guard red while
   * the commands themselves still worked. Sharing the declaration is worth
   * doing; sharing it in a way the guard cannot see is not.
   */
  call: (
    client: AgentCollectionsClient,
    agentId: string,
    body: AttachAgentCollectionsBody
  ) => Promise<unknown>;
}

/**
 * `attach` and `detach` differ by one SDK method and one word of copy, so they
 * are one declaration. They also share the trap below, and a trap fixed in one
 * copy of two is a trap.
 */
function registerAttachOrDetach(
  program: Command,
  agentCollection: Command,
  { verb, description, done, call }: AttachOrDetach
): void {
  agentCollection
    .command(verb)
    .description(description)
    .argument("<agent-id>", "Agent ID")
    .requiredOption("--collection-ids <ids>", "Comma-separated collection IDs")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-collection ${verb} agt-123 --collection-ids 3c2b1a09-8f7e-4d6c-9b4a-39281706f5e4
  $ nexus agent-collection ${verb} agt-123 --collection-ids id-one,id-two
  $ nexus agent-collection ${verb} agt-123 --body '{"collectionIds":["id-one","id-two"]}'

Notes:
  THE BATCH IS ALL-OR-NOTHING. One id the organization does not hold, or that
  your Role cannot see, rejects the WHOLE call with a 404 that names no id — the
  valid ids in the same call are not ${verb}ed. Send them one at a time when you
  need to know which one is bad.
  A COLLECTION YOU CANNOT SEE ANSWERS EXACTLY AS A NONEXISTENT ONE, so a 404
  here is not proof the id is wrong.
  --collection-ids is comma-separated in the flag form. --body takes a real JSON
  array instead, and is the form to use for ids that could contain a comma.
  Duplicate ids in one call are collapsed before the write.
  THIS IS IDEMPOTENT AND SAYS NOTHING WHEN IT CHANGED NOTHING. ${verb === "attach" ? "Attaching a collection the agent already holds" : "Detaching a collection the agent never held"} answers success and
  echoes the id back, exactly as a real ${verb} does. The response carries no
  per-id status, so confirm with "nexus agent-collection list <agent-id>" rather
  than reading the echo as a change.`
    )
    .action(async (agentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, { collectionIds: splitIds(opts.collectionIds) });
        await call(client, agentId, asRequestBody<AttachAgentCollectionsBody>(body));
        printSuccess(done, { agentId, collectionIds: body.collectionIds });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}

/**
 * The flag is a comma-separated STRING; `--body` may carry a real JSON ARRAY.
 *
 * `--collection-ids` used to be a `requiredOption`, so `opts.collectionIds` was
 * guaranteed present and `.split()` was safe. It is satisfiable from `--body`
 * now, and `{"collectionIds":["a","b"]}` — the natural JSON form — leaves the
 * option unset, because {@link applyBodySatisfiesRequired} only backfills
 * strings. Splitting unconditionally turned that into a `TypeError` before any
 * request was built.
 *
 * Returning `undefined` is what hands the field back to `mergeBodyWithFlags`,
 * which skips `undefined` and lets the body's own array through untouched.
 */
function splitIds(value: unknown): string[] | undefined {
  if (typeof value !== "string") return undefined;
  return value.split(",").map((id) => id.trim());
}
