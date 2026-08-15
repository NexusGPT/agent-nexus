import type { AssignAgentToFolderBody, CreateFolderBody, UpdateFolderBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { printSuccess, printTable } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import {
  FOLDER_ASSIGN_AGENT_CONTRACT,
  FOLDER_CREATE_CONTRACT,
  FOLDER_DELETE_CONTRACT,
  FOLDER_LIST_CONTRACT,
  FOLDER_UPDATE_CONTRACT
} from "./folder.contract.generated";

export function registerFolderCommands(program: Command): void {
  const folder = program
    .command("folder")
    .description("Manage AGENT folders — grouping only, never access control");

  folder.addHelpText(
    "after",
    `
AGENT FOLDERS ONLY. Skills, deployments and document templates have their own
folder surfaces ("nexus skill-folder ..."); nothing here touches them.

A FOLDER IS TIDINESS, NOT ACCESS. Filing an agent grants nobody anything and
revokes nothing. Use "nexus role" for who reaches what.

An agent sits in exactly ONE folder, so "folder assign" is a MOVE.

WHAT YOUR KEY CAN SEE: a key whose user role is org:member sees only the
folders that user created. "folder list" can therefore come back empty while
the organization has folders, and another user's folder id answers 404 on
get/update/delete/assign. An admin key, or a legacy key carrying no user, sees
the whole organization.`
  );

  // ── list ──────────────────────────────────────────────────────────────
  const list = folder
    .command("list")
    .description("List all folders (this prints folders only — not the agent assignments)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus folder list
  $ nexus folder list --json

Notes:
  THIS PRINTS FOLDERS ONLY. GET /folders also returns assignments[] — the
  agent-to-folder map — and this command drops it, including under --json.
  Read it with "nexus api GET /folders" when you need to know which agent is
  where. There is no other command that reports an agent's folder.
  A blank PARENT column is a root-level folder; anything else is the id of the
  folder it nests under.
  Unpaginated, and scoped to what your key can see (see "nexus folder --help").`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.folders.list();
        const folders = result.folders ?? result;

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
  const create = folder
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
  $ nexus folder create --name "Sub Team" --parent-id 11111111-1111-4111-8111-111111111111
  $ nexus folder create --body '{"name":"Support"}'

Notes:
  NAMES ARE NOT UNIQUE. Creating "Support" twice gives two folders with the
  same name and different ids, and nothing warns. There is no lookup-by-name —
  read the id this command prints, or "nexus folder list".
  --parent-id NESTS the folder under an existing one. It must be a UUID, and it
  is NOT checked against your organization: an id that exists nowhere fails
  with a 500 from a foreign-key violation, not a 404.
  Body fields: name (required, non-empty), parentId (optional UUID). ANY OTHER
  FIELD IN --body IS SILENTLY DROPPED — the server strips what it does not know
  rather than refusing it, so a typo'd key looks accepted. A flag always
  overrides the same field in --body.
  "OPTIONAL" MEANS OMIT parentId, NOT SEND null. An explicit
  --body '{"parentId":null}' is a 400 here, while the same null on
  "folder update" is the documented way to move a folder to the root. So a
  create body built by copying an update body fails on exactly that key: drop
  it instead of nulling it.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.parentId !== undefined && { parentId: opts.parentId })
        });

        const folder = await client.folders.create(asRequestBody<CreateFolderBody>(body));
        printSuccess("Folder created.", {
          id: folder.id,
          name: folder.name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  const update = folder
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
  $ nexus folder update 11111111-1111-4111-8111-111111111111 --name "Renamed Folder"
  $ nexus folder update 11111111-1111-4111-8111-111111111111 --parent-id null
  $ nexus folder update 11111111-1111-4111-8111-111111111111 --body '{"name":"Renamed"}'

Notes:
  --parent-id null MOVES THE FOLDER TO ROOT. "null" is the literal token this
  CLI accepts for it; omitting the flag leaves the parent alone. Absence cannot
  say both, which is why the token exists.
  NOTHING PREVENTS A CYCLE. Setting a folder's parent to one of its own
  descendants is accepted at 200 and takes both branches off the root tree.
  There is no unlink command — fix it with another --parent-id null.
  AN EMPTY UPDATE IS A SUCCESS THAT CHANGES NOTHING. Every field is optional,
  so calling this with no flags answers 200 with the folder untouched.
  A folder your key cannot see answers the same 404 as an id that exists
  nowhere — the two are deliberately indistinguishable.
  This is a PATCH: an omitted field is left alone, never cleared.`
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

        await client.folders.update(id, asRequestBody<UpdateFolderBody>(body));
        printSuccess("Folder updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  const remove = confirmable(folder.command("delete"))
    .description("Delete a folder — agents are unassigned, child folders are promoted to root")
    .argument("<id>", "Folder ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus folder delete 11111111-1111-4111-8111-111111111111
  $ nexus folder delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  UNASSIGNS, DOES NOT DELETE. The agents in this folder survive and become
  unfoldered — their assignment rows go with the folder. The response carries
  the folder id and nothing else; there is no "deleted" field to assert on, so
  a 200 IS the confirmation.
  CHILD FOLDERS SURVIVE AND ARE PROMOTED TO ROOT. Their parentId is set to
  null, so a nested tree is FLATTENED rather than removed, and nothing in the
  response or the confirmation prompt mentions them. Run "nexus folder list"
  first and read the PARENT column.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  There is no undo. Verify with "nexus folder list": the folder is gone and its
  children now show a blank PARENT.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete folder ${id}? Agents will be unassigned.`, opts)))
          return;

        await client.folders.delete(id);
        printSuccess("Folder deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── assign ────────────────────────────────────────────────────────────
  const assign = folder
    .command("assign")
    .description("Move an agent into a folder — THIS IS A MOVE, an agent sits in one folder")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--folder-id <id>", "Folder ID (use 'null' to remove)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus folder assign --agent-id 22222222-2222-4222-8222-222222222222 --folder-id 33333333-3333-4333-8333-333333333333
  $ nexus folder assign --agent-id 22222222-2222-4222-8222-222222222222 --folder-id null
  $ nexus folder assign --body '{"agentId":"22222222-2222-4222-8222-222222222222","folderId":"33333333-3333-4333-8333-333333333333"}'

Notes:
  AN AGENT SITS IN ONE FOLDER, SO THIS IS A MOVE. Assigning again takes the
  agent out of the folder it was in — the row is upserted per agent, so there
  is never a second assignment, and NOTHING NAMES THE FOLDER IT LEFT. No folder
  command prints the assignments; one raw read does, and this is it:

    $ nexus api GET /folders | jq '.data.assignments'

  Each entry is {agentId, folderId}. Run it before and after if you need to know
  where an agent came from.
  --folder-id null UNASSIGNS. "null" is the literal token; the flag is
  required, so absence cannot say it.
  THE PRESENCE OF folderId IS THE SIGNAL — THERE IS NO "assigned" FIELD. An
  assign answers {agentId, folderId}; an unassign answers {agentId} with the key
  gone. A script testing .assigned reads undefined on both and cannot tell them
  apart. Test whether folderId is there.
  IDEMPOTENT AND QUIET: unassigning an agent that was in no folder answers 200,
  not a 404. So does re-assigning it to the folder it is already in.
  --agent-id IS NOT CHECKED FOR EXISTENCE. It must be a UUID, but a deleted or
  non-existent agent is accepted and the assignment is written, reporting the
  same success as a real one. Only --folder-id is verified against your
  organization, and a folder that is not yours answers 404.
  Verify with "nexus api GET /folders" and read assignments[] — no folder
  command prints them.`
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

        await client.folders.assignAgent(asRequestBody<AssignAgentToFolderBody>(assignBody));

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

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(list, FOLDER_LIST_CONTRACT);
  bindCommand(create, FOLDER_CREATE_CONTRACT);
  bindCommand(update, FOLDER_UPDATE_CONTRACT);
  bindCommand(remove, FOLDER_DELETE_CONTRACT);
  bindCommand(assign, FOLDER_ASSIGN_AGENT_CONTRACT);
}
