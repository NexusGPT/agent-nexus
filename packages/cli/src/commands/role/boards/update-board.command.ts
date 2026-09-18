import type { RoleBoardAccent } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import {
  ROLES_UPDATE_BOARD__BODY_ACCENT,
  ROLES_UPDATE_BOARD_CONTRACT
} from "../../role.contract.generated";
import { BOARDS_ARE_A_CANVAS } from "../_shared/boards-are-a-canvas";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role update-board` */
export function registerRoleUpdateBoardCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("update-board")
    .description("Rename a lane, recolour it, or both")
    .argument("<role>", "Role name or UUID")
    .argument("<board-id>", "Board UUID")
    .option("--name <name>", "New name")
    .addOption(
      enumOption("--accent <accent>", "New palette token", ROLES_UPDATE_BOARD__BODY_ACCENT)
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role update-board "Support agent" 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13 --name "Automation"
  $ nexus role update-board "Support agent" 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13 --accent rose

Notes:
  BOTH FLAGS ARE OPTIONAL and sending neither is a no-op rather than an error —
  this is a PATCH, so it changes what you named and leaves the rest.
  --accent takes the same palette tokens "add-board" lists.
${BOARDS_ARE_A_CANVAS}`
    )
    .action(async (ref: string, boardId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const board = await client.roles.updateBoard(await resolveRoleId(client, ref), boardId, {
          ...(opts.name === undefined ? {} : { name: String(opts.name) }),
          ...(opts.accent === undefined ? {} : { accent: opts.accent as RoleBoardAccent })
        });

        printSuccess("Board updated.", { id: board.id, name: board.name, accent: board.accent });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLES_UPDATE_BOARD_CONTRACT);
  return leaf;
}
