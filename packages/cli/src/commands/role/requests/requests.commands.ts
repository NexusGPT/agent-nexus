import type { Command } from "commander";

import { registerRoleCreationRequestCommand } from "./creation-request.command";
import { registerRoleCreationRequestsCommand } from "./creation-requests.command";
import { registerRoleDeletionRequestCommand } from "./deletion-request.command";
import { registerRoleDeletionRequestsCommand } from "./deletion-requests.command";
import { registerRoleGovernanceCommand } from "./governance.command";
import { registerRoleRequestAccessCommand } from "./request-access.command";
import { registerRoleReviewAccessCommand } from "./review-access.command";
import { registerRoleReviewCreationRequestCommand } from "./review-creation-request.command";
import { registerRoleReviewDeletionRequestCommand } from "./review-deletion-request.command";

/** Registers every `nexus role` requests leaf, in registration order. */
export function registerRequestsCommands(role: Command, program: Command): void {
  // ── access requests ───────────────────────────────────────────────────────
  registerRoleRequestAccessCommand(role, program);
  registerRoleReviewAccessCommand(role, program);

  // ── governance ────────────────────────────────────────────────────────────
  registerRoleGovernanceCommand(role, program);
  registerRoleCreationRequestsCommand(role, program);
  registerRoleCreationRequestCommand(role, program);
  registerRoleReviewCreationRequestCommand(role, program);
  registerRoleDeletionRequestsCommand(role, program);
  registerRoleDeletionRequestCommand(role, program);
  registerRoleReviewDeletionRequestCommand(role, program);
}
