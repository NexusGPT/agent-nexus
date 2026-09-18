import type { RoleBoardCardType } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumArgument } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { absent, printSuccess } from "../../../output";
import {
  ROLES_MOVE_BOARD_CARD__PATH_VARS_CARD_TYPE,
  ROLES_MOVE_BOARD_CARD_CONTRACT
} from "../../role.contract.generated";
import { BOARDS_ARE_A_CANVAS } from "../_shared/boards-are-a-canvas";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role move-card` */
export function registerRoleMoveCardCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("move-card")
    .description("Move one card into a lane, or out of every lane")
    .argument("<role>", "Role name or UUID")
    .addArgument(
      enumArgument(
        "<card-type>",
        "The kind of card — LOWERCASE, e.g. agent, workflow, collection",
        ROLES_MOVE_BOARD_CARD__PATH_VARS_CARD_TYPE
      )
    )
    .argument("<card-id>", "The card's own id")
    .option("--board-id <id>", "Destination lane")
    .option("--unplace", "Move it to Ungrouped instead")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role move-card "Support agent" agent 7c2e9a10-4b6d-4f81-8a35-1d9e0c7b2f44 --board-id 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13
  $ nexus role move-card "Support agent" agent 7c2e9a10-4b6d-4f81-8a35-1d9e0c7b2f44 --unplace

Notes:
  EXACTLY ONE OF --board-id OR --unplace. Ungrouped is a real destination rather
  than a missing value, so there is no "send nothing to unplace it" — that would
  make a forgotten flag look like a deliberate move.
  <card-type> IS LOWERCASE, unlike the SCREAMING_CASE resource types everywhere
  else on this API: agent, workflow, deployment, ai_task, document_template,
  collection, workspace, external_tool. The Overview screen paints six more kinds
  that have nowhere to store a placement, and naming one is a 400 rather than a
  success for a move that did not persist.
  <card-id> is a UUID for most kinds but NOT all — a legacy owned-resource id may
  be any string, so this command does not check its shape.
${BOARDS_ARE_A_CANVAS}`
    )
    .action(async (ref: string, cardType: string, cardId: string, opts) => {
      try {
        const boardId = opts.boardId === undefined ? undefined : String(opts.boardId);
        const unplace = opts.unplace === true;
        if (boardId === undefined && !unplace) {
          throw new Error("Send --board-id <id>, or --unplace to move it to Ungrouped");
        }
        if (boardId !== undefined && unplace) {
          throw new Error("--board-id and --unplace ask for different destinations; send one");
        }

        const client = createClient(program.optsWithGlobals());
        const card = await client.roles.moveBoardCard(
          await resolveRoleId(client, ref),
          cardType as RoleBoardCardType,
          cardId,
          { boardId: unplace ? null : (boardId as string) }
        );

        printSuccess("Card moved.", {
          cardType: card.cardType,
          cardId: card.cardId,
          boardId: card.boardId ?? absent("Ungrouped")
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLES_MOVE_BOARD_CARD_CONTRACT);
  return leaf;
}
