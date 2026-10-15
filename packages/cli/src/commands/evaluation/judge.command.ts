import type { JudgeEvalBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { asRequestBody, resolveBody } from "../../util/body";

const JUDGE_HELP = `
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
  the call outright instead of parking the session in JUDGING.`;

/** `nexus task-eval judge` — reaches a route the v1 contract does not declare. */
export function registerEvaluationJudgeCommand(eval_: Command, program: Command): Command {
  return eval_
    .command("judge")
    .description("Judge evaluation results with AI")
    .argument("<task-id>", "Task ID")
    .argument("<session-id>", "Session ID")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", JUDGE_HELP)
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
}
