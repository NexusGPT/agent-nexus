import { Command } from "commander";

import { registerEvaluationDatasetCommands } from "./evaluation/dataset/dataset.commands";
import { registerEvaluationExecuteCommand } from "./evaluation/execute.command";
import { registerEvaluationFormatsCommand } from "./evaluation/formats.command";
import { registerEvaluationJudgeCommand } from "./evaluation/judge.command";
import { registerEvaluationJudgesCommand } from "./evaluation/judges.command";
import { registerEvaluationResultsCommand } from "./evaluation/results.command";
import { registerEvaluationSessionCommands } from "./evaluation/session/session.commands";

const TASK_EVAL_HELP = `
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
judgeStatus before you read score.`;

export function registerEvaluationCommands(program: Command): void {
  // No "eval" alias any more: Prompt Lab phase 2 gave `nexus eval` to golden
  // conversations (spec §9.1 — the namespace was freed by system B's removal,
  // and system A keeps `task-eval`).
  const eval_ = program
    .command("task-eval")
    .description('Manage evaluations for AI tasks (formerly also reachable as "eval")');

  eval_.addHelpText("after", TASK_EVAL_HELP);

  // Registration ORDER is the surface: `task-eval --help` lists subcommands in
  // the order they were added, so these seven calls are not interchangeable.
  registerEvaluationSessionCommands(eval_, program);
  registerEvaluationDatasetCommands(eval_, program);
  registerEvaluationExecuteCommand(eval_, program);
  registerEvaluationJudgeCommand(eval_, program);
  registerEvaluationResultsCommand(eval_, program);
  registerEvaluationFormatsCommand(eval_, program);
  registerEvaluationJudgesCommand(eval_, program);
}
