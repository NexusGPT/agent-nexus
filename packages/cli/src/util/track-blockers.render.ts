import { color, printTable, printWarning } from "../output";
import {
  type BlockerHold,
  RECONSTRUCTION_CAVEAT,
  type UnreadyTask,
  type WhyNotReadyReport
} from "./track-blockers";

/**
 * The TERMINAL view of {@link WhyNotReadyReport}. The document under `--json`
 * is the report itself and never passes through here.
 *
 * 🔴 THE CAVEAT IS PRINTED, NOT OPTIONAL. Both channels carry the SAME sentence
 * from {@link RECONSTRUCTION_CAVEAT}: an answer that reads as the server's own
 * reason is the one way this command is worse than not existing, because a
 * reader who trusts it stops looking for the real edge.
 */

/**
 * The ceiling the ready-set route clamps to. Asking for it makes the cross-check whole.
 *
 * 🔴 HAND-COPIED, AND PINNED RATHER THAN IMPORTED. The server's own
 * `READY_SET_MAX_LIMIT` lives in `apps/backend` and is not published; the only
 * published form of this number is `.max(200)` inside `ReadySetQuerySchema`, and
 * `wire-types-bundle.test.ts` forbids importing `@nexus/types` anywhere the
 * binary could reach. So the pin lives in `ready-set-ceiling.conformance.ts` and
 * is asserted from BOTH sides by
 * `ready-set-ceiling-matches-the-contract.test.ts` — too high is a 400 on every
 * call, too LOW is silent and makes `why-not-ready` cross-check against a
 * partial ready set. That module also names the one divergence the pin cannot
 * see: `clampReadySetLimit` moving on its own.
 */
export const READY_SET_CEILING = 200;

/** What a hold means, in the words a reader can act on. */
const HOLD_TEXT: Readonly<Record<BlockerHold, string>> = {
  OPEN: "open — tick it",
  SUBTREE_OPEN: "subtree open",
  NO_WORK_BENEATH: "no work beneath",
  UNKNOWN_TASK: "not in this plan"
};

/** One printed line: a held task, and one of the rows holding it. */
interface HoldRow {
  readonly task: string;
  readonly heldBy: string;
  readonly kind: string;
  readonly state: string;
  readonly via: string;
  readonly blockerId: string;
}

function holdRowsOf(unready: readonly UnreadyTask[]): HoldRow[] {
  const rows: HoldRow[] = [];

  for (const held of unready) {
    if (held.reason !== "BLOCKED") continue;
    for (const blocker of held.blockers) {
      rows.push({
        task: held.title,
        heldBy: blocker.title,
        // The question the report was asked: work, or content nobody will tick.
        kind: blocker.kind === null ? "?" : blocker.isWork ? blocker.kind : `${blocker.kind} ⚑`,
        state: HOLD_TEXT[blocker.hold],
        via: blocker.viaAncestorTaskId ?? "—",
        blockerId: blocker.taskId
      });
    }
  }

  return rows;
}

export function renderWhyNotReady(
  report: WhyNotReadyReport,
  serverReadyIds: readonly string[]
): void {
  const rows = holdRowsOf(report.unready);
  const structure = report.unready.filter((row) => row.reason === "STRUCTURE");
  const content = report.unready.filter((row) => row.reason === "CONTENT");

  if (rows.length === 0) {
    console.log(
      color.dim(
        serverReadyIds.length === 0
          ? "No open work leaf is held by an edge. Nothing is being withheld by a dependency."
          : "Nothing is held by an edge — the ready set is not empty."
      )
    );
  } else {
    printTable(rows, [
      { key: "task", label: "OPEN, NOT OFFERED", width: 40 },
      { key: "heldBy", label: "HELD BY", width: 40 },
      { key: "kind", label: "BLOCKER IS", width: 12 },
      { key: "state", label: "STATE", width: 16 },
      { key: "via", label: "VIA ANCESTOR", width: 38 },
      { key: "blockerId", label: "BLOCKER ID", width: 38 }
    ]);
    console.log(
      color.dim(
        "\n⚑ marks a CONTENT row. Content is never offered as work and is released only by " +
          "ticking it,\n  so a blocker marked ⚑ is a row nobody would otherwise close."
      )
    );
  }

  console.log(
    color.dim(
      `\nAlso open and never offered: ${structure.length} structure row(s) whose subtree is the work, ` +
        `${content.length} content row(s).`
    )
  );

  if (report.ancestryLooped) {
    printWarning(
      "A parent chain loops in this plan, so the ancestry walk stopped early.",
      "Some rows below may be explained against an incomplete ancestor list."
    );
  }

  if (report.disagreesWithServer === true) {
    printWarning(
      "This reconstruction and the server name DIFFERENT ready sets.",
      "Neither side is proven right here: the server reads a materialised ancestry column that",
      "does not cross the wire, and this walks parentTaskId. They disagree only when the two",
      "have drifted apart. `nexus tracks task ready` is the authority on what may be picked up."
    );
  }

  console.log(color.dim(`\n${RECONSTRUCTION_CAVEAT}`));
}
