import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";

export function registerVersionCommands(program: Command): void {
  const version = program.command("version").description("Manage agent prompt versions");

  // ── list ──────────────────────────────────────────────────────────────
  addPaginationOptions(
    version
      .command("list")
      .description("List prompt versions for an agent")
      .argument("<agent-id>", "Agent ID")
      .option("--type <type>", "Filter by type (AUTO, CHECKPOINT)")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus version list agt-123
  $ nexus version list agt-123 --type CHECKPOINT
  $ nexus version list agt-123 --limit 5 --json`
      )
  ).action(async (agentId: string, opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.agents.versions.list(agentId, {
        ...getPaginationParams(opts),
        type: opts.type
      } as any);

      printList(
        data as unknown as Record<string, unknown>[],
        meta as unknown as Record<string, unknown>,
        [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 25 },
          { key: "type", label: "TYPE", width: 12 },
          { key: "isProduction", label: "PROD", width: 6, format: (v) => (v ? "yes" : "no") },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]
      );
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── get ───────────────────────────────────────────────────────────────
  version
    .command("get")
    .description("Get version details with full prompt")
    .argument("<agent-id>", "Agent ID")
    .argument("<version-id>", "Version ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus version get agt-123 ver-456
  $ nexus version get agt-123 ver-456 --json`
    )
    .action(async (agentId: string, versionId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const ver = await client.agents.versions.get(agentId, versionId);
        printRecord(ver as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
          { key: "isProduction", label: "Production", format: (v) => (v ? "yes" : "no") },
          { key: "prompt", label: "Prompt" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  version
    .command("create")
    .description("Create a named checkpoint of the current prompt")
    .argument("<agent-id>", "Agent ID")
    .option("--name <name>", "Checkpoint name")
    .option("--description <text>", "Checkpoint description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus version create agt-123
  $ nexus version create agt-123 --name "v1.0" --description "Initial release"
  $ nexus version create agt-123 --body '{"name":"v1.0"}'`
    )
    .action(async (agentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description })
        });

        const ver = await client.agents.versions.createCheckpoint(agentId, body as any);
        printSuccess("Checkpoint created.", {
          id: (ver as any).id,
          name: (ver as any).name ?? "(unnamed)"
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  version
    .command("update")
    .description("Update version metadata")
    .argument("<agent-id>", "Agent ID")
    .argument("<version-id>", "Version ID")
    .option("--name <name>", "New name")
    .option("--description <text>", "New description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus version update agt-123 ver-456 --name "v1.1"
  $ nexus version update agt-123 ver-456 --body '{"name":"v1.1"}'`
    )
    .action(async (agentId: string, versionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description })
        });

        await client.agents.versions.update(agentId, versionId, body as any);
        printSuccess("Version updated.", { id: versionId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  version
    .command("delete")
    .description("Delete a prompt version")
    .argument("<agent-id>", "Agent ID")
    .argument("<version-id>", "Version ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus version delete agt-123 ver-456
  $ nexus version delete agt-123 ver-456 --yes`
    )
    .action(async (agentId: string, versionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete version ${versionId}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.agents.versions.delete(agentId, versionId);
        printSuccess("Version deleted.", { id: versionId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── restore ───────────────────────────────────────────────────────────
  version
    .command("restore")
    .description("Restore agent prompt to a previous version")
    .argument("<agent-id>", "Agent ID")
    .argument("<version-id>", "Version ID to restore")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus version restore agt-123 ver-456
  $ nexus version restore agt-123 ver-456 --yes

Notes:
  Overwrites the current agent prompt with the version's prompt.
  Create a checkpoint first if you want to save the current state: nexus version create <agent-id>`
    )
    .action(async (agentId: string, versionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(
            `Restore agent ${agentId} to version ${versionId}? This will overwrite the current prompt. [y/N] `
          );
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        const result = await client.agents.versions.restore(agentId, versionId);
        printSuccess("Version restored.", { agentId, versionId, ...(result as any) });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── publish ───────────────────────────────────────────────────────────
  version
    .command("publish")
    .description("Publish a version to production")
    .argument("<agent-id>", "Agent ID")
    .argument("<version-id>", "Version ID to publish")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus version publish agt-123 ver-456`
    )
    .action(async (agentId: string, versionId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.agents.versions.publish(agentId, versionId);
        printSuccess("Version published to production.", {
          id: (result as any).id,
          isProduction: "true"
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
