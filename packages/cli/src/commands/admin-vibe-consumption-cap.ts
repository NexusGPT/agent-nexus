/**
 * `nexus admin vibe-consumption-cap …` — per-org Vibe consumption-cap overrides.
 *
 * Two verbs over one resource. `get` surfaces the raw override AND the resolved
 * effective cap side by side, which is what lets an operator tell "an explicit
 * cap that happens to equal the default" apart from "no override at all".
 *
 * `set` is a tri-state PATCH: omitted leaves a column untouched, "none" clears
 * the override, an integer installs one. That three-way split is the whole
 * reason `parseCapFlag` exists and never sees the omitted case.
 *
 * 🚨 THIS FILE IS WIRING. Each verb lives in its own module under
 * `admin-vibe-consumption-cap/`, and a new one is a new module plus one line
 * here, never a block appended below. ESLint caps this file at 150 lines and
 * every function at 80, so a verb that grows in place is a lint error rather
 * than a review judgement.
 */

import { Command } from "commander";

import { registerVibeConsumptionCapGetCommand } from "./admin-vibe-consumption-cap/get.command";
import { registerVibeConsumptionCapSetCommand } from "./admin-vibe-consumption-cap/set.command";

export function registerVibeConsumptionCapCommands(admin: Command, program: Command): void {
  const cap = admin
    .command("vibe-consumption-cap")
    .description("Inspect / override the per-org Vibe consumption caps");

  registerVibeConsumptionCapGetCommand(cap, admin, program);
  registerVibeConsumptionCapSetCommand(cap, admin, program);
}
