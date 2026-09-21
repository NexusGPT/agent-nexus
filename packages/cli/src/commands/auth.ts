import { Command } from "commander";

import { registerAuthListCommand } from "./auth/list.command";
import { registerAuthLoginCommand } from "./auth/login.command";
import { registerAuthLogoutCommand } from "./auth/logout.command";
import { registerAuthOrgsCommand } from "./auth/orgs.command";
import { registerAuthPinCommand } from "./auth/pin.command";
import { registerAuthStatusCommand } from "./auth/status.command";
import { registerAuthSwitchCommand } from "./auth/switch.command";
import { registerAuthUnpinCommand } from "./auth/unpin.command";
import { registerAuthUseOrgCommand } from "./auth/use-org.command";
import { registerAuthWhoamiCommand } from "./auth/whoami.command";

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Manage authentication and profiles");

  // ── login ─────────────────────────────────────────────────────────────
  registerAuthLoginCommand(auth, program);

  // ── logout ────────────────────────────────────────────────────────────
  registerAuthLogoutCommand(auth, program);

  // ── switch ────────────────────────────────────────────────────────────
  registerAuthSwitchCommand(auth, program);

  // ── list ──────────────────────────────────────────────────────────────
  registerAuthListCommand(auth, program);

  // ── pin ───────────────────────────────────────────────────────────────
  registerAuthPinCommand(auth, program);

  // ── unpin ─────────────────────────────────────────────────────────────
  registerAuthUnpinCommand(auth, program);

  // ── orgs ──────────────────────────────────────────────────────────────
  registerAuthOrgsCommand(auth, program);

  // ── use-org ───────────────────────────────────────────────────────────
  registerAuthUseOrgCommand(auth, program);

  // ── status ────────────────────────────────────────────────────────────
  registerAuthStatusCommand(auth, program);

  // ── whoami ────────────────────────────────────────────────────────────
  registerAuthWhoamiCommand(auth, program);
}
