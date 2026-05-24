import fs from "node:fs";
import path from "node:path";

import { Command } from "commander";

import { handleError } from "../errors";
import { color, isJsonMode, printSuccess } from "../output";
import { SKILL_LIST, type SkillEntry, SKILLS } from "../skills-content.generated";

// ── Types ────────────────────────────────────────────────────────────────────

interface InstallableSkill {
  slug: string;
  files: { path: string; content: Buffer }[];
}

/**
 * Convert the build-time bundle into the byte-shaped form `writeSkillFiles`
 * expects. The bundle stores file contents as UTF-8 strings (they're inlined
 * into TypeScript constants); `writeSkillFiles` writes raw buffers so it can
 * handle binary skill assets if any ever appear. UTF-8 round-trip is lossless
 * for the .md / .ts files we ship today.
 */
function bundleToInstallables(slugs: readonly string[]): InstallableSkill[] {
  return slugs.map((slug) => {
    const entry: SkillEntry = SKILLS[slug];
    return {
      slug: entry.slug,
      files: entry.files.map((f) => ({
        path: f.path,
        content: Buffer.from(f.content, "utf-8")
      }))
    };
  });
}

interface WriteResult {
  created: string[];
  updated: string[];
  skipped: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveSkillsDir(opts: { dir?: string }): string {
  return path.resolve(opts.dir || path.join(".claude", "skills"));
}

async function confirmOrAbort(
  message: string,
  opts: { yes?: boolean; force?: boolean }
): Promise<boolean> {
  if (opts.yes || opts.force) return true;

  if (!process.stdout.isTTY) {
    console.error(
      color.red("Error:") + " Cannot prompt in non-interactive mode. Use --yes or --force."
    );
    process.exitCode = 1;
    return false;
  }

  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(message);
  rl.close();
  return answer.toLowerCase() === "y" || answer === "";
}

/**
 * Resolve `relativePath` against `basePath` and only return the resulting
 * absolute path when it is strictly contained within `basePath`. Returns
 * `null` on absolute paths, `..` traversal, or any entry that would escape
 * the target directory (Zip Slip hardening).
 */
function safeResolveWithinBase(basePath: string, relativePath: string): string | null {
  if (!relativePath || relativePath.includes("\0")) return null;
  if (path.isAbsolute(relativePath)) return null;

  const normalizedBase = path.resolve(basePath);
  const resolved = path.resolve(normalizedBase, relativePath);
  const baseWithSep = normalizedBase + path.sep;
  if (resolved !== normalizedBase && !resolved.startsWith(baseWithSep)) return null;
  return resolved;
}

function writeSkillFiles(
  basePath: string,
  files: { path: string; content: Buffer }[]
): WriteResult {
  const result: WriteResult = { created: [], updated: [], skipped: [] };

  for (const file of files) {
    const fullPath = safeResolveWithinBase(basePath, file.path);
    if (!fullPath) {
      throw new Error(
        `Refusing to write unsafe path "${file.path}" — the downloaded skills bundle contains an entry that escapes the target directory.`
      );
    }
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });

    // Use lstat (not existsSync) so we detect symlinks BEFORE we follow them.
    // existsSync follows symlinks and returns false for dangling links, which
    // would let writeFileSync then create a file at the symlink's target —
    // possibly outside basePath.
    let existingStat: fs.Stats | null = null;
    try {
      existingStat = fs.lstatSync(fullPath);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException | null)?.code;
      if (code !== "ENOENT") throw err;
    }

    if (existingStat) {
      if (!existingStat.isFile()) {
        throw new Error(
          `Refusing to overwrite "${fullPath}" — not a regular file (symlink or directory).`
        );
      }
      const existing = fs.readFileSync(fullPath);
      if (existing.equals(file.content)) {
        result.skipped.push(file.path);
        continue;
      }
      fs.writeFileSync(fullPath, file.content);
      result.updated.push(file.path);
    } else {
      fs.writeFileSync(fullPath, file.content);
      result.created.push(file.path);
    }
  }

  return result;
}

// ── Commands ─────────────────────────────────────────────────────────────────

export function registerClaudeCodeCommands(program: Command): void {
  const cc = program
    .command("claude-code")
    .description("Install Claude Code skills bundled with this CLI version into your project");

  // ── list ───────────────────────────────────────────────────────────────────

  cc.command("list")
    .description("List Claude Code skills bundled with this CLI version")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus claude-code list
  $ nexus claude-code list --json

Skills are version-locked to the CLI binary — \`nexus claude-code install\`
writes the same set this command lists. Run \`nexus --version\` to see the
CLI / skill bundle version, or upgrade with \`pnpm add -g @agent-nexus/cli@latest\`.`
    )
    .action(() => {
      if (isJsonMode()) {
        const skills = SKILL_LIST.map((slug) => ({
          slug,
          description: SKILLS[slug].description,
          files: SKILLS[slug].files.length
        }));
        console.log(JSON.stringify(skills, null, 2));
        return;
      }

      console.log(color.bold(`\nBundled Claude Code skills (${SKILL_LIST.length}):\n`));
      for (const slug of SKILL_LIST) {
        const entry = SKILLS[slug];
        const name = slug.replace("nexus-", "");
        console.log(`  ${color.cyan(name.padEnd(22))} ${entry.description}`);
        console.log(`  ${"".padEnd(22)} ${color.dim(`${entry.files.length} files`)}`);
        console.log();
      }
      console.log(
        color.dim(
          `Install the latest skills: nexus claude-code install\nInstall specific ones: nexus claude-code install <skill>\n`
        )
      );
    });

  // ── install ────────────────────────────────────────────────────────────────
  //
  // Reads the embedded skills bundle (skills-content.generated.ts, produced
  // at build time from the canonical claude-code-skills-nexus repo) and
  // writes the selected skills to the target dir. No network call, no
  // auth — the bundle is version-locked to the CLI binary.

  cc.command("install")
    .description("Install the Claude Code skills bundled with this CLI version to your project")
    .argument("[skills...]", "Skill slugs to install (omit for all)")
    .option("--dir <path>", "Target directory", ".claude/skills")
    .option("--force", "Overwrite existing files without prompting")
    .option("--yes", "Skip confirmation prompt")
    .option("--dry-run", "Show what would be installed without writing")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus claude-code install                                # Install all skills
  $ nexus claude-code install nexus-workflow-builder          # Install one skill
  $ nexus claude-code install nexus-agents nexus-deployments  # Install specific skills
  $ nexus claude-code install --dir ./my-skills               # Custom directory
  $ nexus claude-code install --dry-run                       # Preview only
  $ nexus claude-code install --force                         # Overwrite without prompting

