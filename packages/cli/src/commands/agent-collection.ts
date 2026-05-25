import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printSuccess, printTable } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";

export function registerAgentCollectionCommands(program: Command): void {
  const agentCollection = program
    .command("agent-collection")
    .description("Manage knowledge collections attached to agents");

  agentCollection
    .command("list")
    .description("List collections attached to an agent")
    .argument("<agent-id>", "Agent ID")
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

  agentCollection
    .command("attach")
    .description("Attach collections to an agent")
    .argument("<agent-id>", "Agent ID")
    .requiredOption("--collection-ids <ids>", "Comma-separated collection IDs")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .action(async (agentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const collectionIds = opts.collectionIds.split(",").map((id: string) => id.trim());
        const body = mergeBodyWithFlags(base, { collectionIds });
        await client.agentCollections.attach(agentId, body as any);
        printSuccess("Collections attached.", { agentId, collectionIds });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  agentCollection
    .command("detach")
    .description("Detach collections from an agent")
    .argument("<agent-id>", "Agent ID")
    .requiredOption("--collection-ids <ids>", "Comma-separated collection IDs")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .action(async (agentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const collectionIds = opts.collectionIds.split(",").map((id: string) => id.trim());
        const body = mergeBodyWithFlags(base, { collectionIds });
        await client.agentCollections.detach(agentId, body as any);
        printSuccess("Collections detached.", { agentId, collectionIds });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
