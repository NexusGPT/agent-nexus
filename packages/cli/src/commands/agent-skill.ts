import fs from "node:fs";
import path from "node:path";

import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { color, isJsonMode, printList, printRecord, printSuccess } from "../output";
import {
  DEFAULT_PRESET_REPO,
  extractPresetFromTarball,
  fetchTarball,
  formatBytes,
  packSkillZip,
  presetTarballUrl,
  readSkillDirectory,
  resolvePresets,
  SKILL_PRESET_GROUPS,
  SKILL_PRESETS,
  SKILL_ZIP_LIMITS
} from "../util/skill-bundle";
import type { ZipEntry } from "../util/zip";
import { AGENT_SKILL_CREATE_CONTRACT } from "./agent-skill.contract.generated";

/**
 * `nexus agent-skill` — attach Claude Code skill bundles to a code-interpreter
 * agent.
 *
 * Distinct from `nexus claude-code` / `nexus skills`, which install the Nexus
 * OPERATING skills into a LOCAL project so Claude Code can drive this CLI.
 * These commands write to a remote agent: each skill is a ZIP (root-level
 * `SKILL.md` plus supporting files) stored against the agent and unpacked into
 * its sandbox at session start.
 */
export function registerAgentSkillCommands(program: Command): void {
  const skill = program
    .command("agent-skill")
    .description("Attach Claude Code skills to a code-interpreter agent");

  skill.addHelpText(
    "after",
    `
A SKILL IS A FOLDER WITH A SKILL.md AT ITS ROOT, plus whatever scripts,
templates and references it needs. The platform stores one ZIP per skill against
the agent and unpacks every attached skill into the agent's sandbox at session
start — so a skill added mid-conversation is not loaded until the next session.

THE MODEL DECIDES WHETHER YOU CAN WRITE HERE AT ALL. create, upload, update and
add-preset each return 400 unless the agent runs a model with the code
interpreter; list, get, download and delete stay open, so an agent moved off one
can still be read and cleaned up. Set the model FIRST — "nexus agent update <id>
--model-name <m> --model-provider ANTHROPIC" — not after the upload fails.

THE MODELS THAT CARRY IT ARE THE "code-interpreter-*" ONES, and the name is the
only signal you get: "nexus model list" reports context size and thinking
support but nothing about the code interpreter, so nothing in that table
distinguishes an agent that can hold skills from one that cannot.

THIS IS NOT "nexus claude-code", AND THE TWO POINT IN OPPOSITE DIRECTIONS.
"nexus claude-code" installs the Nexus OPERATING skills into a LOCAL project so
Claude Code can drive this CLI. "nexus agent-skill" uploads a bundle to a REMOTE
agent so that agent can use it in its own sandbox. Nothing you install with one
appears in the other.

FIVE LIMITS, AND THE CLI CHECKS THEM BEFORE UPLOADING SO THE FAILURE NAMES THE
FILE:
  · 500 files per skill        · 2 MB per file
  · 20 MB uncompressed         · 5 MB for the packed .zip
  · 20 skills per agent        · 255 characters per path
The same limits are enforced again server-side, where the refusal is one
sentence about the archive with no path in it — so a --file .zip you packed
yourself fails less usefully than the same tree passed as --dir.

--dir DROPS SOME FILES SILENTLY AND THAT IS DELIBERATE: .git, node_modules,
__pycache__, .DS_Store, __MACOSX and Thumbs.db never travel, and SYMLINKS ARE
SKIPPED RATHER THAN FOLLOWED. A SKILL.md that is a symlink therefore does not
count as one, and the pack fails saying the folder has no SKILL.md.

SCOPES: list, get and download need agent_skills:read; create, upload, update
and add-preset need agent_skills:write; delete needs agent_skills:delete. A key
with only :write cannot clean up after itself.`
  );

  // ── list ────────────────────────────────────────────────────────────────
  skill
    .command("list")
    .description("List the skills attached to an agent")
    .argument("<agent-id>", "Agent ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-skill list abc-123
  $ nexus agent-skill list abc-123 --json`
    )
    .action(async (agentId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.agents.skills.list(agentId);
        printList(
          result.skills,
          { totalCount: result.totalCount, totalSizeBytes: result.totalSizeBytes },
          [
            { key: "id", label: "ID", width: 36 },
            { key: "name", label: "NAME", width: 24 },
            { key: "fileCount", label: "FILES", width: 7 },
            { key: "sizeBytes", label: "SIZE", width: 10 },
            { key: "description", label: "DESCRIPTION", width: 40 }
          ]
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── get ─────────────────────────────────────────────────────────────────
  skill
    .command("get")
    .description("Show one skill's details")
    .argument("<agent-id>", "Agent ID")
    .argument("<skill-id>", "Skill ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-skill get abc-123 skl-456
  $ nexus agent-skill get abc-123 skl-456 --json

Notes:
  THIS IS METADATA ONLY — the same fields the 'list' row already carries. It
  reads NOTHING out of the bundle: no file list, no SKILL.md text, no
  frontmatter. To see what the skill actually instructs the agent to do, run
  'nexus agent-skill download <agent-id> <skill-id>' and open the ZIP.`
    )
    .action(async (agentId: string, skillId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.agents.skills.get(agentId, skillId);
        printRecord(result, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "fileCount", label: "Files" },
          { key: "sizeBytes", label: "Size" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ──────────────────────────────────────────────────────────────
  const create = skill
    .command("create")
    .description("Attach a skill to an agent from a ZIP, a folder, or an empty scaffold")
    .argument("<agent-id>", "Agent ID")
    .requiredOption("--name <name>", "Skill name (lowercase letters, digits, hyphens)")
    .option("--description <text>", "What the skill does")
    .option("--file <path>", "Skill bundle as a .zip")
    .option("--dir <path>", "Skill folder to package (must contain SKILL.md)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-skill create abc-123 --name invoice-parser --dir ./skills/invoice-parser
  $ nexus agent-skill create abc-123 --name invoice-parser --file ./invoice-parser.zip
  $ nexus agent-skill create abc-123 --name invoice-parser --description "Parse supplier invoices"

Notes:
  Omit --file/--dir to create the skill with a scaffolded SKILL.md you can fill in
  later with 'nexus agent-skill upload'.
  --dir accepts the skill folder itself, or a wrapper holding exactly one.
  THE BUNDLE'S OWN SKILL.md FRONTMATTER IS NOT READ. A --dir whose SKILL.md
  declares "description:" still stores description null unless you pass
  --description here or set it later with 'nexus agent-skill update'. The flow
  runs the other way: on a scaffold, --description is what gets WRITTEN into the
  generated SKILL.md.
  The agent's model must support the code interpreter, or the API returns 400.`
    )
    .action(
      async (
        agentId: string,
        opts: { name: string; description?: string; file?: string; dir?: string }
      ) => {
        try {
          if (opts.file && opts.dir) {
            console.error(color.red("Error:") + " Pass --file or --dir, not both.");
            process.exitCode = 1;
            return;
          }

          const bundle = opts.file
            ? readZipFile(opts.file)
            : opts.dir
              ? packSkillZip(readSkillDirectory(opts.dir), opts.dir)
              : undefined;

          const client = createClient(program.optsWithGlobals());
          const created = await client.agents.skills.create(
            agentId,
            { name: opts.name, ...(opts.description ? { description: opts.description } : {}) },
            bundle ? toBlob(bundle) : undefined
          );

          printSuccess(`Skill "${created.name}" attached.`, {
            id: created.id,
            files: created.fileCount,
            size: formatBytes(created.sizeBytes)
          });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  // ── upload ──────────────────────────────────────────────────────────────
  skill
    .command("upload")
    .description("Replace an existing skill's files")
    .argument("<agent-id>", "Agent ID")
    .argument("<skill-id>", "Skill ID")
    .option("--file <path>", "Skill bundle as a .zip")
    .option("--dir <path>", "Skill folder to package (must contain SKILL.md)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-skill upload abc-123 skill-456 --dir ./skills/invoice-parser
  $ nexus agent-skill upload abc-123 skill-456 --file ./invoice-parser.zip

Notes:
  The upload REPLACES the skill's contents; files not in the new bundle are removed.`
    )
    .action(async (agentId: string, skillId: string, opts: { file?: string; dir?: string }) => {
      try {
        if (Boolean(opts.file) === Boolean(opts.dir)) {
          console.error(color.red("Error:") + " Pass exactly one of --file or --dir.");
          process.exitCode = 1;
          return;
        }

        const bundle = opts.file
          ? readZipFile(opts.file)
          : packSkillZip(readSkillDirectory(opts.dir as string), opts.dir as string);

        const client = createClient(program.optsWithGlobals());
        const result = await client.agents.skills.uploadZip(agentId, skillId, toBlob(bundle));
        printSuccess("Skill bundle replaced.", {
          id: result.id,
          files: result.fileCount,
          size: formatBytes(result.sizeBytes)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ──────────────────────────────────────────────────────────────
  skill
    .command("update")
    .description("Rename a skill or change its description")
    .argument("<agent-id>", "Agent ID")
    .argument("<skill-id>", "Skill ID")
    .option("--name <name>", "New skill name")
    .option("--description <text>", "New description")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-skill update abc-123 skl-456 --name invoice-parser-v2
  $ nexus agent-skill update abc-123 skl-456 --description "Parse supplier invoices"

Notes:
  THIS TOUCHES METADATA ONLY. The bundle is not re-read and SKILL.md is not
  rewritten — renaming a skill here does NOT rename it inside the ZIP, so the
  agent still sees whatever the packaged SKILL.md says. Use
  'nexus agent-skill upload' to change files.
  --name obeys the same rule as create; the rejection is the identical message.
  Send at least one of --name or --description, or the command refuses locally
  before any request.
  This is a WRITE route: it needs the agent to be on a code-interpreter model,
  unlike list, get, download and delete.`
    )
    .action(
      async (agentId: string, skillId: string, opts: { name?: string; description?: string }) => {
        try {
          if (opts.name === undefined && opts.description === undefined) {
            console.error(color.red("Error:") + " Provide --name and/or --description.");
            process.exitCode = 1;
            return;
          }
          const client = createClient(program.optsWithGlobals());
          const updated = await client.agents.skills.update(agentId, skillId, {
            ...(opts.name !== undefined ? { name: opts.name } : {}),
            ...(opts.description !== undefined ? { description: opts.description } : {})
          });
          printSuccess("Skill updated.", { id: updated.id, name: updated.name });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  // ── delete ──────────────────────────────────────────────────────────────
  skill
    .command("delete")
    .description("Remove a skill from an agent")
    .argument("<agent-id>", "Agent ID")
    .argument("<skill-id>", "Skill ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-skill delete abc-123 skl-456
  $ nexus agent-skill delete abc-123 skl-456 --yes

Notes:
  THE FILES GO WITH IT. There is no archive and no undo — re-attach means
  uploading the bundle again, so run 'nexus agent-skill download' first if the
  ZIP is not also kept somewhere else.
  THE PROMPT ONLY APPEARS ON A TTY. In a script, a pipeline or CI there is no
  confirmation and no --yes is needed — it deletes immediately.
  This is one of the reads-stay-open routes: it works on an agent that has since
  been moved off a code-interpreter model.`
    )
    .action(async (agentId: string, skillId: string, opts: { yes?: boolean }) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          const answer = await rl.question(
            `Remove skill ${skillId} from agent ${agentId}? This deletes its files. [y/N] `
          );
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.agents.skills.delete(agentId, skillId);
        printSuccess("Skill removed.", { id: skillId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── download ────────────────────────────────────────────────────────────
  skill
    .command("download")
    .description("Download a skill's bundle as a .zip")
    .argument("<agent-id>", "Agent ID")
    .argument("<skill-id>", "Skill ID")
    .option("--output <path>", "Where to write the .zip (default ./<skill-name>.zip)")
    .option("--url-only", "Print the presigned URL instead of downloading")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-skill download abc-123 skl-456
  $ nexus agent-skill download abc-123 skl-456 --output ./bundle.zip
  $ nexus agent-skill download abc-123 skl-456 --url-only

Notes:
  THE PRESIGNED URL EXPIRES AFTER 15 MINUTES. --url-only prints it and downloads
  nothing, so a URL captured into a script or a ticket is dead within the
  quarter-hour and fails at fetch time, not here. Download in the same run
  unless you are handing the URL to something that will use it immediately.
  Without --output the file lands at ./<skill-name>.zip in the working directory,
  overwriting whatever is already there.
  This is a read route: it works on an agent that has since been moved off a
  code-interpreter model.`
    )
    .action(
      async (agentId: string, skillId: string, opts: { output?: string; urlOnly?: boolean }) => {
        try {
          const client = createClient(program.optsWithGlobals());
          const { url } = await client.agents.skills.getDownloadUrl(agentId, skillId);

          if (opts.urlOnly) {
            if (isJsonMode()) console.log(JSON.stringify({ url }, null, 2));
            else console.log(url);
            return;
          }

          const skillMeta = await client.agents.skills.get(agentId, skillId);
          const target = path.resolve(opts.output ?? `${skillMeta.name}.zip`);
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(
              `Download failed — ${response.status} ${response.statusText}. The presigned URL expires after 15 minutes.`
            );
          }
          fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
          printSuccess(`Skill downloaded to ${target}`, { id: skillId, name: skillMeta.name });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  // ── presets ─────────────────────────────────────────────────────────────
  skill
    .command("presets")
    .description("List the baseline skills 'add-preset' can install")
    .action(() => {
      if (isJsonMode()) {
        console.log(
          JSON.stringify(
            {
              repo: DEFAULT_PRESET_REPO,
              presets: Object.values(SKILL_PRESETS),
              groups: SKILL_PRESET_GROUPS
            },
            null,
            2
          )
        );
        return;
      }
      console.log(color.bold(`\nBaseline skills (from github.com/${DEFAULT_PRESET_REPO}):\n`));
      for (const preset of Object.values(SKILL_PRESETS)) {
        console.log(`  ${color.cyan(preset.name.padEnd(16))} ${preset.description}`);
      }
      console.log(color.bold("\nGroups:\n"));
      for (const [group, members] of Object.entries(SKILL_PRESET_GROUPS)) {
        console.log(`  ${color.cyan(group.padEnd(16))} ${members.join(", ")}`);
      }
      console.log(
        color.dim(
          `\nThese are Anthropic's skills, fetched from their repository on demand rather than\n` +
            `bundled with this CLI. Install with: nexus agent-skill add-preset <agent-id> office\n`
        )
      );
    });

  // ── add-preset ──────────────────────────────────────────────────────────
  skill
    .command("add-preset")
    .description("Attach one of the baseline Anthropic skills to an agent")
    .argument("<agent-id>", "Agent ID")
    .argument("<presets...>", "Preset or group names (see 'nexus agent-skill presets')")
    .option("--ref <git-ref>", "Branch, tag, or commit of the source repo", "main")
    .option("--repo <owner/name>", "Source repository", DEFAULT_PRESET_REPO)
    .option("--from-dir <path>", "Use a local checkout of the source repo instead of downloading")
    .option("--replace", "Replace the bundle when a skill of the same name already exists")
    .option("--dry-run", "Show what would be attached without calling Nexus (still fetches the source)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-skill add-preset abc-123 skill-creator
  $ nexus agent-skill add-preset abc-123 office              # docx, pdf, pptx, xlsx
  $ nexus agent-skill add-preset abc-123 pptx xlsx --replace
  $ nexus agent-skill add-preset abc-123 all --ref v1.2.0
  $ nexus agent-skill add-preset abc-123 pdf --from-dir ~/src/anthropics-skills

Notes:
  The bundles are Anthropic's, fetched from github.com/${DEFAULT_PRESET_REPO} at run time
  rather than shipped inside this CLI; their LICENSE.txt travels with each skill.
  Pin a version with --ref, or work offline with --from-dir.
  Without --replace, a preset whose name is already attached is skipped.
  --dry-run SKIPS NEXUS, NOT GITHUB. It still downloads and unpacks the source
  tarball so it can report real file counts and sizes, then returns before any
  Nexus call. It is not an offline preview — pair it with --from-dir for that.
  The agent's model must support the code interpreter, or the API returns 400.`
    )
    .action(
      async (
        agentId: string,
        presetNames: string[],
        opts: {
          ref: string;
          repo: string;
          fromDir?: string;
          replace?: boolean;
          dryRun?: boolean;
        }
      ) => {
        try {
          const presets = resolvePresets(presetNames);

          // One download serves every requested preset — they all live in the
          // same repository, and re-fetching per preset would multiply a 3 MB
          // transfer by the size of an "office" bundle for nothing.
          let tarball: Buffer | undefined;
          if (!opts.fromDir) {
            const url = presetTarballUrl(opts.repo, opts.ref);
            if (!isJsonMode()) console.log(color.dim(`Fetching ${url} …`));
            tarball = await fetchTarball(url);
          }

          const bundles = presets.map((preset) => {
            const files: ZipEntry[] = opts.fromDir
              ? readSkillDirectory(path.join(opts.fromDir, preset.repoPath))
              : extractPresetFromTarball(tarball as Buffer, preset.repoPath);
            return { preset, zip: packSkillZip(files, preset.name), fileCount: files.length };
          });

          if (opts.dryRun) {
            const plan = bundles.map(({ preset, zip, fileCount }) => ({
              name: preset.name,
              description: preset.description,
              source: opts.fromDir
                ? path.join(opts.fromDir, preset.repoPath)
                : `${opts.repo}@${opts.ref}:${preset.repoPath}`,
              files: fileCount,
              zipBytes: zip.length
            }));
            if (isJsonMode()) {
              console.log(JSON.stringify({ dryRun: true, agentId, skills: plan }, null, 2));
            } else {
              console.log(color.bold(`\nWould attach ${plan.length} skill(s) to ${agentId}:\n`));
              for (const item of plan) {
                console.log(
                  `  ${color.cyan(item.name.padEnd(16))} ${item.files} files, ${formatBytes(item.zipBytes)}`
                );
                console.log(`  ${"".padEnd(16)} ${color.dim(item.source)}`);
              }
              console.log();
            }
            return;
          }

          const client = createClient(program.optsWithGlobals());
          const existing = await client.agents.skills.list(agentId);
          const byName = new Map(existing.skills.map((s) => [s.name, s]));

          const attached: Record<string, unknown>[] = [];
          for (const { preset, zip, fileCount } of bundles) {
            const collision = byName.get(preset.name);
            if (collision && !opts.replace) {
              if (!isJsonMode()) {
                console.log(
                  color.yellow(
                    `  ${preset.name} — already attached (${collision.id}); skipped. Re-run with --replace to overwrite.`
                  )
                );
              }
              attached.push({ name: preset.name, id: collision.id, status: "skipped" });
              continue;
            }

            if (collision) {
              const result = await client.agents.skills.uploadZip(
                agentId,
                collision.id,
                toBlob(zip)
              );
              attached.push({ name: preset.name, id: result.id, status: "replaced" });
              if (!isJsonMode()) {
                console.log(
                  `  ${color.cyan(preset.name.padEnd(16))} replaced (${fileCount} files, ${formatBytes(zip.length)})`
                );
              }
              continue;
            }

            const created = await client.agents.skills.create(
              agentId,
              { name: preset.name, description: preset.description },
              toBlob(zip)
            );
            attached.push({ name: preset.name, id: created.id, status: "created" });
            if (!isJsonMode()) {
              console.log(
                `  ${color.cyan(preset.name.padEnd(16))} attached (${fileCount} files, ${formatBytes(zip.length)})`
              );
            }
          }

          if (isJsonMode()) {
            console.log(JSON.stringify({ success: true, agentId, skills: attached }, null, 2));
          } else {
            printSuccess(`${attached.length} skill(s) processed for agent ${agentId}.`);
          }
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  // Bound LAST, after every option exists — see `bindCommand`. `AgentSkillCreate`
  // is the one route in this namespace the v1 contract declares; the rest reach
  // routes it does not.
  bindCommand(create, AGENT_SKILL_CREATE_CONTRACT);
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Read a user-supplied `.zip` and bounce it off the upload limit before the wire. */
function readZipFile(filePath: string): Buffer {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error(`File not found: ${absolute}`);
  }
  const buffer = fs.readFileSync(absolute);
  if (buffer.length > SKILL_ZIP_LIMITS.maxUploadBytes) {
    throw new Error(
      `${absolute} is ${formatBytes(buffer.length)}, over the ` +
        `${formatBytes(SKILL_ZIP_LIMITS.maxUploadBytes)} upload limit.`
    );
  }
  // Local file headers start with "PK\x03\x04"; an empty archive starts "PK\x05\x06".
  // Catching this here turns "the server rejected your archive" into a message
  // naming the file the user actually passed.
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error(`${absolute} is not a ZIP archive.`);
  }
  return buffer;
}

function toBlob(buffer: Buffer): Blob {
  return new Blob([new Uint8Array(buffer)], { type: "application/zip" });
}
