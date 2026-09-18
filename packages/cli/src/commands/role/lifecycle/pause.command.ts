import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role pause` */
export function registerRolePauseCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("pause")
    .description("Stop a Role's work — its workflows and agents stop executing")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role pause "Refunds"

Notes:
  THIS STOPS 2 OF THE 6 KINDS A ROLE CAN HOLD. Workflows and agents are refused
  execution. Deployments KEEP SERVING, AI tasks KEEP RUNNING, document
  templates are unaffected, and external tools sit on a catalogue row shared
  across tenants that no per-Role state may touch. Run "nexus role systems
  <role>" first: on a Role whose systems are deployments and AI tasks this
  command changes nothing anyone would notice.

  IT CHANGES NO ACCESS. Nothing the Role grants is suspended, narrowed or
  revoked, and every member reaches afterwards exactly what they reached
  before. There is no command that suspends a Role's access, deliberately —
  emptying a Role's grants HANDS every collection and workspace it was the last
  holder of to a different audience rather than withdrawing it. Narrowing on
  those two types is an allow-list over the caller's own placement, so the
  resource returns to the set no Role has claimed: every caller placed in no
  Role reaches it, and every Role-placed caller loses it.

  IT IS IDEMPOTENT AND KEEPS THE FIRST STOP. Pausing an already-paused Role
  succeeds and reports the ORIGINAL "pausedAt" — that field answers since when,
  and re-stamping it would destroy the only record of the original stop. There
  is no flag saying which of the two happened, and "nothing changed" is a
  SUCCESS: do not retry or alarm on it.

  RESUMING NEEDS "role.resume", WHICH IS A SEPARATE CAPABILITY. A key that can
  pause is not thereby able to resume. Check before stopping a Role you cannot
  start again.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { role: paused } = await client.roles.pause(await resolveRoleId(client, ref));

        printRecord(paused, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "pausedAt", label: "Paused at" },
          { key: "pausedByUserId", label: "Paused by" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
