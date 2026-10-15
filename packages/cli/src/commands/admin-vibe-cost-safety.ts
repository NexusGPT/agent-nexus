/**
 * `nexus admin vibe-cost-safety …` — the Vibe cost-safety gate.
 *
 * Three verbs over one resource: `list` reads the gated fleet, `get` and `set`
 * read and flip one org's state. `set` is the operator escape hatch that
 * SUSPENDED orgs are refused new deploys by.
 *
 * The flag parsers under `admin-vibe-cost-safety/_shared/` all refuse locally,
 * before the HTTP call, and exit 5 — mirroring the backend's 422 rather than
 * spending a round trip to be told the same thing.
 *
 * 🚨 THIS FILE IS WIRING. Each verb lives in its own module under
 * `admin-vibe-cost-safety/`, and a new one is a new module plus one line here,
 * never a block appended below. ESLint caps this file at 150 lines and every
 * function at 80, so a verb that grows in place is a lint error rather than a
 * review judgement.
 */

import { Command } from "commander";

import { registerVibeCostSafetyGetCommand } from "./admin-vibe-cost-safety/get.command";
import { registerVibeCostSafetyListCommand } from "./admin-vibe-cost-safety/list.command";
import { registerVibeCostSafetySetCommand } from "./admin-vibe-cost-safety/set.command";

export function registerVibeCostSafetyCommands(admin: Command, program: Command): void {
  const cs = admin
    .command("vibe-cost-safety")
    .description("List the gated fleet, or inspect / flip one org's Vibe cost-safety state");

  registerVibeCostSafetyListCommand(cs, admin, program);
  registerVibeCostSafetyGetCommand(cs, admin, program);
  registerVibeCostSafetySetCommand(cs, admin, program);
}
