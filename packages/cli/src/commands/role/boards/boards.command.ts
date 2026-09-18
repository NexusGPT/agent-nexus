import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { isJsonMode, printList, printRecord } from "../../../output";
import { ROLES_LIST_BOARDS_CONTRACT } from "../../role.contract.generated";
import { BOARDS_ARE_A_CANVAS } from "../_shared/boards-are-a-canvas";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role boards` */
export function registerRoleBoardsCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("boards")
    .description("List a Role's Overview lanes and where each card sits")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role boards "Support agent"
  $ nexus role boards "Support agent" --json

Notes:
  A CARD IN NO LANE IS THE UNGROUPED LANE, and comes back with boardId null
  rather than being left out — a card missing from this payload does not exist,
  which is a different fact from a card nobody has placed.
  PLACEMENT ONLY. No names, statuses or icons: read those with "nexus role
  systems" and join on the id.
${BOARDS_ARE_A_CANVAS}`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const view = await client.roles.listBoards(await resolveRoleId(client, ref));

        if (isJsonMode()) {
          printRecord(view);
          return;
        }

        printList(view.boards, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 24 },
          { key: "accent", label: "ACCENT", width: 18 },
          { key: "position", label: "POS", width: 4 }
        ]);
        printList(view.cards, undefined, [
          { key: "cardType", label: "KIND", width: 18 },
          { key: "cardId", label: "CARD", width: 36 },
          {
            key: "boardId",
            label: "LANE",
            width: 36,
            format: (v) => (v === null ? "Ungrouped" : String(v))
          }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLES_LIST_BOARDS_CONTRACT);
  return leaf;
}
