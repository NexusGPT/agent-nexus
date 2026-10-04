import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * THE SOURCE THAT `commands/channel.ts` USED TO BE.
 *
 * It was one file. It is now a registrar plus one file per subcommand under
 * `commands/channel/`, with the action bodies that outgrew the 80-line function
 * cap lifted into `_shared/`. The three exit-category specs beside this file
 * COUNT CALL SITES across that population, so they have to read the population
 * rather than a registrar that no longer holds a single one of them.
 *
 * ── WHAT IS DELIBERATELY NOT IN IT, AND WHY THE SPECS BREAK WITHOUT THAT ────
 *
 * The flat `template-*.ts` helpers beside it are where these rules are DEFINED
 * — `applyApprovalVerdictExitCode`, `EXIT_CODES`, `isDeliveryFailed`, the
 * `"timed-out"` category. Every one of those specs asserts the CALLER re-spells
 * none of them, so including the definitions would make each of those
 * assertions trivially false and each applier count one too high. Measured: the
 * whole subtree reports 3 / 1 / 3 against the caller population's 2 / 1 / 2.
 *
 * `copy/` is prose and holds no call site, so it is out for the same reason the
 * help text inside the old single file never contributed one.
 *
 * ── WHY IT IS A GLOB AND NOT A LIST ─────────────────────────────────────────
 *
 * A list is a second thing to maintain, and the failure is silent in the
 * dangerous direction: a new subcommand file that re-spells a rule would simply
 * not be read, and the spec would go on printing a tick. The suffixes below are
 * the ones the split gives every command file, so a new one joins the
 * population by existing.
 */
export function readChannelCommandSource(): string {
  const files: string[] = [join(HERE, "..", "channel.ts")];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "copy") walk(full);
      } else if (
        !entry.name.endsWith(".test.ts") &&
        !entry.name.endsWith(".testkit.ts") &&
        (entry.name.endsWith(".command.ts") ||
          entry.name.endsWith(".commands.ts") ||
          dir.endsWith("_shared"))
      ) {
        files.push(full);
      }
    }
  };
  walk(HERE);

  return files.map((file) => readFileSync(file, "utf8")).join("\n");
}
