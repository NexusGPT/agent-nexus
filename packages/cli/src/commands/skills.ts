import { Command } from "commander";

import { registerSkillsListCommand } from "./skills/list.command";
import { registerSkillsUpdateCommand } from "./skills/update.command";
import { registerSkillsVersionCommand } from "./skills/version.command";
import { registerSkillsWhereCommand } from "./skills/where.command";

export function registerSkillsCommands(program: Command): void {
  const skills = program
    .command("skills")
    .description("Install and inspect the Nexus Claude Code skills + CLAUDE.md");

  registerSkillsUpdateCommand(skills, program);
  registerSkillsListCommand(skills, program);
  registerSkillsVersionCommand(skills, program);
  registerSkillsWhereCommand(skills, program);
}
