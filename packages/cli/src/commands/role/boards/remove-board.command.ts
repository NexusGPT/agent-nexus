import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { ROLES_DELETE_BOARD_CONTRACT } from "../../role.contract.generated";
import { BOARDS_ARE_A_CANVAS } from "../_shared/boards-are-a-canvas";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role remove-board` */
export function registerRoleRemoveBoardCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("remove-board")
    .description("Delete a lane; its cards fall back to Ungrouped")
    .argument("<role>", "Role name or UUID")
    .argument("<board-id>", "Board UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role remove-board "Support agent" 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13

Notes:
  DELETES THE LANE, NEVER THE CARDS. Every card on it moves to Ungrouped and
  nothing the Role holds is removed or stopped. cardsUnplaced counts how many
  moved, so an empty lane and a lane holding nine systems do not answer alike.
  THE PLACEMENTS ARE GONE THOUGH. Recreating the board does not put the cards
  back — that is "nexus role move-card", one card at a time.
  A card placed on it while the delete runs is a 409 and nothing changes.
${BOARDS_ARE_A_CANVAS}`
    )
    .action(async (ref: string, boardId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.deleteBoard(await resolveRoleId(client, ref), boardId);

        printSuccess("Board deleted.", { cardsUnplaced: result.cardsUnplaced });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLES_DELETE_BOARD_CONTRACT);
  return leaf;
}
