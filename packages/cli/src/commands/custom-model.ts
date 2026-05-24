import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";

export function registerCustomModelCommands(program: Command): void {
  const customModel = program
    .command("custom-model")
    .description("Manage custom AI models with OpenAI-compatible endpoints");

  // ── list ──────────────────────────────────────────────────────────────
  customModel
    .command("list")
    .description("List custom models")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus custom-model list
  $ nexus custom-model list --json`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.customModels.list();
        const items = Array.isArray(result) ? result : ((result as any).data ?? result);

        printList(items as unknown as Record<string, unknown>[], undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "displayName", label: "NAME", width: 25 },
          { key: "modelName", label: "MODEL", width: 25 },
          { key: "protocol", label: "PROTOCOL", width: 10 },
          {
            key: "enabled",
            label: "ENABLED",
            width: 8,
            format: (v) => (v ? "yes" : "no")
          }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── get ────────────────────────────────────────────────────────────────
  customModel
    .command("get")
    .description("Get custom model details")
    .argument("<id>", "Custom model ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus custom-model get cm-123
  $ nexus custom-model get cm-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const model = await client.customModels.get(id);
        printRecord(model as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "displayName", label: "Display Name" },
          { key: "modelName", label: "Model Name" },
          { key: "baseUrl", label: "Base URL" },
          { key: "protocol", label: "Protocol" },
          { key: "enabled", label: "Enabled", format: (v) => (v ? "yes" : "no") },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  customModel
    .command("create")
    .description("Create a custom model")
    .requiredOption("--display-name <name>", "Human-readable display name")
    .requiredOption("--model-name <name>", "API model ID (e.g. llama-3-70b)")
    .requiredOption("--base-url <url>", "OpenAI-compatible API base URL (HTTPS)")
    .requiredOption("--api-key <key>", "API key for the custom endpoint")
    .option("--protocol <protocol>", "Inference protocol (default: openai)", "openai")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus custom-model create --display-name "My LLaMA" --model-name llama-3-70b \\
      --base-url https://api.example.com/v1 --api-key sk-xxx
  $ nexus custom-model create --body '{"displayName":"My Model","modelName":"gpt-4","baseUrl":"https://api.example.com/v1","apiKey":"sk-xxx"}'`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.displayName !== undefined && { displayName: opts.displayName }),
          ...(opts.modelName !== undefined && { modelName: opts.modelName }),
          ...(opts.baseUrl !== undefined && { baseUrl: opts.baseUrl }),
          ...(opts.apiKey !== undefined && { apiKey: opts.apiKey }),
          ...(opts.protocol !== undefined && { protocol: opts.protocol })
        });

        const model = await client.customModels.create(body as any);
        printSuccess("Custom model created.", {
          id: (model as any).id,
          displayName: (model as any).displayName
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  customModel
    .command("update")
    .description("Update a custom model")
    .argument("<id>", "Custom model ID")
    .option("--display-name <name>", "Display name")
    .option("--model-name <name>", "API model ID")
    .option("--base-url <url>", "API base URL")
    .option("--api-key <key>", "API key")
    .option("--protocol <protocol>", "Inference protocol")
    .option("--enabled <bool>", "Enable/disable (true/false)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus custom-model update cm-123 --display-name "Renamed Model"
  $ nexus custom-model update cm-123 --enabled false
  $ nexus custom-model update cm-123 --api-key sk-newkey`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.displayName !== undefined) flags.displayName = opts.displayName;
        if (opts.modelName !== undefined) flags.modelName = opts.modelName;
        if (opts.baseUrl !== undefined) flags.baseUrl = opts.baseUrl;
        if (opts.apiKey !== undefined) flags.apiKey = opts.apiKey;
        if (opts.protocol !== undefined) flags.protocol = opts.protocol;
        if (opts.enabled !== undefined) flags.enabled = opts.enabled === "true";
        const body = mergeBodyWithFlags(base, flags);

        await client.customModels.update(id, body as any);
        printSuccess("Custom model updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  customModel
    .command("delete")
    .description("Delete a custom model")
    .argument("<id>", "Custom model ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus custom-model delete cm-123
  $ nexus custom-model delete cm-123 --yes`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          const answer = await rl.question(
            `Delete custom model ${id}? This cannot be undone. [y/N] `
          );
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.customModels.delete(id);
        printSuccess("Custom model deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
