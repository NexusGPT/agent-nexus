import type { ListReadyTracksResponse } from "@agent-nexus/sdk";

import { color, printTable } from "../../output";

/** The human rendering of `nexus tracks ready` — silent under `--json`. */
export function renderReadyTracks(result: ListReadyTracksResponse): void {
  // 🔴 THE SAME COLUMNS AS `tracks list`, IN THE SAME ORDER, MINUS
  // `STATUS` — which `ready` cannot vary usefully, since a DONE or
  // BLOCKED track is not in this set by construction. Two reads of the
  // same rows printing different columns is how a person learns to
  // trust one and re-run the other.
  //
  // SLUG is the column this table shipped without, and the omission
  // survived putting `slug` on the wire: the row carried it, the human
  // view did not, so the only handle on screen was a number the server
  // mints and an id nobody types. Found by bugbot on #4146.
  printTable(result.tracks, [
    { key: "number", label: "#", width: 6 },
    { key: "slug", label: "SLUG", width: 28 },
    { key: "title", label: "TITLE", width: 40 },
    { key: "nextOwner", label: "WAITING ON", width: 12 },
    { key: "currentStep", label: "CURRENT STEP", width: 40 },
    { key: "id", label: "ID", width: 38 }
  ]);

  // 🔴 A FULL PAGE AND A COMPLETE SET USED TO BE THE SAME OUTPUT. The
  // rows dropped are always the NEWEST tracks — the statement orders by
  // number ascending and a new track takes the highest — so the one you
  // just created is the first to fall off. `hasMore` is the server's own
  // answer, read one row past the page, and it is the only thing that
  // separates the two.
  //
  // NO DENOMINATOR: this route carries no total and no cursor by design,
  // so there is no "x of y" to print. Naming a total the response does
  // not have would be the same over-claim this line exists to remove.
  //
  // The ceiling is NOT repeated here. `--limit`'s own description
  // documents its range, and a third copy of 200 is a third thing to go
  // stale — which is exactly how the signal this renders died quietly
  // before it existed. The footer names the action; the flag names the
  // range.
  //
  // Silent when `hasMore` is false. A footer on a complete set is noise,
  // and worse, it teaches the reader to skim the footer — so on the day
  // it carries the warning it does not get read.
  //
  // Human channel only — `printEnvelope` returns before calling this
  // under `--json`, where `hasMore` is already in the document.
  if (result.hasMore) {
    console.log(
      color.dim(
        `\n${result.tracks.length} row(s) shown. MORE TRACKS ARE READY — raise --limit and re-read.`
      )
    );
  }
}
