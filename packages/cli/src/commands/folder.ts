import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printSuccess, printTable } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";

export function registerFolderCommands(program: Command): void {
  const folder = program.command("folder").description("Manage agent folders");

  // ── list ──────────────────────────────────────────────────────────────
  folder
    .command("list")
    .description("List all folders")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus folder list
  $ nexus folder list --json`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.folders.list();
        const folders = (result as any).folders ?? result;

        printTable(Array.isArray(folders) ? folders : [folders], [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "parentId", label: "PARENT", width: 36 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  folder
    .command("create")
    .description("Create a new folder")
    .requiredOption("--name <name>", "Folder name")
    .option("--parent-id <id>", "Parent folder ID for nesting")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus folder create --name "Customer Support"
  $ nexus folder create --name "Sub Team" --parent-id abc-123
  $ nexus folder create --body '{"name":"Support"}'`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.parentId !== undefined && { parentId: opts.parentId })
        });

        const folder = await client.folders.create(body as any);
        printSuccess("Folder created.", {
          id: (folder as any).id,
          name: (folder as any).name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  folder
    .command("update")
    .description("Update a folder")
    .argument("<id>", "Folder ID")
    .option("--name <name>", "New folder name")
    .option("--parent-id <id>", "New parent folder ID (use 'null' for root)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus folder update abc-123 --name "Renamed Folder"
  $ nexus folder update abc-123 --parent-id null
  $ nexus folder update abc-123 --body '{"name":"Renamed"}'`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.parentId !== undefined) {
          flags.parentId = opts.parentId === "null" ? null : opts.parentId;
        }
        const body = mergeBodyWithFlags(base, flags);

        await client.folders.update(id, body as any);
        printSuccess("Folder updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  folder
    .command("delete")
    .description("Delete a folder (agents are unassigned, not deleted)")
    .argument("<id>", "Folder ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus folder delete abc-123
  $ nexus folder delete abc-123 --yes`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          const answer = await rl.question(
            `Delete folder ${id}? Agents will be unassigned. [y/N] `
          );
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.folders.delete(id);
        printSuccess("Folder deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── assign ────────────────────────────────────────────────────────────
  folder
    .command("assign")
    .description("Assign an agent to a folder (or remove from folder)")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--folder-id <id>", "Folder ID (use 'null' to remove)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus folder assign --agent-id agt-123 --folder-id fld-456
  $ nexus folder assign --agent-id agt-123 --folder-id null
  $ nexus folder assign --body '{"agentId":"agt-123","folderId":"fld-456"}'`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.agentId !== undefined) flags.agentId = opts.agentId;
        if (opts.folderId !== undefined) {
          flags.folderId = opts.folderId === "null" ? null : opts.folderId;
        }
        const assignBody = mergeBodyWithFlags(base, flags);
        const folderId = assignBody.folderId;

        await client.folders.assignAgent(assignBody as any);

        if (folderId) {
          printSuccess("Agent assigned to folder.", {
            agentId: opts.agentId,
            folderId
          });
        } else {
          printSuccess("Agent removed from folder.", {
            agentId: opts.agentId
          });
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