Skills are bundled with the CLI binary at build time from the canonical
claude-code-skills-nexus repository. No network calls, no API key required.
Run "nexus --version" to see which CLI version (and skill set) you have, or
"pnpm add -g @agent-nexus/cli@latest" to upgrade to the latest bundled
skills.`
    )
    .action(
      async (
        skillArgs: string[],
        opts: {
          dir: string;
          force?: boolean;
          yes?: boolean;
          dryRun?: boolean;
        }
      ) => {
        try {
          const skillsDir = resolveSkillsDir(opts);

          // 2. Filter to the requested subset (or all)
          const availableSlugs = new Set(SKILL_LIST);
          let selectedSlugs: readonly string[] = SKILL_LIST;

          if (skillArgs.length > 0) {
            const unknown = skillArgs.filter((s) => !availableSlugs.has(s));
            if (unknown.length > 0) {
              console.error(
                color.red("Error:") +
                  ` Unknown skill${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.\n\n` +
                  `Available skills in this CLI bundle:\n` +
                  [...availableSlugs]
                    .sort()
                    .map((s) => `  ${s}`)
                    .join("\n")
              );
              process.exitCode = 1;
              return;
            }
            const requested = new Set(skillArgs);
            selectedSlugs = SKILL_LIST.filter((s) => requested.has(s));
          }

          const selected = bundleToInstallables(selectedSlugs);

          const totalFiles = selected.reduce((acc, s) => acc + s.files.length, 0);

          // 3. Show plan
          if (!isJsonMode()) {
            console.log(
              color.bold(
                `\nInstalling ${selected.length} Claude Code skill${selected.length === 1 ? "" : "s"} to ${skillsDir}\n`
              )
            );
            for (const skill of selected) {
              console.log(
                `  ${color.cyan(skill.slug.padEnd(32))} ${color.dim(`${skill.files.length} files`)}`
              );
            }
            console.log();
          }

          // 4. Dry run
          if (opts.dryRun) {
            if (isJsonMode()) {
              console.log(
                JSON.stringify(
                  {
                    dryRun: true,
                    skills: selected.map((s) => s.slug),
                    directory: skillsDir,
                    fileCount: totalFiles
                  },
                  null,
                  2
                )
              );
            } else {
              console.log(
                color.dim(`Dry run — ${totalFiles} files would be written. No changes made.`)
              );
            }
            return;
          }

          // 5. Confirm
          const confirmed = await confirmOrAbort("Proceed? [Y/n] ", opts);
          if (!confirmed) {
            if (process.exitCode !== 1) console.log("Aborted.");
            return;
          }

          // 6. Write
          let totalCreated = 0;
          let totalUpdated = 0;
          let totalSkipped = 0;
          for (const skill of selected) {
            const targetDir = path.join(skillsDir, skill.slug);
            const result = writeSkillFiles(targetDir, skill.files);
            totalCreated += result.created.length;
            totalUpdated += result.updated.length;
            totalSkipped += result.skipped.length;
          }

          // 7. Summary
          if (isJsonMode()) {
            console.log(
              JSON.stringify(
                {
                  success: true,
                  skills: selected.map((s) => s.slug),
                  directory: skillsDir,
                  created: totalCreated,
                  updated: totalUpdated,
                  skipped: totalSkipped
                },
                null,
                2
              )
            );
          } else {
            printSuccess(
              `Installed ${selected.length} skill${selected.length === 1 ? "" : "s"} (${totalCreated + totalUpdated} files) to ${skillsDir}`
            );
            if (totalSkipped > 0) {
              console.log(color.dim(`  ${totalSkipped} files already up to date`));
            }
          }
        } catch (err: unknown) {
          if (
            err &&
            typeof err === "object" &&
            "code" in err &&
            (err as { code: string }).code === "EACCES"
          ) {
            console.error(
              color.red("Error:") +
                ` Permission denied. Cannot write to ${resolveSkillsDir(opts)}.\n` +
                `Try a different directory with --dir or check permissions.`
            );
            process.exitCode = 1;
          } else {
            process.exitCode = handleError(err);
          }
        }
      }
    );
}
