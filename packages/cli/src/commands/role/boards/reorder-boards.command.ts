import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { parseIdList } from "../../../util/ids";
import { ROLES_REORDER_BOARDS_CONTRACT } from "../../role.contract.generated";
import { BOARDS_ARE_A_CANVAS } from "../_shared/boards-are-a-canvas";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role reorder-boards` */
export function registerRoleReorderBoardsCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("reorder-boards")
    .description("Set the order of every one of a Role's lanes")
    .argument("<role>", "Role name or UUID")
    .requiredOption("--board-ids <ids>", "EVERY board id, comma-separated, in the order you want")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role reorder-boards "Support agent" --board-ids 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13,7c2e9a10-4b6d-4f81-8a35-1d9e0c7b2f44

Notes:
  THE LIST IS AN ASSERTION ABOUT ALL OF THEM, so send every board id, not the
  ones you moved. A set that is not exactly the Role's current boards is a 409:
  refetch with "nexus role boards" and retry. That refusal is the point — silently
  renumbering a stale list would leave a board somebody else just created at a
  position nobody chose, and report success.
  A REPEATED ID IS A 400, not a 409, because no refetch fixes it.
  Whitespace around the commas is trimmed and empty entries are dropped.
${BOARDS_ARE_A_CANVAS}`
    )
    .action(async (ref: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const view = await client.roles.reorderBoards(await resolveRoleId(client, ref), {
          boardIds: parseIdList(String(opts.boardIds))
        });

        printSuccess("Boards reordered.", { boards: view.boards.length });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLES_REORDER_BOARDS_CONTRACT);
  return leaf;
}
