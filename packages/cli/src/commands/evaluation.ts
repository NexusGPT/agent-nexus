import type { AddEvalDatasetRowBody, CreateEvalSessionBody, JudgeEvalBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody, resolveRequiredBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import {
  EVALUATION_CREATE_CONTRACT,
  EVALUATION_FORMATS_CONTRACT,
  EVALUATION_JUDGES_CONTRACT,
  EVALUATION_LIST_CONTRACT
} from "./task-eval.contract.generated";

export function registerEvaluationCommands(program: Command): void {
  const eval_ = program
    .command("task-eval")
    .alias("eval")
    .description(
      'Manage evaluations for AI tasks (renamed from "eval"; the "eval" alias still works)'
    );

  eval_.addHelpText(
    "after",
    `
THE ORDER IS FIXED AND A SESSION WALKS IT ONCE:

  session create  →  dataset add (one call per row)  →  execute  →  judge  →  results
  DRAFT           →  ...still DRAFT...               →  EXECUTING → EXECUTED → JUDGING → COMPLETED

EXECUTE AND JUDGE ARE EACH USABLE ONCE PER SESSION, and the session's status is
what refuses a second one — "execute" needs DRAFT, "judge" needs EXECUTED, and
either one out of turn is a 400 naming the status it found. There is no reset:
re-running an evaluation means creating a new session.

ADD EVERY DATASET ROW BEFORE "execute". Once the session leaves DRAFT the
dataset is what it is, and a row added late is not evaluated.

BOTH WRITES RETURN IMMEDIATELY AND FINISH IN THE BACKGROUND. "execute" answers
EXECUTING and "judge" answers JUDGING before any work is done — poll
"nexus task-eval session get" until the status is EXECUTED or COMPLETED. A
handled failure lands on FAILED; an unexpected one rolls the session back to
DRAFT (after execute) or EXECUTED (after judge), which is what makes a retry
possible.

A ROW CARRIES TWO INDEPENDENT STATUSES: "status" is its execution and
"judgeStatus" is its scoring, and judgeStatus stays PENDING until "judge" runs.
So a score of null before judging is the correct answer, not a failure — read
judgeStatus before you read score.`
  );

  // ═══════════════════════════════════════════════════════════════════════
  // session sub-group
  // ═══════════════════════════════════════════════════════════════════════
  const session = eval_.command("session").description("Manage evaluation sessions");

  // ── session create ─────────────────────────────────────────────────────
  const sessionCreate = session
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
  $ nexus task-eval session create 11111111-1111-4111-8111-111111111111 --name "Accuracy Test v1"
  $ nexus task-eval session create 11111111-1111-4111-8111-111111111111 --name "Edge cases" --description "Tests edge cases"
  $ nexus task-eval session create 11111111-1111-4111-8111-111111111111 --body '{"name":"Full test","description":"..."}'

Notes:
  A SESSION IS THE CONTAINER, NOT THE RUN. Creating one evaluates nothing: add
  rows with "dataset add", then "execute", then "judge". Four verbs, in order.
  The session is bound to the TASK id given here and cannot be moved to another.
  --name and --description are both optional and both label-only — nothing about
  the evaluation depends on them. They are what tell sessions apart in
  "session list", which shows the name and not the description.
  It answers with the new session's id, which every later verb takes as its
  second argument.`
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
  const sessionList = addPaginationOptions(
    session
      .command("list")
      .description("List evaluation sessions")
      .argument("<task-id>", "Task ID")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus task-eval session list 11111111-1111-4111-8111-111111111111
  $ nexus task-eval session list 11111111-1111-4111-8111-111111111111 --limit 10
  $ nexus task-eval session list 11111111-1111-4111-8111-111111111111 --json

Notes:
  SCOPED TO ONE TASK — the argument is the task id, and sessions belonging to
  other tasks are not listed here.
  STATUS IS THE EXECUTION'S, NOT THE JUDGE'S. The two move independently, so a
  session can read complete here and still carry no score. "session get" is where
  the judge's side shows.
  THIS ROW IS A SMALLER SHAPE THAN "session get" RETURNS. averageScore,
  judgedRows, judgeFailedRows, judgeModel and judgePrompt are ABSENT from a list
  row rather than null — do not read their absence as zero.
  The ID column is what "dataset", "execute", "judge" and "results" all take.`
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
  $ nexus task-eval session get 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus task-eval session get 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --json

Notes:
  THIS COMMAND AND "session list" RETURN DIFFERENT SHAPES, and the difference is
  every scoring field. A list row carries id, name, description, status, taskId,
  datasetRowCount, completedRows, failedRows, createdAt and updatedAt. This one
  adds averageScore, judgedRows, judgeFailedRows, judgeModel and judgePrompt.
  Those five are ABSENT from a list row rather than null, so a scored session
  reads a score here and nothing at all there — never poll "session list" for
  one.

  THE TABLE HERE DROPS THEM AGAIN. It prints id, name, description, status,
  Rows and Created; averageScore, judgedRows, judgeFailedRows, completedRows and
  failedRows exist under --json alone.

  READ judgeFailedRows BEFORE YOU TRUST averageScore. The average is taken over
  the rows the judge COMPLETED and over nothing else, so a session whose
  judgements mostly errored still reports a confident number, computed from the
  few that survived.`
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
  confirmable(session.command("delete"))
    .description("Delete an evaluation session")
    .argument("<task-id>", "Task ID")
    .argument("<session-id>", "Session ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus task-eval session delete 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus task-eval session delete 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --yes

Notes:
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  IT TAKES THE DATASET AND THE RESULTS WITH IT. The session's rows and every
  score judged against them go too, and there is no reset or re-run, so a
  deleted session means executing and judging again from a new one. Read what
  you need with "task-eval results" first.`
    )
    .action(async (taskId: string, sessionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete evaluation session ${sessionId}?`, opts))) return;

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
  $ nexus task-eval dataset list 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus task-eval dataset list 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --limit 20
  $ nexus task-eval dataset list 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --json

Notes:
  THREE COLUMNS, AND THE RESULTS ARE NOT AMONG THEM. This is the INPUT side —
  the rows an execution will run. Scores and outputs come from "task-eval
  results".
  input and expectedOutput each accept a string OR an object, so a cell showing
  JSON is a real nested value and not a string that looks like one. --json is
  where that distinction survives; the table flattens it to fit a column.
  expectedOutput may be empty — a row without one still executes, and only the
  judge needs something to compare against.
  Paginated: --limit and the meta block bound what you are seeing.`
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
    .requiredOption("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus task-eval dataset add 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --body '{"input":"Hello","expectedOutput":"Hi there"}'
  $ nexus task-eval dataset add 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --body dataset-row.json

Notes:
  ONE CALL, ONE ROW. This is the only way to fill a dataset from the CLI — there
  is no import command and no file argument here, so a 100-row dataset is 100
  calls. The extensions "task-eval formats" lists are not accepted by any
  command in this namespace.
  metadata IS ACCEPTED AND NOT STORED. The body schema takes it, the call
  answers 201, and every later read of that row shows metadata null. Put
  anything you need to keep inside "input" instead.
  ADD ROWS WHILE THE SESSION IS STILL DRAFT. Nothing refuses a row added after
  "execute" — it is created, it is never evaluated, and no result row ever
  appears for it.
  Rows are numbered in the order they arrive and "dataset list" returns them
  that way.
  A ROW IS input, expectedOutput AND metadata, AND ONLY input IS REQUIRED. A
  body without it is a 400 naming that field. input and expectedOutput each
  accept a STRING OR AN OBJECT, so a structured task takes the object form
  directly with no stringify; metadata must be an object, and is the field
  discarded above.`
    )
    .action(async (taskId: string, sessionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // `AddEvalDatasetRowBody.input` is required, so there is no usable
        // default: omitting `--body` could only ever produce a server 400.
        // That is why `--body` is a requiredOption above: commander refuses
        // before this action runs, with a usage message, rather than the action
        // hand-rolling a refusal `--help` gave no warning of.
        const body = await resolveRequiredBody(opts.body);

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
  $ nexus task-eval execute 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus task-eval execute 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --json

Notes:
  IT RUNS THE TASK FOR REAL, once per dataset row, with whatever the task is
  configured to do. There is no dry mode, and the cost scales with the row count.
  EXECUTION IS NOT SCORING. This produces outputs; "task-eval judge" is what
  compares them to expectedOutput. A session that executed and was never judged
  has results with no scores, which is a normal intermediate state.
  Add the rows FIRST — executing an empty dataset runs nothing and still
  succeeds.
  Read the outcome with "task-eval results"; this answers with the run's own
  record rather than the per-row output.`
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
  $ nexus task-eval judge 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus task-eval judge 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --body '{"judgeModel":"gpt-4o","judgePrompt":"Rate accuracy"}'
  $ nexus task-eval judge 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --json

Notes:
  --body IS OPTIONAL AND A BODILESS JUDGE STILL SCORES. Both of its fields are
  optional: judgeModel falls back to gpt-4o, or to the first judge registered on
  this node when gpt-4o is not one of them, and judgePrompt falls back to the
  built-in ACCURACY template. Sending judgePrompt switches the whole run to a
  CUSTOM template.

  judgeModel TAKES THE ID COLUMN OF "nexus task-eval judges". A displayName is
  accepted too, case-insensitively, and so is a prefix of a model name when it
  matches exactly one registered judge — a prefix matching two is refused rather
  than disambiguated. Anything else is INVALID_JUDGE_MODEL, and the message
  lists every model this node can actually run.

  THE MODEL IS RESOLVED BEFORE THE SESSION MOVES, so an unknown judgeModel fails
  the call outright instead of parking the session in JUDGING.`
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
  $ nexus task-eval results 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus task-eval results 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --limit 50
  $ nexus task-eval results 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --json

Notes:
  THE TABLE SHOWS 5 OF 11 FIELDS AND HIDES THE ONE THAT EXPLAINS A BLANK SCORE.
  A row carries rowId, input, expectedOutput, actualOutput, score, judgeComment,
  executionTimeMs, status, judgeStatus, executionError and judgeError; the table
  prints rowId, input, actualOutput, score and status.

  status IS EXECUTION AND judgeStatus IS SCORING, and the two move
  independently. A row reads status COMPLETED with score blank for as long as
  judgeStatus is PENDING, which is every row until "nexus task-eval judge" runs.
  Read judgeStatus before you read score.

  A REAL FAILURE NAMES ITSELF, UNDER --json ONLY: executionError for the run,
  judgeError for the scoring. Both null beside a blank score means not judged
  yet, never failed.`
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
  const formats = eval_
    .command("formats")
    .description("List available evaluation formats")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus task-eval formats
  $ nexus task-eval formats --json

Notes:
  THESE ARE UPLOAD FORMATS FOR A DATASET, not output formats for a task. They say
  what "task-eval dataset upload" will accept.
  A row is an extension, its MIME type and a description. The EXTENSION is what
  the upload matches on, so a file with the right content and the wrong suffix is
  refused.
  This list is a property of the platform, not of your task or session, so it
  takes no arguments and never varies per organization.`
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
  const judges = eval_
    .command("judges")
    .description("List available judge models")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus task-eval judges
  $ nexus task-eval judges --json

Notes:
  THE ID COLUMN IS WHAT "task-eval judge" TAKES as judgeModel — the display name
  is for reading, and provider only says whose model it is.
  A judge is the model that SCORES an execution, which is a different choice from
  the model the task itself runs on. Picking a strong judge does not change what
  the task produced.
  This list is the platform's and takes no arguments. Omitting judgeModel on
  "task-eval judge" falls back to a default rather than refusing, so an absent
  choice is still a choice.`
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

  // Bound LAST, after every option exists — see `bindCommand`. The remaining
  // subcommands reach routes the v1 contract does not declare.
  bindCommand(sessionCreate, EVALUATION_CREATE_CONTRACT);
  bindCommand(sessionList, EVALUATION_LIST_CONTRACT);
  bindCommand(formats, EVALUATION_FORMATS_CONTRACT);
  bindCommand(judges, EVALUATION_JUDGES_CONTRACT);
}
