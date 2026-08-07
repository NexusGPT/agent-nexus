/**
 * Split a comma-separated `--…-ids` flag into the array the API expects.
 *
 * Trims each entry and drops empty ones, so `"a, b,"` and `"a,b"` send the same
 * thing. An EMPTY value yields `[]` rather than an error, because on the
 * surfaces that take one — a user group's membership, a revoke's cascade list —
 * an empty array is a meaningful instruction ("no members", "cascade to
 * nobody") and is not the same request as omitting the flag.
 *
 * Callers must therefore branch on `undefined` themselves rather than on
 * falsiness: `opts.userIds !== undefined ? parseIdList(opts.userIds) :
 * undefined`. Testing `opts.userIds ?` would turn `--user-ids ""` back into
 * "field omitted", which is a different request.
 */
export function parseIdList(raw: string): string[] {
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}
