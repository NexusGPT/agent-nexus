import type { ListReadyTrackTasksResponse } from "@agent-nexus/sdk";

import { color } from "../../../output";

/**
 * The two footers under `nexus tracks task ready`'s tables, verbatim.
 *
 * 🔴 THE TABLES DELIBERATELY DID NOT COME WITH THEM. `envelope-narrowing.scan.ts`
 * reads the `printEnvelope(response, …)` cure LEXICALLY — `insideEnvelopeCallback`
 * walks up the AST — so a `printTable` moved into a named function outside that
 * callback stops being exempt and is reported as dropping every response key the
 * new function does not happen to read. Measured on this very split: both
 * `printTable` calls came back as "drops hasMore, tasks" with the document
 * unchanged. So the callback stays where the scan can see it, and only these
 * two comment-heavy `if` blocks — which call no printer at all — move out, which
 * is what brings the registrar under the 80-line function cap.
 */
export function renderReadyTaskFooters(result: ListReadyTrackTasksResponse, trackId: string): void {
  // 🔴 AN EMPTY READY SET AND A FINISHED BOARD RENDER IDENTICALLY, and
  // that is the whole complaint this pointer answers: a board at
  // 127 of 156 with 29 rows open answers ZERO here and reads as nearly
  // done. Nothing else on this surface said where to look.
  //
  // 🔴 IT ASKS ABOUT `workable` ALONE, WHICH IS THE QUESTION A CALLER
  // STANDING HERE HAS — "is there anything for me". A board whose every
  // ready row is parked on a person offers the agent NOTHING, and that is
  // exactly a case somebody needs to be told about rather than one to
  // suppress because the second table happens to be non-empty.
  //
  // ⚠️ IT IS A POINTER, NOT A DIAGNOSIS — deliberately. Deciding whether
  // rows remain open needs the whole plan, which is a SECOND call on the
  // hot path of an autonomous loop that reads this route in a cycle. So
  // the hint costs one line and no request, and the command it names is
  // the one that pays for the answer.
  //
  // Human channel only: `printEnvelope` does not run this callback under
  // `--json`, so a script's document cannot be contaminated by it.
  if (result.workable.length === 0) {
    console.log(
      color.dim(
        `\nNothing is offered. That reads the same whether the board is finished or stuck —\n` +
          `  nexus tracks task why-not-ready ${trackId}`
      )
    );
  }

  // 🔴 A SEPARATE `if`, NEVER AN `else if`. "Nothing is offered" and "not
  // everything is shown" are different questions with different answers,
  // and chaining them would drop one. They are mutually exclusive only
  // because `clampReadySetLimit` floors the page at 1 — a property of the
  // SERVER, which has no business being encoded as control flow here.
  //
  // This is the route where truncation is reachable today: one production
  // track holds 165 tasks against a default page of 50.
  //
  // No denominator and no repeated ceiling, for the reasons `tracks ready`
  // gives. Silent when `hasMore` is false.
  if (result.hasMore) {
    // 🔴 THE SUM IS PRINTED HERE AND NOWHERE ELSE, and here it is the
    // right number: this line is about the PAGE, and the page is one
    // query over both halves. Everywhere a caller decides what to do,
    // `workable` is the count.
    //
    // The server sorts workable rows to the front, so the rows that fell
    // off are `waiting` ones unless `workable` alone filled the page —
    // which is what makes "raise --limit" honest advice rather than a
    // shrug.
    const shown = result.workable.length + result.waiting.length;
    console.log(
      color.dim(`\n${shown} row(s) shown. MORE ROWS ARE READY — raise --limit and re-read.`)
    );
  }
}
