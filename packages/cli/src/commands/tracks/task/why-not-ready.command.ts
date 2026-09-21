import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printEnvelope } from "../../../output";
import { explainUnreadyTasks, RECONSTRUCTION_CAVEAT } from "../../../util/track-blockers";
import { READY_SET_CEILING, renderWhyNotReady } from "../../../util/track-blockers.render";

const TASK_WHY_NOT_READY_HELP = `
Examples:
  $ nexus tracks task why-not-ready 11111111-1111-4111-8111-111111111111
  $ nexus tracks task why-not-ready 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE ANSWER IS RECONSTRUCTED ON THIS MACHINE AND IS NOT THE SERVER'S OWN
  REASON. The ready set is one query inside the API and it publishes nothing
  about what it withheld, so this command reads the plan and its edges and
  re-derives the rule. The materialised ancestry the server's query reads does
  not cross the wire, so ancestry is rebuilt by walking parentTaskId: faithful
  while the two are in step, and divergent exactly where they have drifted.
  Read every line here as a reconstruction and "nexus tracks task ready" as the
  authority on what may actually be picked up.
  IT ANSWERS THE QUESTION A ROLL-UP CANNOT. A board can read 127 of 156 with 29
  rows open and offer NOTHING, which is indistinguishable from a board that is
  nearly finished. This names the rows that are holding it and says of each
  whether it is WORK or CONTENT, because a content row nobody will ever tick
  holds its dependents exactly as a step would.
  AN EDGE HUNG ON AN ANCESTOR HOLDS EVERYTHING BENEATH IT, and the held row's own
  edge list is empty. The VIA column names that ancestor. Reading only the edges
  that name a task directly reports the row as unexplained.
  A BLOCKER WITH WORK BENEATH IT IS SATISFIED BY THAT SUBTREE, NOT BY ITS OWN
  TICK. "subtree open" means work is still outstanding below it; ticking the
  parent by hand also releases it, and finishing the work is the intended exit.
  IT MAKES NO WRITE AND CHANGES NOTHING. Three reads, all needing only the
  "track_tasks:read" scope.
  A FOREIGN TRACK AND AN ABSENT ONE ARE BOTH REFUSED WITH 404, IDENTICALLY.`;

/**
 * `tracks task why-not-ready` — the only command here that COMPOSES.
 *
 * ⚠️ IT IS DELIBERATELY NOT BOUND TO A CONTRACT, because it maps to no single
 * route: it reads the ready set, the plan and the edges and intersects the
 * three. `contract-help.test.ts` skips an unbound command by construction
 * (`if (!binding) continue;`), and the `tracks` namespace has many other bound
 * commands, so the per-namespace floor that keeps that file from going
 * vacuously green is unaffected. It still has to be classified in
 * `command-universe.ts` like every other leaf.
 *
 * 🔴 IT EXPLAINS A SET IT DOES NOT COMPUTE, AND THAT SEPARATION IS THE POINT.
 * `tracks task ready` remains the sole authority on what may be picked up. A
 * command that ALSO decided readiness would be a second implementation of an
 * anti-join whose two surfaces fail asymmetrically — narrowing what counts as
 * a blocker, or widening what counts as satisfied, hands out genuinely blocked
 * work and the answer looks like a well-formed set of real tasks either way.
 * Nothing here touches that query.
 */
export function registerTracksTaskWhyNotReadyCommand(task: Command, program: Command): Command {
  const leaf = task
    .command("why-not-ready")
    .description("Why the tasks this track still has open are not being offered")
    .argument("<trackId>", "The track to explain")
    .addHelpText("after", TASK_WHY_NOT_READY_HELP)
    .action(async (trackId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());

        // The ready set is asked for at its ceiling so the cross-check below is
        // about the WHOLE set rather than about a default page of 50. A shorter
        // answer than the ceiling is the whole answer.
        const [ready, plan, edges] = await Promise.all([
          client.tracks.listReadyTasks(trackId, { limit: READY_SET_CEILING }),
          client.tracks.listTasks(trackId),
          client.tracks.listTaskEdges(trackId)
        ]);

        // 🔴 THE UNION OF BOTH HALVES, NEVER `workable` ALONE. This report is
        // the BLOCKER axis: it explains every open row the ready set does not
        // offer. A `waiting` row is not blocked — every one of its blockers is
        // satisfied and it is simply somebody else's turn — so feeding only the
        // workable half would put every owner-parked row into the unready set and
        // invent a blocker for it. The answer would be well-formed, plausible and
        // wrong, and nothing would go red.
        //
        // `nextOwner` and blocker state are two axes, exactly as the claim axis
        // and this one already are; this composition reads the blocker axis, so it
        // takes every row the server considers ready.
        const serverReadyIds = [...ready.workable, ...ready.waiting].map((row) => row.id);
        const report = explainUnreadyTasks(
          plan.tasks,
          edges.edges,
          serverReadyIds,
          // 🔴 THE WIRE FIELD, NOT A LENGTH INFERENCE. `>= READY_SET_CEILING`
          // answers "did I get everything I ASKED for", never "is there more",
          // and the two diverge the moment the server clamps below the request.
          // The probe deliberately reads one row past the page and exceeds the
          // server's own max by one, so `hasMore` is trustworthy exactly AT the
          // ceiling — which is where the inference was weakest.
          //
          // READY_SET_CEILING STAYS: it is the limit this call REQUESTS, on the
          // line above. Only the truncation claim moved to the wire.
          ready.hasMore
        );

        printEnvelope(
          {
            trackId,
            // The caveat travels in the DOCUMENT, not only on the terminal. A
            // script is the caller most likely to read this as authoritative.
            reconstruction: RECONSTRUCTION_CAVEAT,
            serverReadyIds,
            ...report
          },
          () => renderWhyNotReady(report, serverReadyIds)
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
