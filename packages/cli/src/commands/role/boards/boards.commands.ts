import type { Command } from "commander";

import { registerRoleAddBoardCommand } from "./add-board.command";
import { registerRoleBoardsCommand } from "./boards.command";
import { registerRoleMoveCardCommand } from "./move-card.command";
import { registerRoleRemoveBoardCommand } from "./remove-board.command";
import { registerRoleReorderBoardsCommand } from "./reorder-boards.command";
import { registerRoleUpdateBoardCommand } from "./update-board.command";

/** Registers every `nexus role` boards leaf, in registration order. */
export function registerBoardsCommands(role: Command, program: Command): void {
  // ── boards ────────────────────────────────────────────────────────────────
  //
  // A Role's boards are how its systems are ORGANISED. Everything the Role holds
  // lands in Ungrouped until something places it, so a Role built entirely from
  // the terminal read as one undifferentiated pile until these verbs existed.
  registerRoleBoardsCommand(role, program);
  registerRoleAddBoardCommand(role, program);
  registerRoleReorderBoardsCommand(role, program);
  registerRoleUpdateBoardCommand(role, program);
  registerRoleRemoveBoardCommand(role, program);
  registerRoleMoveCardCommand(role, program);
}
