import type { ImportTrackPlanBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { asRequestBody, resolveRequiredBody } from "../../../util/body";
import { TRACK_IMPORT_PLAN_CONTRACT } from "../../tracks.contract.generated";

const PLAN_IMPORT_HELP = `
Examples:
  $ nexus tracks plan import 11111111-1111-4111-8111-111111111111 \\
      --body '{"tasks":[{"title":"Design"},{"title":"Build"}],"edges":[{"blockerIndex":0,"blockedIndex":1}]}'
  $ nexus tracks plan import 11111111-1111-4111-8111-111111111111 --body ./plan.json
  $ cat plan.json | nexus tracks plan import 11111111-1111-4111-8111-111111111111 --body -

Notes:
  EDGES NAME THEIR ENDPOINTS BY INDEX, AND THE ORDER IS DEPTH-FIRST PRE-ORDER: a
  node, then its whole subtree, then its next sibling. For
  [A [A1, A2 [A2a]], B] the indices are 0:A 1:A1 2:A2 3:A2a 4:B. Getting this
  wrong FAILS SILENTLY — every edge still inserts, every count still matches,
  and the dependencies land on the wrong tasks with no error to read.
  SAY WHAT EACH ENTRY IS, WITH kind. STEP is work and is the default; DECISION
  and DEFINITION are content — a choice you are recording, a rule or an axis you
  are settling. Only STEP counts toward the rollup and only STEP is ever offered
  by "tracks task ready", so importing prose without a kind puts it in the
  denominator for good. It does NOT propagate to children: a DEFINITION under a
  STEP is the ordinary shape, so each node declares its own.
    {"tasks":[{"title":"Rule: every fix ships with its judge","kind":"DEFINITION"},
              {"title":"Extract the lifecycle skeleton"}]}
  SAY WHOSE TURN IT IS, WITH nextOwner. THIS IS THE ONLY DOOR IT ARRIVES
  THROUGH — there is no single-task create and no task update — so a plan that
  names no owner imports every row as CUE and "tracks task ready" can never show
  a waiting half. USER means a person has to act, EVENT that something outside
  has to happen first. Like kind it does NOT propagate: a USER parent whose
  sub-steps are ordinary agent work is the common shape, and inheriting would
  park that whole subtree on somebody who was only asked about the parent.
    {"tasks":[{"title":"Pick the empty-state copy","nextOwner":"USER",
               "children":[{"title":"Wire the three strings"}]}]}
  IT IS ALL OR NOTHING. Any refusal — a circle, an acceptance over 400
  characters, a missing parent — rolls the entire import back, so a half
  imported plan is not a state this command can leave behind.
  taskIdsByIndex COMES BACK IN THE SAME ORDER, so index 3 of the response is the
  id of the task at index 3 of your plan.
  parentTaskId HANGS THE PLAN'S ROOTS UNDER AN EXISTING TASK. Omit it to hang
  them under the track itself.
  THE PLAN NESTS FOUR LEVELS DEEP AT MOST. A fifth level of children is refused
  by the schema, not truncated.
  Needs the "track_tasks:write" scope.`;

// `kind` AND `nextOwner` SIT ON A PLAN NODE, AT EVERY DEPTH, AND NO FLAG CAN
// REACH EITHER. A plan is a tree of tasks and each node declares its own kind —
// a DEFINITION under a STEP is the ordinary shape, which is exactly why it does
// not propagate — so a `--kind` could only ever set one of many. `nextOwner` is
// the same shape for a sharper reason: a `USER` parent whose sub-steps are
// ordinary agent work is the common case ("decide the copy" over "wire the three
// strings"), so the contract refuses to inherit it, and a single `--next-owner`
// would either park a whole subtree on a person who was only asked about the
// parent or silently apply to the roots alone. The whole tree arrives through
// `--body`, which on THIS leaf really is the JSON body (`--body <json>`, a file
// path or `-` for stdin), unlike `channel whatsapp template create` where
// `--body` is message text and the JSON arrives on `--body-file`.
//
// Four paths per field rather than one because `TrackPlanNodeSchema` declares
// its nesting with an explicit depth of four rather than a `z.lazy()` recursion
// — the contract's own refusal of an attacker-controlled recursion depth — so
// the projection sees four distinct paths for one field.
const PLAN_IMPORT_BLOCKED_PATHS = {
  "Body.tasks[].kind": "--body only; one kind per node, and a plan is a tree of nodes",
  "Body.tasks[].children[].kind": "--body only; one kind per node, and a plan is a tree of nodes",
  "Body.tasks[].children[].children[].kind":
    "--body only; one kind per node, and a plan is a tree of nodes",
  "Body.tasks[].children[].children[].children[].kind":
    "--body only; one kind per node, and a plan is a tree of nodes",
  "Body.tasks[].nextOwner":
    "--body only; one owner per node, and an owner does not propagate to children",
  "Body.tasks[].children[].nextOwner":
    "--body only; one owner per node, and an owner does not propagate to children",
  "Body.tasks[].children[].children[].nextOwner":
    "--body only; one owner per node, and an owner does not propagate to children",
  "Body.tasks[].children[].children[].children[].nextOwner":
    "--body only; one owner per node, and an owner does not propagate to children"
};

/** `nexus tracks plan import` */
export function registerTracksPlanImportCommand(plan: Command, program: Command): Command {
  const leaf = plan
    .command("import")
    .description("Import tasks and their dependencies as ONE atomic write")
    .argument("<trackId>", "The track to import into")
    .requiredOption("--body <json>", "The plan as JSON, a .json file, or '-' for stdin")
    .addHelpText("after", PLAN_IMPORT_HELP)
    .action(async (trackId: string, opts: { body: string }) => {
      try {
        const body = await resolveRequiredBody(opts.body);
        const client = createClient(program.optsWithGlobals());
        const imported = await client.tracks.importPlan(
          trackId,
          asRequestBody<ImportTrackPlanBody>(body)
        );

        printSuccess("Plan imported.", imported);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_IMPORT_PLAN_CONTRACT, PLAN_IMPORT_BLOCKED_PATHS);
  return leaf;
}
