import type { AddEvalDatasetRowBody, CreateEvalSessionBody, JudgeEvalBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";

export function registerEvaluationCommands(program: Command): void {
  const eval_ = program
    .command("task-eval")
    .alias("eval")
    .description(
      'Manage evaluations for AI tasks (renamed from "eval"; the "eval" alias still works)'
    );

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
  $ nexus task-eval session create task-123 --name "Accuracy Test v1"
  $ nexus task-eval session create task-123 --name "Edge cases" --description "Tests edge cases"
  $ nexus task-eval session create task-123 --body '{"name":"Full test","description":"..."}'`
    )
    .action(async (taskId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          description: opts.description
        });

        const s = await client.evaluations.createSession(
          taskId,
          asRequestBody<CreateEvalSessionBody>(body)
        );
        printRecord(s, [
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
  $ nexus task-eval session list task-123
  $ nexus task-eval session list task-123 --limit 10
  $ nexus task-eval session list task-123 --json`
      )
  ).action(async (taskId: string, opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.evaluations.listSessions(taskId, {
        ...getPaginationParams(opts)
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "name", label: "NAME", width: 30 },
        { key: "status", label: "STATUS", width: 15 },
        { key: "createdAt", label: "CREATED", width: 26 }
      ]);
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
  $ nexus task-eval session get task-123 sess-456
  $ nexus task-eval session get task-123 sess-456 --json`
    )
    .action(async (taskId: string, sessionId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const s = await client.evaluations.getSession(taskId, sessionId);
        printRecord(s, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "status", label: "Status" },
          { key: "datasetRowCount", label: "Rows" },
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
  $ nexus task-eval session delete task-123 sess-456
  $ nexus task-eval session delete task-123 sess-456 --yes`
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
  $ nexus task-eval dataset list task-123 sess-456
  $ nexus task-eval dataset list task-123 sess-456 --limit 20
  $ nexus task-eval dataset list task-123 sess-456 --json`
      )
  ).action(async (taskId: string, sessionId: string, opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.evaluations.getDatasetRows(taskId, sessionId, {
        ...getPaginationParams(opts)
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "input", label: "INPUT", width: 40 },
        { key: "expectedOutput", label: "EXPECTED OUTPUT", width: 40 }
      ]);
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
  $ nexus task-eval dataset add task-123 sess-456 --body '{"input":"Hello","expectedOutput":"Hi there"}'
  $ nexus task-eval dataset add task-123 sess-456 --body dataset-row.json`
    )
    .action(async (taskId: string, sessionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // `AddEvalDatasetRowBody.input` is required, so there is no usable
        // default: omitting `--body` could only ever produce a server 400.
        // Refuse locally rather than substitute `{}`, which would send a
        // request that cannot succeed.
        const body = await resolveBody(opts.body);
        if (body === undefined) {
          console.error("Error: --body is required.");
          process.exitCode = 1;
          return;
        }

        const row = await client.evaluations.addDatasetRow(
          taskId,
          sessionId,
          asRequestBody<AddEvalDatasetRowBody>(body)
        );
        printRecord(row, [
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
  $ nexus task-eval execute task-123 sess-456
  $ nexus task-eval execute task-123 sess-456 --json`
    )
    .action(async (taskId: string, sessionId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.evaluations.execute(taskId, sessionId);
        printRecord(result);
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
  $ nexus task-eval judge task-123 sess-456
  $ nexus task-eval judge task-123 sess-456 --body '{"judgeModel":"gpt-4o","judgePrompt":"Rate accuracy"}'
  $ nexus task-eval judge task-123 sess-456 --json`
    )
    .action(async (taskId: string, sessionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // `judge task-123 sess-456` with no `--body` is a documented invocation
        // (the server picks its default judge), and both fields of
        // `JudgeEvalBody` are optional, so `{}` is a usable value of the right
        // type rather than an invented one.
        const body = (await resolveBody(opts.body)) ?? {};
        const result = await client.evaluations.judge(
          taskId,
          sessionId,
          asRequestBody<JudgeEvalBody>(body)
        );
        printRecord(result);
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
  $ nexus task-eval results task-123 sess-456
  $ nexus task-eval results task-123 sess-456 --limit 50
  $ nexus task-eval results task-123 sess-456 --json`
      )
  ).action(async (taskId: string, sessionId: string, opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.evaluations.getResults(taskId, sessionId, {
        ...getPaginationParams(opts)
      });

      printList(data, meta, [
        { key: "rowId", label: "ROW ID", width: 36 },
        { key: "input", label: "INPUT", width: 30 },
        { key: "actualOutput", label: "OUTPUT", width: 30 },
        { key: "score", label: "SCORE", width: 8 },
        { key: "status", label: "STATUS", width: 12 }
      ]);
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
  $ nexus task-eval formats
  $ nexus task-eval formats --json`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.evaluations.listFormats();
        const items = result;

        printList(items, undefined, [
          { key: "extension", label: "EXTENSION", width: 12 },
          { key: "mimeType", label: "MIME TYPE", width: 30 },
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
  $ nexus task-eval judges
  $ nexus task-eval judges --json`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.evaluations.listJudges();
        const items = result;

        printList(items, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "displayName", label: "NAME", width: 30 },
          { key: "provider", label: "PROVIDER", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
