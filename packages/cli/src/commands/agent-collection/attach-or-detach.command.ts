import type { AttachAgentCollectionsBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { parseIdList } from "../../util/ids";

type AgentCollectionsClient = ReturnType<typeof createClient>;

export interface AttachOrDetach {
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
export function registerAttachOrDetach(
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
  $ nexus agent-collection ${verb} 11111111-1111-4111-8111-111111111111 --collection-ids 3c2b1a09-8f7e-4d6c-9b4a-39281706f5e4
  $ nexus agent-collection ${verb} 11111111-1111-4111-8111-111111111111 --collection-ids 3c2b1a09-8f7e-4d6c-9b4a-39281706f5e4,22222222-2222-4222-8222-222222222222
  $ nexus agent-collection ${verb} 11111111-1111-4111-8111-111111111111 --body '{"collectionIds":["3c2b1a09-8f7e-4d6c-9b4a-39281706f5e4","22222222-2222-4222-8222-222222222222"]}'

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
 *
 * The split itself is {@link parseIdList} — one parser for every comma-separated
 * `--…-ids` flag in this package, so a trailing comma cannot mean one thing here
 * and another on the flag next to it.
 */
function splitIds(value: unknown): string[] | undefined {
  if (typeof value !== "string") return undefined;
  return parseIdList(value);
}
