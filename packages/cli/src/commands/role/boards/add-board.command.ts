import type { RoleBoardAccent } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import {
  ROLES_CREATE_BOARD__BODY_ACCENT,
  ROLES_CREATE_BOARD_CONTRACT
} from "../../role.contract.generated";
import { BOARDS_ARE_A_CANVAS } from "../_shared/boards-are-a-canvas";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role add-board` */
export function registerRoleAddBoardCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("add-board")
    .description("Append a lane to a Role's Overview")
    .argument("<role>", "Role name or UUID")
    .requiredOption("--name <name>", "The lane's name")
    .addOption(
      enumOption(
        "--accent <accent>",
        "A palette token; the server picks one when omitted",
        ROLES_CREATE_BOARD__BODY_ACCENT
      )
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role add-board "Support agent" --name "Automation"
  $ nexus role add-board "Support agent" --name "Billing" --accent teal

Notes:
  APPENDED, ALWAYS. There is no --position: ordering is asserted over the whole
  list by "nexus role reorder-boards", and a create that named its own position
  would be a second way to order that cannot renumber its neighbours.
  --accent IS A PALETTE TOKEN, not a CSS colour: slate, indigo, violet, sky,
  teal, emerald, amber, rose, surface_base, surface_secondary, surface_contrast.
  Anything else is a 400.
${BOARDS_ARE_A_CANVAS}`
    )
    .action(async (ref: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const board = await client.roles.createBoard(await resolveRoleId(client, ref), {
          name: String(opts.name),
          ...(opts.accent === undefined ? {} : { accent: opts.accent as RoleBoardAccent })
        });

        printSuccess("Board created.", { id: board.id, name: board.name, accent: board.accent });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLES_CREATE_BOARD_CONTRACT);
  return leaf;
}
