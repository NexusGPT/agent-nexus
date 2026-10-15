import type { CreateEvalSessionBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../../util/body";
import { EVALUATION_CREATE_CONTRACT } from "../../task-eval.contract.generated";

const SESSION_CREATE_HELP = `
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
  second argument.`;

/** `nexus task-eval session create` */
export function registerEvaluationSessionCreateCommand(
  session: Command,
  program: Command
): Command {
  const sessionCreate = session
    .command("create")
    .description("Create an evaluation session")
    .argument("<task-id>", "Task ID")
    .option("--name <name>", "Session name")
    .option("--description <text>", "Session description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", SESSION_CREATE_HELP)
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

  // Bound after every option exists — see `bindCommand`.
  bindCommand(sessionCreate, EVALUATION_CREATE_CONTRACT);
  return sessionCreate;
}
