import type { ListTracksResponse } from "@agent-nexus/sdk";

import { color, printTable } from "../../output";
import {
  trackListNextPageCommand,
  type TrackListPageFlags
} from "../../util/track-list-next-page-command";

/** The human rendering of `nexus tracks list` — silent under `--json`. */
export function renderTrackList(result: ListTracksResponse, opts: TrackListPageFlags): void {
  // 🔴 `ARCHIVED` IS A COLUMN RATHER THAN A FLAG-CONDITIONAL ONE.
  // Under `--archived include` the page mixes live and archived rows,
  // and without this column they are indistinguishable — which would
  // make the one mode that exists for recovery the one that cannot tell
  // you what to recover. A column that appears only under some flags is
  // worse: the header moves, and a script reading a fixed layout breaks
  // on a flag it did not pass. `CURRENT STEP` gives up 10 characters to
  // pay for it. Found by bugbot on #4146.
  printTable(result.tracks, [
    { key: "number", label: "#", width: 6 },
    { key: "slug", label: "SLUG", width: 28 },
    { key: "title", label: "TITLE", width: 40 },
    { key: "status", label: "STATUS", width: 13 },
    { key: "archivedAt", label: "ARCHIVED", width: 12 },
    { key: "nextOwner", label: "WAITING ON", width: 12 },
    { key: "currentStep", label: "CURRENT STEP", width: 30 },
    { key: "id", label: "ID", width: 38 }
  ]);

  // 🔴 THE PAGE FOOTER IS THE ONLY THING THAT SAYS THE PAGE WAS CUT.
  // `--limit` defaults to 50 SERVER SIDE, so a table of fifty rows is
  // what both a full page and a complete set look like — the read is
  // truncated for a caller who passed no flag at all, and the terminal
  // channel had nothing that distinguished the two. `total`, `hasMore`
  // and `nextCursor` have been on the wire the whole time and only
  // `--json` could see them, which put the recovery path behind the
  // one channel a person is not using.
  //
  // "row(s)" rather than a pluralised noun: this line renders at n=1
  // as readily as at n=50, and a `plural()` that swaps the noun and
  // leaves the verb is a bug this namespace has already shipped once.
  //
  // Human channel only — `printEnvelope` does not run this callback
  // under `--json`, where the three fields are already in the
  // document, so a script's answer cannot be contaminated by it.
  console.log(color.dim(`\n${result.tracks.length} of ${result.total} matching row(s) shown.`));
  if (result.hasMore && result.nextCursor !== null) {
    // The command a reader runs next, spelled out. A `nextCursor` a
    // caller can see and cannot use is what this command shipped with:
    // the token was in the document and no flag accepted it.
    //
    // 🔴 BUILT, NEVER INTERPOLATED HERE. The cursor fingerprints the
    // filters and the token contains `*`, so the naive one-line form
    // is refused by the server after any filtered page and by zsh on
    // every unfiltered one. `track-list-next-page-command.ts` owns both
    // reasons and is unit-tested against them.
    console.log(color.dim(`  The rest:\n    ${trackListNextPageCommand(opts, result.nextCursor)}`));
  }
}
