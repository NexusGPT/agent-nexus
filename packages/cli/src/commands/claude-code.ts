import fs from "node:fs";
import path from "node:path";

import { Command } from "commander";

import { handleError } from "../errors";
import { color, isJsonMode, printSuccess } from "../output";
import {
  CLAUDE_MD,
  SHARED_FILES,
  SKILL_LIST,
  type SkillEntry,
  SKILLS
} from "../skills-content.generated";

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

/**
 * Resolve the project root where CLAUDE.md should live. Claude Code auto-loads
 * project memory from `<root>/CLAUDE.md`, so for the conventional
 * `<root>/.claude/skills` layout we walk up to `<root>`. For a custom `--dir`
 * that doesn't follow that layout, fall back to the current working directory
 * — still the project root the user invoked us from.
 */
function resolveProjectRoot(skillsDir: string): string {
  const parent = path.dirname(skillsDir);
  if (path.basename(skillsDir) === "skills" && path.basename(parent) === ".claude") {
    return path.dirname(parent);
  }
  return process.cwd();
}

type ClaudeMdStatus = "created" | "updated" | "skipped" | "preserved";

/**
 * Write the bundled CLAUDE.md (the cross-cutting Cue system prompt every
 * SKILL.md cross-references) to the project root. Unlike the namespaced skill
 * files under `.claude/skills`, CLAUDE.md lives at the project root where a
 * user may already keep their own project memory — so we never silently
 * clobber an existing, differing file. Overwriting requires `--force`.
 */
function writeRootClaudeMd(
  target: string,
  content: Buffer,
  opts: { force?: boolean }
): ClaudeMdStatus {
  let existingStat: fs.Stats | null = null;
  try {
    existingStat = fs.lstatSync(target);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code !== "ENOENT") throw err;
  }

  if (existingStat) {
    if (!existingStat.isFile()) {
      throw new Error(
        `Refusing to overwrite "${target}" — not a regular file (symlink or directory).`
      );
    }
    const existing = fs.readFileSync(target);
    if (existing.equals(content)) return "skipped";
    if (!opts.force) return "preserved";
    fs.writeFileSync(target, content);
    return "updated";
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return "created";
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
    .option("--no-claude-md", "Skip writing the CLAUDE.md system prompt to the project root")
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
  $ nexus claude-code install --no-claude-md                  # Skills only, leave CLAUDE.md alone

Alongside the skills, install writes:
  • shared/        — api-client + helpers the skill example scripts import
  • CLAUDE.md      — the cross-cutting Cue system prompt every SKILL.md
                     references; placed at the project root so Claude Code
                     auto-loads it. An existing, differing CLAUDE.md is
                     preserved unless --force is passed; skip it entirely
                     with --no-claude-md.

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
          claudeMd?: boolean;
        }
      ) => {
        try {
          const skillsDir = resolveSkillsDir(opts);
          const projectRoot = resolveProjectRoot(skillsDir);
          const claudeMdTarget = path.join(projectRoot, "CLAUDE.md");

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

          // shared/ holds the api-client + helpers every skill's example
          // scripts import via `../../shared/...`. It lives alongside the
          // skills under .claude/skills/shared and ships whenever any skill
          // is installed, otherwise those imports dangle.
          const sharedInstallable: InstallableSkill = {
            slug: "shared",
            files: SHARED_FILES.map((f) => ({
              path: f.path,
              content: Buffer.from(f.content, "utf-8")
            }))
          };
          const skillInstallables = [...selected, sharedInstallable];

          // CLAUDE.md is the cross-cutting Cue system prompt every SKILL.md
          // cross-references; it goes to the project root (not .claude/skills)
          // so Claude Code auto-loads it. Opt out with --no-claude-md.
          const installClaudeMd = opts.claudeMd !== false && CLAUDE_MD.length > 0;
          const claudeMdContent = Buffer.from(CLAUDE_MD, "utf-8");

          const totalFiles =
            skillInstallables.reduce((acc, s) => acc + s.files.length, 0) +
            (installClaudeMd ? 1 : 0);

          // 3. Show plan
          if (!isJsonMode()) {
            console.log(
              color.bold(
                `\nInstalling ${selected.length} Claude Code skill${selected.length === 1 ? "" : "s"} to ${skillsDir}\n`
              )
            );
            for (const skill of skillInstallables) {
              console.log(
                `  ${color.cyan(skill.slug.padEnd(32))} ${color.dim(`${skill.files.length} files`)}`
              );
            }
            if (installClaudeMd) {
              console.log(
                `  ${color.cyan("CLAUDE.md".padEnd(32))} ${color.dim(`→ ${claudeMdTarget}`)}`
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
                    shared: sharedInstallable.files.length,
                    claudeMd: installClaudeMd ? claudeMdTarget : null,
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
          for (const skill of skillInstallables) {
            const targetDir = path.join(skillsDir, skill.slug);
            const result = writeSkillFiles(targetDir, skill.files);
            totalCreated += result.created.length;
            totalUpdated += result.updated.length;
            totalSkipped += result.skipped.length;
          }

          let claudeMdStatus: ClaudeMdStatus | null = null;
          if (installClaudeMd) {
            claudeMdStatus = writeRootClaudeMd(claudeMdTarget, claudeMdContent, opts);
            if (claudeMdStatus === "created") totalCreated += 1;
            else if (claudeMdStatus === "updated") totalUpdated += 1;
            else if (claudeMdStatus === "skipped") totalSkipped += 1;
          }

          // 7. Summary
          if (isJsonMode()) {
            console.log(
              JSON.stringify(
                {
                  success: true,
                  skills: selected.map((s) => s.slug),
                  shared: sharedInstallable.files.length,
                  claudeMd: claudeMdStatus
                    ? { path: claudeMdTarget, status: claudeMdStatus }
                    : null,
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
            if (claudeMdStatus === "created") {
              console.log(color.dim(`  CLAUDE.md written to ${claudeMdTarget}`));
            } else if (claudeMdStatus === "updated") {
              console.log(color.dim(`  CLAUDE.md updated at ${claudeMdTarget}`));
            } else if (claudeMdStatus === "preserved") {
              console.log(
                color.yellow(
                  `  CLAUDE.md left unchanged at ${claudeMdTarget} — a different file already exists. Re-run with --force to overwrite.`
                )
              );
            }
          }
        } catch (err: unknown) {
          const errno = err as NodeJS.ErrnoException | null;
          if (errno?.code === "EACCES") {
            // Report the path the OS actually rejected — writes now target both
            // the skills dir and the project-root CLAUDE.md, so a hard-coded
            // skills-dir path would mislead when CLAUDE.md is the culprit.
            const failedPath = errno.path ?? resolveSkillsDir(opts);
            console.error(
              color.red("Error:") +
                ` Permission denied. Cannot write to ${failedPath}.\n` +
                `Check permissions, install skills elsewhere with --dir, or skip the ` +
                `project-root CLAUDE.md with --no-claude-md.`
            );
            process.exitCode = 1;
          } else {
            process.exitCode = handleError(err);
          }
        }
      }
    );
}
