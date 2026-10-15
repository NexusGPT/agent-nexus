import type { Command } from "commander";

import { color, isJsonMode } from "../../output";
import { resolveClaudeTarget } from "../../util/claude-target";
import { type SkillsInstallOpts } from "../claude-code";
import { describeReason } from "./_shared/describe-reason";

const WHERE_HELP = `
Examples:
  $ nexus skills where
  $ nexus skills where --json
  $ nexus skills where --global

Notes:
  A DRY READ. This resolves the target and writes nothing, so it is the safe way
  to check where "skills update" would land before running it.
  It reports FIVE destinations, not one — skills, CLAUDE.md, settings.json, hooks
  and agents each have their own path, and "skills update" writes all five.
  --json adds projectRoot, which the printed form does not show, and returns the
  reason as its raw value where the text renders it as a sentence.
  The same --dir / --global / --here flags select the target here as they do on
  "skills update", so resolve with the flags you intend to install with.

  HOW AUTO-DETECT PICKS A ROOT, AND WHY THE NEAREST MARKER DOES NOT ALWAYS WIN.
  With no --dir, --global or --here, this walks UP from the current directory and
  notes the nearest ancestor holding each of three markers — a .claude/ folder,
  a CLAUDE.md, a .git — and then ranks them BY KIND, not by distance:

    .claude/   beats   CLAUDE.md   beats   .git

  🚨 SO A DISTANT .claude/ OUTRANKS A NEARBY CLAUDE.md. A .claude/ six levels up
  wins over a CLAUDE.md in the directory you are standing in — the walk does not
  stop at the first marker it meets. If a stray .claude/ ever landed up-tree,
  every project under it silently resolves there. Run this command before
  "skills update" and read the path, rather than assuming the closest file won.

  THE WALK STOPS AT YOUR HOME DIRECTORY and never climbs past it, and home
  itself is never chosen as a project root — otherwise a normal ~/.claude would
  capture every project you own. ~/.claude is reachable only with --global.
  WHEN NONE OF THE THREE EXISTS, THE TARGET IS THE CURRENT DIRECTORY. That is a
  real answer, not a refusal, so running "skills update" from an empty directory
  creates a .claude/ there. --json reports which rule fired, as "reason":
  explicit · global · cwd · detected-claude · detected-md · detected-git.`;

/** `nexus skills where` */
export function registerSkillsWhereCommand(skills: Command, _program: Command): void {
  skills
    .command("where")
    .description("Show where 'nexus skills update' would write, without changing anything")
    .option("--dir <path>", "Explicit target skills directory")
    .option("--global", "Resolve the user-global ~/.claude target")
    .option("--here", "Resolve the current directory")
    .addHelpText("after", WHERE_HELP)
    .action((opts: SkillsInstallOpts) => {
      const target = resolveClaudeTarget(opts);
      if (isJsonMode()) {
        console.log(
          JSON.stringify(
            {
              projectRoot: target.projectRoot,
              skillsDir: target.skillsDir,
              claudeMdPath: target.claudeMdPath,
              settingsJsonPath: target.settingsJsonPath,
              hooksDir: target.hooksDir,
              agentsDir: target.agentsDir,
              reason: target.reason
            },
            null,
            2
          )
        );
        return;
      }
      console.log(`\n  ${describeReason(target.reason, target.projectRoot)}\n`);
      console.log(`  Skills →    ${color.cyan(target.skillsDir)}`);
      console.log(`  CLAUDE.md → ${color.cyan(target.claudeMdPath)}`);
      console.log(`  settings →  ${color.cyan(target.settingsJsonPath)}`);
      console.log(`  hooks →     ${color.cyan(target.hooksDir)}`);
      console.log(`  agents →    ${color.cyan(target.agentsDir)}\n`);
    });
}
