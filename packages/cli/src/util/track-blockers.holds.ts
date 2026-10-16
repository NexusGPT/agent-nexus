import { isDone, type PlanIndex } from "./track-blockers.plan-index";
import type { BlockerTaskRow, HoldingBlocker } from "./track-blockers.types";

/**
 * Every unsatisfied blocker holding ONE open work leaf.
 *
 * ⚠️ COMPOSING ON A TASK'S OWN EDGES ALONE UNDER-REPORTS. Reading only the edges
 * that name the task itself as `blockedTaskId` misses every edge hung on an
 * ancestor, which is the natural shape a plan import produces and the shape the
 * production report was about. So the scope is the task AND its ancestor chain,
 * and `HoldingBlocker.viaAncestorTaskId` is that difference, named on every row
 * it applies to.
 *
 * One blocker is reported ONCE however many ids in that scope name it: two edges
 * naming the same unfinished row are one reason, not two.
 */
export function blockersHolding(task: BlockerTaskRow, plan: PlanIndex): HoldingBlocker[] {
  const blockers: HoldingBlocker[] = [];
  const scope = [task.id, ...(plan.chains.get(task.id) ?? [])];
  const seenBlockers = new Set<string>();

  for (const namedId of scope) {
    for (const edge of plan.edgesByBlocked.get(namedId) ?? []) {
      if (seenBlockers.has(edge.blockerTaskId)) continue;
      const blocker = plan.byId.get(edge.blockerTaskId);
      const hold = plan.holdOf(blocker);
      if (hold === null) continue;

      seenBlockers.add(edge.blockerTaskId);
      const viaAncestorTaskId = namedId === task.id ? null : namedId;
      // Branched on the ROW's absence rather than on a nullish title: an edge
      // pointing outside the plan is a different fact from a row whose title
      // happens to be blank, and a `??` fallback would report the second as
      // the first. A blank title is legal here and is rendered as it is.
      blockers.push(
        blocker === undefined
          ? {
              taskId: edge.blockerTaskId,
              title: "(not in this plan)",
              kind: null,
              isWork: false,
              isStructure: false,
              done: false,
              hold,
              viaAncestorTaskId
            }
          : {
              taskId: blocker.id,
              title: blocker.title,
              kind: blocker.kind,
              isWork: plan.isWork(blocker),
              isStructure: plan.isWork(blocker) && !plan.isWorkLeaf(blocker),
              done: isDone(blocker.doneAt),
              hold,
              viaAncestorTaskId
            }
      );
    }
  }

  return blockers;
}
