import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printSuccess, printTable } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";

export function registerSkillFolderCommands(program: Command): void {
  const skillFolder = program.command("skill-folder").description("Manage skill folders");

  skillFolder
    .command("list")
    .description("List skill folders and assignments")
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.skillFolders.list();
        const folders = (result as any).folders ?? [];
        printTable(folders, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "parentId", label: "PARENT", width: 36 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  skillFolder
    .command("create")
    .description("Create a skill folder")
    .requiredOption("--name <name>", "Folder name")
    .option("--parent-id <id>", "Parent folder ID")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          ...(opts.parentId !== undefined && { parentId: opts.parentId })
        });
        const folder = await client.skillFolders.create(body as any);
        printSuccess("Skill folder created.", {
          id: (folder as any).id,
          name: (folder as any).name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  skillFolder
    .command("update")
    .description("Update a skill folder")
    .argument("<id>", "Folder ID")
    .option("--name <name>", "Folder name")
    .option("--parent-id <id>", "Parent folder ID (use 'null' for root)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
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
        await client.skillFolders.update(id, body as any);
        printSuccess("Skill folder updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  skillFolder
    .command("delete")
    .description("Delete a skill folder")
    .argument("<id>", "Folder ID")
    .option("--yes", "Skip confirmation")
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete skill folder ${id}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }
        await client.skillFolders.delete(id);
        printSuccess("Skill folder deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  skillFolder
    .command("assign")
    .description("Assign a skill to a folder (or unassign)")
    .requiredOption("--skill-id <id>", "Skill ID (workflow or task)")
    .requiredOption("--folder-id <id>", "Folder ID (use 'null' to unassign)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          skillId: opts.skillId,
          folderId: opts.folderId === "null" ? null : opts.folderId
        });
        await client.skillFolders.assign(body as any);
        printSuccess("Skill assigned.", { skillId: opts.skillId, folderId: opts.folderId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
