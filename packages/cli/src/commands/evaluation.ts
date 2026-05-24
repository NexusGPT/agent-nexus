import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";

export function registerEvaluationCommands(program: Command): void {
  const eval_ = program
    .command("eval")
    .description('Manage evaluations for AI tasks (note: command is "eval", not "evaluation")');

  // ═══════════════════════════════════════════════════════════════════════
  // session sub-group
  // ═══════════════════════════════════════════════════════════════════════
  const session = eval_.command("session").description("Manage evaluation sessions");

  // ── session create ─────────────────────────────────────────────────────
  session
    .command("create")
    .description("Create an evaluation session")
    .argument("<task-id>", "Task ID")
    .option("--name <name>", "Session name")
    .option("--description <text>", "Session description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval session create task-123 --name "Accuracy Test v1"
  $ nexus eval session create task-123 --name "Edge cases" --description "Tests edge cases"
  $ nexus eval session create task-123 --body '{"name":"Full test","description":"..."}'`
    )
    .action(async (taskId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          description: opts.description
        });

        const s = await client.evaluations.createSession(taskId, body as any);
        printRecord(s as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "status", label: "Status" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── session list ───────────────────────────────────────────────────────
  addPaginationOptions(
    session
      .command("list")
      .description("List evaluation sessions")
      .argument("<task-id>", "Task ID")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus eval session list task-123
  $ nexus eval session list task-123 --limit 10
  $ nexus eval session list task-123 --json`
      )
  ).action(async (taskId: string, opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.evaluations.listSessions(taskId, {
        ...getPaginationParams(opts)
      });

      printList(
        data as unknown as Record<string, unknown>[],
        meta as unknown as Record<string, unknown>,
        [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "status", label: "STATUS", width: 15 },
          { key: "createdAt", label: "CREATED", width: 26 }
        ]
      );
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── session get ────────────────────────────────────────────────────────
  session
    .command("get")
    .description("Get evaluation session details")
    .argument("<task-id>", "Task ID")
    .argument("<session-id>", "Session ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval session get task-123 sess-456
  $ nexus eval session get task-123 sess-456 --json`
    )
    .action(async (taskId: string, sessionId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const s = await client.evaluations.getSession(taskId, sessionId);
        printRecord(s as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "status", label: "Status" },
          { key: "rowCount", label: "Rows" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── session delete ─────────────────────────────────────────────────────
  session
    .command("delete")
    .description("Delete an evaluation session")
    .argument("<task-id>", "Task ID")
    .argument("<session-id>", "Session ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval session delete task-123 sess-456
  $ nexus eval session delete task-123 sess-456 --yes`
    )
    .action(async (taskId: string, sessionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete evaluation session ${sessionId}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.evaluations.deleteSession(taskId, sessionId);
        printSuccess("Evaluation session deleted.", { sessionId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ═══════════════════════════════════════════════════════════════════════
  // dataset sub-group
  // ═══════════════════════════════════════════════════════════════════════
  const dataset = eval_.command("dataset").description("Manage evaluation dataset rows");

  // ── dataset list ───────────────────────────────────────────────────────
  addPaginationOptions(
    dataset
      .command("list")
      .description("List dataset rows")
      .argument("<task-id>", "Task ID")
      .argument("<session-id>", "Session ID")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus eval dataset list task-123 sess-456
  $ nexus eval dataset list task-123 sess-456 --limit 20
  $ nexus eval dataset list task-123 sess-456 --json`
      )
  ).action(async (taskId: string, sessionId: string, opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.evaluations.getDatasetRows(taskId, sessionId, {
        ...getPaginationParams(opts)
      });

      printList(
        data as unknown as Record<string, unknown>[],
        meta as unknown as Record<string, unknown>,
        [
          { key: "id", label: "ID", width: 36 },
          { key: "input", label: "INPUT", width: 40 },
          { key: "expectedOutput", label: "EXPECTED OUTPUT", width: 40 }
        ]
      );
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── dataset add ────────────────────────────────────────────────────────
  dataset
    .command("add")
    .description("Add a row to the evaluation dataset")
    .argument("<task-id>", "Task ID")
    .argument("<session-id>", "Session ID")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval dataset add task-123 sess-456 --body '{"input":"Hello","expectedOutput":"Hi there"}'
  $ nexus eval dataset add task-123 sess-456 --body dataset-row.json`
    )
    .action(async (taskId: string, sessionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);

        const row = await client.evaluations.addDatasetRow(taskId, sessionId, body as any);
        printRecord(row as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "input", label: "Input" },
          { key: "expectedOutput", label: "Expected Output" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ═══════════════════════════════════════════════════════════════════════
  // execute
  // ═══════════════════════════════════════════════════════════════════════
  eval_
    .command("execute")
    .description("Execute an evaluation run")
    .argument("<task-id>", "Task ID")
    .argument("<session-id>", "Session ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval execute task-123 sess-456
  $ nexus eval execute task-123 sess-456 --json`
    )
    .action(async (taskId: string, sessionId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.evaluations.execute(taskId, sessionId);
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ═══════════════════════════════════════════════════════════════════════
  // judge
  // ═══════════════════════════════════════════════════════════════════════
  eval_
    .command("judge")
    .description("Judge evaluation results with AI")
    .argument("<task-id>", "Task ID")
    .argument("<session-id>", "Session ID")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval judge task-123 sess-456
  $ nexus eval judge task-123 sess-456 --body '{"judgeModel":"gpt-4o","judgePrompt":"Rate accuracy"}'
  $ nexus eval judge task-123 sess-456 --json`
    )
    .action(async (taskId: string, sessionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);
        const result = await client.evaluations.judge(taskId, sessionId, body as any);
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ═══════════════════════════════════════════════════════════════════════
  // results
  // ═══════════════════════════════════════════════════════════════════════
  addPaginationOptions(
    eval_
      .command("results")
      .description("Get evaluation results")
      .argument("<task-id>", "Task ID")
      .argument("<session-id>", "Session ID")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus eval results task-123 sess-456
  $ nexus eval results task-123 sess-456 --limit 50
  $ nexus eval results task-123 sess-456 --json`
      )
  ).action(async (taskId: string, sessionId: string, opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.evaluations.getResults(taskId, sessionId, {
        ...getPaginationParams(opts)
      });

      printList(
        data as unknown as Record<string, unknown>[],
        meta as unknown as Record<string, unknown>,
        [
          { key: "id", label: "ID", width: 36 },
          { key: "input", label: "INPUT", width: 30 },
          { key: "output", label: "OUTPUT", width: 30 },
          { key: "score", label: "SCORE", width: 8 },
          { key: "passed", label: "PASSED", width: 8 }
        ]
      );
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // formats
  // ═══════════════════════════════════════════════════════════════════════
  eval_
    .command("formats")
    .description("List available evaluation formats")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval formats
  $ nexus eval formats --json`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.evaluations.listFormats();
        const items = Array.isArray(result) ? result : ((result as any).data ?? result);

        printList(items as unknown as Record<string, unknown>[], undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "description", label: "DESCRIPTION", width: 50 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ═══════════════════════════════════════════════════════════════════════
  // judges
  // ═══════════════════════════════════════════════════════════════════════
  eval_
    .command("judges")
    .description("List available judge models")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval judges
  $ nexus eval judges --json`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.evaluations.listJudges();
        const items = Array.isArray(result) ? result : ((result as any).data ?? result);

        printList(items as unknown as Record<string, unknown>[], undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "provider", label: "PROVIDER", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
