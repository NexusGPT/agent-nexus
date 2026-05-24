import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";

export function registerEmulatorCommands(program: Command): void {
  const emulator = program.command("emulator").description("Test deployments via the emulator");

  // ═══════════════════════════════════════════════════════════════════════
  // session sub-group
  // ═══════════════════════════════════════════════════════════════════════
  const session = emulator.command("session").description("Manage emulator sessions");

  // ── session create ─────────────────────────────────────────────────────
  session
    .command("create")
    .description("Create an emulator session")
    .argument("<deployment-id>", "Deployment ID")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator session create dep-123
  $ nexus emulator session create dep-123 --body '{"participant":"user-1"}'
  $ nexus emulator session create dep-123 --json`
    )
    .action(async (deploymentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);
        const s = await client.emulator.createSession(deploymentId, body as any);
        printRecord(s as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "deploymentId", label: "Deployment ID" },
          { key: "status", label: "Status" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── session list ───────────────────────────────────────────────────────
  session
    .command("list")
    .description("List emulator sessions")
    .argument("<deployment-id>", "Deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator session list dep-123
  $ nexus emulator session list dep-123 --json`
    )
    .action(async (deploymentId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.emulator.listSessions(deploymentId);
        const items = Array.isArray(result) ? result : ((result as any).data ?? result);

        printList(items as unknown as Record<string, unknown>[], undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "createdAt", label: "CREATED", width: 26 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── session get ────────────────────────────────────────────────────────
  session
    .command("get")
    .description("Get emulator session details (with messages)")
    .argument("<deployment-id>", "Deployment ID")
    .argument("<session-id>", "Session ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator session get dep-123 sess-456
  $ nexus emulator session get dep-123 sess-456 --json`
    )
    .action(async (deploymentId: string, sessionId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const s = await client.emulator.getSession(deploymentId, sessionId);
        printRecord(s as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "deploymentId", label: "Deployment ID" },
          { key: "status", label: "Status" },
          { key: "messages", label: "Messages" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── session delete ─────────────────────────────────────────────────────
  session
    .command("delete")
    .description("Delete an emulator session")
    .argument("<deployment-id>", "Deployment ID")
    .argument("<session-id>", "Session ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator session delete dep-123 sess-456
  $ nexus emulator session delete dep-123 sess-456 --yes`
    )
    .action(async (deploymentId: string, sessionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete emulator session ${sessionId}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.emulator.deleteSession(deploymentId, sessionId);
        printSuccess("Session deleted.", { sessionId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ═══════════════════════════════════════════════════════════════════════
  // send (top-level under emulator)
  // ═══════════════════════════════════════════════════════════════════════
  emulator
    .command("send")
    .description("Send a message in an emulator session")
    .argument("<deployment-id>", "Deployment ID")
    .argument("<session-id>", "Session ID")
    .option("--text <message>", "Message text")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator send dep-123 sess-456 --text "Hello, agent!"
  $ nexus emulator send dep-123 sess-456 --body '{"content":"Hi","participantId":"user-1"}'
  $ nexus emulator send dep-123 sess-456 --text "Test" --json

Notes:
  Create a session first: nexus emulator session create <deployment-id>
  Use --body with "debug":true to get debug info in the response.
  Save sessions as scenarios for regression testing: nexus emulator scenario save`
    )
    .action(async (deploymentId: string, sessionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          content: opts.text
        });

        const result = await client.emulator.sendMessage(deploymentId, sessionId, body as any);
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ═══════════════════════════════════════════════════════════════════════
  // scenario sub-group
  // ═══════════════════════════════════════════════════════════════════════
  const scenario = emulator.command("scenario").description("Manage emulator scenarios");

  // ── scenario save ──────────────────────────────────────────────────────
  scenario
    .command("save")
    .description("Save an emulator session as a scenario")
    .option("--session-id <id>", "Session ID")
    .option("--deployment-id <id>", "Deployment ID")
    .option("--name <name>", "Scenario name")
    .option("--description <text>", "Scenario description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator scenario save --session-id sess-123 --deployment-id dep-456 --name "Happy path"
  $ nexus emulator scenario save --body '{"sessionId":"sess-123","deploymentId":"dep-456","name":"Edge case"}'`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          sessionId: opts.sessionId,
          deploymentId: opts.deploymentId,
          name: opts.name,
          description: opts.description
        });

        const result = await client.emulator.saveScenario(body as any);
        printRecord(result as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "deploymentId", label: "Deployment ID" },
          { key: "sessionId", label: "Session ID" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── scenario list ──────────────────────────────────────────────────────
  scenario
    .command("list")
    .description("List emulator scenarios")
    .option("--deployment-id <id>", "Filter by deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator scenario list
  $ nexus emulator scenario list --deployment-id dep-123
  $ nexus emulator scenario list --json`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.emulator.listScenarios({
          deploymentId: opts.deploymentId
        });
        const items = Array.isArray(result) ? result : ((result as any).data ?? result);

        printList(items as unknown as Record<string, unknown>[], undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "deploymentId", label: "DEPLOYMENT", width: 36 },
          { key: "createdAt", label: "CREATED", width: 26 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── scenario get ───────────────────────────────────────────────────────
  scenario
    .command("get")
    .description("Get scenario details")
    .argument("<scenario-id>", "Scenario ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator scenario get scn-123
  $ nexus emulator scenario get scn-123 --json`
    )
    .action(async (scenarioId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const s = await client.emulator.getScenario(scenarioId);
        printRecord(s as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "deploymentId", label: "Deployment ID" },
          { key: "sessionId", label: "Session ID" },
          { key: "messages", label: "Messages" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── scenario replay ────────────────────────────────────────────────────
  scenario
    .command("replay")
    .description("Replay a scenario against a deployment")
    .argument("<scenario-id>", "Scenario ID")
    .option("--deployment-id <id>", "Deployment ID to replay against")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator scenario replay scn-123 --deployment-id dep-456
  $ nexus emulator scenario replay scn-123 --body '{"deploymentId":"dep-456"}'
  $ nexus emulator scenario replay scn-123 --deployment-id dep-456 --json`
    )
    .action(async (scenarioId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          deploymentId: opts.deploymentId
        });

        const result = await client.emulator.replayScenario(scenarioId, body as any);
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── scenario delete ────────────────────────────────────────────────────
  scenario
    .command("delete")
    .description("Delete a scenario")
    .argument("<scenario-id>", "Scenario ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator scenario delete scn-123
  $ nexus emulator scenario delete scn-123 --yes`
    )
    .action(async (scenarioId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete scenario ${scenarioId}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.emulator.deleteScenario(scenarioId);
        printSuccess("Scenario deleted.", { scenarioId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
