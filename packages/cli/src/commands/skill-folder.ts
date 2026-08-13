import type {
  AssignSkillToFolderBody,
  CreateSkillFolderBody,
  UpdateSkillFolderBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { color, isJsonMode, printSuccess, printTable } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import {
  SKILL_FOLDER_ASSIGN_CONTRACT,
  SKILL_FOLDER_CREATE_CONTRACT,
  SKILL_FOLDER_DELETE_CONTRACT,
  SKILL_FOLDER_LIST_CONTRACT,
  SKILL_FOLDER_UPDATE_CONTRACT
} from "./skill-folder.contract.generated";

export function registerSkillFolderCommands(program: Command): void {
  const skillFolder = program.command("skill-folder").description("Manage skill folders");

  const list = skillFolder
    .command("list")
    .description("List skill folders and assignments")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus skill-folder list
  $ nexus skill-folder list --json

Notes:
  This prints BOTH halves the endpoint returns: the folders, then which skill
  sits in which folder. A folder's contents are NOT a field on the folder — the
  assignments are a separate flat list keyed by skill ID, so a folder with rows
  in the second table is not empty even though the first table says nothing
  about it.
  A skill that appears in NO assignment row is unfiled, not missing.
  Under --json the document is {"folders":[...],"assignments":[...]} — the
  untouched response, both halves, so a script never has to call twice.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.skillFolders.list();

        // `--json` gets the WHOLE response. The two human tables below render
        // the same two arrays; printing only `folders` (which this command did)
        // dropped the assignments from both channels, so the command could not
        // do the thing its own description promises and a script had no way to
        // ask for the missing half.
        if (isJsonMode()) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        printTable(result.folders ?? [], [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "parentId", label: "PARENT", width: 36 }
        ]);

        const assignments = result.assignments ?? [];
        console.log();
        console.log(color.bold("ASSIGNMENTS"));
        printTable(assignments, [
          { key: "skillId", label: "SKILL ID", width: 36 },
          { key: "folderId", label: "FOLDER ID", width: 36 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const create = skillFolder
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
        const folder = await client.skillFolders.create(asRequestBody<CreateSkillFolderBody>(body));
        printSuccess("Skill folder created.", {
          id: folder.id,
          name: folder.name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const update = skillFolder
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
        await client.skillFolders.update(id, asRequestBody<UpdateSkillFolderBody>(body));
        printSuccess("Skill folder updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const remove = skillFolder
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

  const assign = skillFolder
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
        await client.skillFolders.assign(asRequestBody<AssignSkillToFolderBody>(body));
        printSuccess("Skill assigned.", { skillId: opts.skillId, folderId: opts.folderId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(list, SKILL_FOLDER_LIST_CONTRACT);
  bindCommand(create, SKILL_FOLDER_CREATE_CONTRACT);
  bindCommand(update, SKILL_FOLDER_UPDATE_CONTRACT);
  bindCommand(remove, SKILL_FOLDER_DELETE_CONTRACT);
  bindCommand(assign, SKILL_FOLDER_ASSIGN_CONTRACT);
}
