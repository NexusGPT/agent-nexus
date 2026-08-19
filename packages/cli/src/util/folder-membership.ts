/**
 * Fold a folder-list response's `assignments[]` into a per-folder count.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * A FOLDER ROW CARRIES NO MEMBERSHIP, WHICH IS WHY THE TABLE LOOKED COMPLETE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The folder-list routes all answer `{folders, assignments}`, and every one
 * of the `folders` rows is `{id, name, parentId, …}` with nothing in it about
 * what is filed inside. So a table of those rows renders every column the row
 * has, looks finished, and answers none of the questions a folder is FOR.
 *
 * `--json` now carries the whole response, so the pairs themselves are one `jq`
 * away. The count is what a terminal can add on top: it fits a row, it needs no
 * second request, and it is the difference between "these folders exist" and
 * "this one is empty and that one holds eleven".
 *
 * ⚠️ It counts ASSIGNMENTS, not distinct members, and it counts what THIS
 * RESPONSE carries. Both are the same statement: the number is a fold of the
 * document beside it, so a reader who distrusts it can re-derive it from the
 * same `--json` output rather than from a second call that may disagree.
 *
 * Nesting is NOT rolled up. A parent folder's count is its own assignments, not
 * its children's — anything else would report a number that appears in no field
 * of the response and is not re-derivable from one.
 *
 * 🚨 BOTH ARRAYS ARE ACCEPTED AS `undefined` EVEN THOUGH THE SDK TYPES DECLARE
 * THEM REQUIRED, AND THAT IS ABOUT THE SERVER, NOT ABOUT THE TYPE. An installed
 * CLI talks to whatever version is deployed — the reason this package ships a
 * response-contract reporter at all. A route that answers without `assignments`
 * makes `for (… of assignments)` throw a TypeError, so the terminal would print
 * a stack trace for a folder list the server answered perfectly well. Absent
 * membership is zero membership; it is not a crash.
 *
 * ⚠️ It degrades the COUNT, never the document. `printEnvelope` has already
 * emitted the untouched response by the time this runs under `--json`, so a
 * caller still sees exactly what the server sent, missing key and all.
 */
export function withMemberCounts<F extends { id: string }, A extends { folderId: string }>(
  folders: readonly F[] | undefined,
  assignments: readonly A[] | undefined
): (F & { members: number })[] {
  const counts = new Map<string, number>();
  for (const assignment of assignments ?? []) {
    counts.set(assignment.folderId, (counts.get(assignment.folderId) ?? 0) + 1);
  }

  return (folders ?? []).map((folder) => ({ ...folder, members: counts.get(folder.id) ?? 0 }));
}
