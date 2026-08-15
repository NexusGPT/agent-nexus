import type {
  AssignSkillToFolderBody,
  CreateSkillFolderBody,
  UpdateSkillFolderBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { absent, color, isJsonMode, printSuccess, printTable } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
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

  const remove = confirmable(skillFolder.command("delete"))
    .description("Delete a skill folder")
    .argument("<id>", "Folder ID")
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        if (!(await confirmDestructive(`Delete skill folder ${id}?`, opts))) return;
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
    .addHelpText(
      "after",
      `
Examples:
  $ nexus skill-folder assign --skill-id <uuid> --folder-id <uuid>
  $ nexus skill-folder assign --skill-id <uuid> --folder-id null
  $ nexus skill-folder assign --skill-id <uuid> --folder-id null --json

Notes:
  --folder-id null UNASSIGNS. It is a different write from every other value:
  the server deletes the assignment row and answers "assigned": false. The
  success line says which of the two happened, and --json carries the same
  field, so a script never has to infer it from the argument it sent.

  A SKILL IS A WORKFLOW OR AN AI TASK, AND THEY ARE LISTED BY TWO COMMANDS THAT
  ANSWER IN DIFFERENT SHAPES. \`nexus workflow list --json\` is an object,
  {"data":[...],"meta":{...}}; \`nexus task list --json\` is a bare array. One
  jq path cannot read both — .data[].id for the first, .[].id for the second —
  so a script that pipes one into the other silently produces an empty id list
  rather than an error.

  The id is checked. A well-formed uuid naming no workflow and no task in your
  organization answers 404, and so does one belonging to another organization —
  the two are deliberately indistinguishable. Before this check the call
  succeeded and filed an assignment pointing at nothing.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          skillId: opts.skillId,
          folderId: opts.folderId === "null" ? null : opts.folderId
        });
        const result = await client.skillFolders.assign(
          asRequestBody<AssignSkillToFolderBody>(body)
        );

        // The server reports which write it performed in `assigned`, and this
        // command printed "Skill assigned." on both branches while discarding
        // it — so an unassignment reported the opposite of what it did. Read the
        // RESPONSE, never the argument that was sent: `--body` can carry a
        // `folderId` the flags never saw.
        if (isJsonMode()) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // `absent()` rather than `?? "(none)"`: printSuccess renders one object
        // down two channels, so a string fallback would replace the `null` a
        // script parses. It is unreachable under --json today because of the
        // early return above, and the rule holds anyway — the return is one edit
        // from being removed.
        printSuccess(result.assigned ? "Skill assigned." : "Skill unassigned.", {
          skillId: result.skillId,
          folderId: result.folderId ?? absent("(none)")
        });
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
