import fs from "node:fs";
import path from "node:path";

import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { color, printList, printRecord, printSuccess } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { resolveInputValue } from "../util/stdin";

export function registerAgentCommands(program: Command): void {
  const agent = program.command("agent").description("Manage AI agents");

  // ── list ──────────────────────────────────────────────────────────────
  addPaginationOptions(
    agent
      .command("list")
      .description("List agents")
      .option("--status <status>", "Filter by status (ACTIVE, DRAFT)")
      .option("--search <query>", "Search by name or role")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus agent list
  $ nexus agent list --limit 5 --status ACTIVE
  $ nexus agent list --search "support" --json

Notes:
  Results are paginated. Use --page/--limit. Check meta.hasMore in --json output.`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.agents.list({
        ...getPaginationParams(opts),
        status: opts.status,
        search: opts.search
      });

      printList(
        data as unknown as Record<string, unknown>[],
        meta as unknown as Record<string, unknown>,
        [
          { key: "id", label: "ID", width: 36 },
          { key: "firstName", label: "FIRST NAME", width: 15 },
          { key: "lastName", label: "LAST NAME", width: 15 },
          { key: "role", label: "ROLE", width: 25 },
          { key: "status", label: "STATUS", width: 10 }
        ]
      );
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── get ───────────────────────────────────────────────────────────────
  agent
    .command("get")
    .description("Get agent details")
    .argument("<id>", "Agent ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent get abc-123
  $ nexus agent get abc-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const agent = await client.agents.get(id);
        printRecord(agent as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "firstName", label: "First Name" },
          { key: "lastName", label: "Last Name" },
          { key: "role", label: "Role" },
          { key: "status", label: "Status" },
          { key: "model", label: "Model" },
          { key: "tone", label: "Tone" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  agent
    .command("create")
    .description("Create a new agent")
    .requiredOption("--first-name <name>", "Agent first name")
    .requiredOption("--last-name <name>", "Agent last name")
    .requiredOption("--role <role>", "Agent role, e.g. 'Customer Support'")
    .option("--bio <text>", "Full biography")
    .option("--short-bio <text>", "Short biography for cards")
    .option("--model <model>", "Model ID (legacy enum, e.g. GPT_4_TURBO)")
    .option("--model-name <name>", "Model name (e.g. gpt-4o, claude-sonnet-4-6)")
    .option("--model-provider <provider>", "Model provider (OPEN_AI, ANTHROPIC, GOOGLE_AI)")
    .option("--tone <tone>", "Communication tone")
    .option("--prompt <file-or-->", "System prompt (file path, or '-' for stdin)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent create --first-name Ada --last-name Lovelace --role "Assistant"
  $ nexus agent create --first-name Bot --last-name Helper --role "Support" --model-name gpt-4o --model-provider OPEN_AI
  $ cat prompt.md | nexus agent create --first-name Ada --last-name Lovelace --role "Assistant" --prompt -
  $ nexus agent create --body '{"firstName":"Ada","lastName":"Lovelace","role":"Assistant"}'

Notes:
  --prompt accepts a file path (auto-detected), literal text, or '-' for stdin.
  --body accepts JSON string, .json file, or '-' for stdin. Flags override --body fields.
  Cannot use --body - and --prompt - simultaneously (both read stdin).`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.firstName !== undefined) flags.firstName = opts.firstName;
        if (opts.lastName !== undefined) flags.lastName = opts.lastName;
        if (opts.role !== undefined) flags.role = opts.role;
        if (opts.bio !== undefined) flags.bio = opts.bio;
        if (opts.shortBio !== undefined) flags.shortBio = opts.shortBio;
        if (opts.model !== undefined) flags.model = opts.model;
        if (opts.modelName !== undefined || opts.modelProvider !== undefined) {
          flags.modelConfig = {
            modelName: opts.modelName ?? "gpt-4o",
            modelProvider: opts.modelProvider ?? "OPEN_AI"
          };
        }
        if (opts.tone !== undefined) flags.tone = opts.tone;
        if (opts.prompt) flags.prompt = await resolveInputValue(opts.prompt);

        const body = mergeBodyWithFlags(base, flags);

        const agent = await client.agents.create(body as any);
        printSuccess("Agent created.", {
          id: (agent as any).id,
          name: `${(agent as any).firstName} ${(agent as any).lastName}`
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  agent
    .command("update")
    .description("Update an agent")
    .argument("<id>", "Agent ID")
    .option("--first-name <name>", "Agent first name")
    .option("--last-name <name>", "Agent last name")
    .option("--role <role>", "Agent role")
    .option("--bio <text>", "Full biography")
    .option("--short-bio <text>", "Short biography")
    .option("--model <model>", "Model ID (legacy enum, e.g. GPT_4_TURBO)")
    .option("--model-name <name>", "Model name (e.g. gpt-4o, claude-sonnet-4-6)")
    .option("--model-provider <provider>", "Model provider (OPEN_AI, ANTHROPIC, GOOGLE_AI)")
    .option("--tone <tone>", "Communication tone")
    .option("--prompt <file-or-->", "System prompt (file path, or '-' for stdin)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent update abc-123 --role "Senior Assistant"
  $ echo "You are helpful" | nexus agent update abc-123 --prompt -
  $ nexus agent update abc-123 --model-name gpt-4o --model-provider OPEN_AI
  $ nexus agent update abc-123 --body '{"tone":"friendly"}'`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.firstName !== undefined) flags.firstName = opts.firstName;
        if (opts.lastName !== undefined) flags.lastName = opts.lastName;
        if (opts.role !== undefined) flags.role = opts.role;
        if (opts.bio !== undefined) flags.bio = opts.bio;
        if (opts.shortBio !== undefined) flags.shortBio = opts.shortBio;
        if (opts.model !== undefined) flags.model = opts.model;
        if (opts.modelName !== undefined && opts.modelProvider !== undefined) {
          flags.modelConfig = {
            modelName: opts.modelName,
            modelProvider: opts.modelProvider
          };
        } else if (opts.modelName !== undefined) {
          flags.modelName = opts.modelName;
        } else if (opts.modelProvider !== undefined) {
          flags.modelProvider = opts.modelProvider;
        }
        if (opts.tone !== undefined) flags.tone = opts.tone;
        if (opts.prompt) flags.prompt = await resolveInputValue(opts.prompt);

        const body = mergeBodyWithFlags(base, flags);

        const agent = await client.agents.update(id, body as any);
        printSuccess("Agent updated.", { id: (agent as any).id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  agent
    .command("delete")
    .description("Delete an agent")
    .argument("<id>", "Agent ID")
    .option("--yes", "Skip confirmation")
    .option("--dry-run", "Preview without deleting")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent delete abc-123
  $ nexus agent delete abc-123 --yes
  $ nexus agent delete abc-123 --dry-run

Notes:
  Prompts for confirmation in TTY. Use --yes in scripts/CI.
  --dry-run previews without deleting.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (opts.dryRun) {
          const agent = await client.agents.get(id);
          console.log(
            color.yellow("DRY RUN:") +
              ` Would delete agent "${(agent as any).firstName} ${(agent as any).lastName}" (${id})`
          );
          return;
        }

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          const answer = await rl.question(`Delete agent ${id}? This cannot be undone. [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.agents.delete(id);
        printSuccess("Agent deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── duplicate ─────────────────────────────────────────────────────────
  agent
    .command("duplicate")
    .description("Duplicate an agent")
    .argument("<id>", "Agent ID to duplicate")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent duplicate abc-123
  $ nexus agent duplicate abc-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const agent = await client.agents.duplicate(id);
        printSuccess("Agent duplicated.", {
          id: (agent as any).id,
          name: `${(agent as any).firstName} ${(agent as any).lastName}`
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── upload-profile-picture ────────────────────────────────────────────
  agent
    .command("upload-profile-picture")
    .description("Upload a profile picture for an agent")
    .argument("<id>", "Agent ID")
    .requiredOption("--file <path>", "Path to the image file")
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const absPath = path.resolve(opts.file);
        if (!fs.existsSync(absPath)) {
          console.error(`Error: File not found: ${absPath}`);
          process.exitCode = 1;
          return;
        }
        const buffer = fs.readFileSync(absPath);
        const blob = new Blob([buffer]);
        const result = await client.agents.uploadProfilePicture(id, blob);
        printSuccess("Profile picture uploaded.", result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── generate-profile-picture ──────────────────────────────────────────
  agent
    .command("generate-profile-picture")
    .description("Generate an AI profile picture for an agent")
    .argument("<id>", "Agent ID")
    .option("--prompt <text>", "Custom prompt to guide image style")
    .option("--body <json>", "Request body as JSON")
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, opts.prompt ? { customPrompt: opts.prompt } : {});
        const result = await client.agents.generateProfilePicture(id, body as any);
        printSuccess("Profile picture generated.", result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
