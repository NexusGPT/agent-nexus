/**
 * ── WHY STEP 3 IS NOT OPTIONAL ───────────────────────────────────────────────
 *
 * Step 3 is `body-satisfies-required.apply.ts`'s third: BACKFILLING a value the
 * body supplied into the option store, so `opts.<field>` reads the same thing it
 * would have read from the flag.
 *
 * Permitting the command is not the same as making it work, and the difference
 * is silent. A required flag is not always a body field: `access-card create
 * --credential-id` is a URL SEGMENT, read as `opts.credentialId` and interpolated
 * into the path. With the check deferred and nothing backfilled, that command
 * stopped erroring and started sending
 *
 *   POST /api/public/v1/credentials/undefined/cards
 *
 * — a request that is worse than the refusal it replaced, because it looks like
 * the command ran. Measured, not reasoned: the probe that found it asserts on
 * the request that reaches a server, which is why it caught what a check on the
 * CLI's own exit code could not.
 *
 * A URL-segment flag makes this seam ask for a body key the ROUTE never reads —
 * `credentialId` is a path variable, so a body supplying it carries a field the
 * handler has no schema entry for. That is harmless HERE and the reason is a
 * fact about the schema, not a hope: `CreateAccessCardBodySchema` is a plain
 * `z.object`, and zod strips an unknown key rather than refusing it, so
 * `v1-access-cards.controller.ts`'s `.parse(body)` drops the stray field and
 * answers 2xx. A route that ever switches to `z.strictObject` would turn that
 * into a 400 naming a key this seam told the operator to add.
 *
 * Backfilling covers every SCALAR — string, number, boolean — and writes it in
 * the form the flag would have carried, which is always a string. A JSON body
 * legitimately spells an id `{"credentialId":12345}` where the flag would have
 * been `--credential-id 12345`, and the two must reach the action identically.
 *
 * 🚨 CONFINING IT TO `typeof === "string"` REOPENED THE EXACT FAILURE STEP 3
 * EXISTS TO PREVENT, for every non-string scalar. `access-card create --data
 * '{"credentialId":12345,"name":"N"}'` satisfied the requirement (the key is
 * present), backfilled nothing (the value is a number), and sent
 *
 *   POST /api/public/v1/credentials/undefined/cards
 *
 * — the same `undefined` in the same path segment as before, reachable through
 * a body the operator had every reason to think was correct. Measured against a
 * stub server, not reasoned; `body-scalar-reaches-the-action.test.ts` holds it.
 *
 * A COMPOSITE VALUE IS STILL LEFT ALONE, and that is the real distinction — not
 * "is it a string" but "does the flag have a form for it". A body may carry
 * `{"collectionIds":["a","b"]}` where the flag is a comma-separated string;
 * `String(["a","b"])` is a coincidence, not a conversion, and writing an array
 * where an action expects a string turns a clear failure into a `TypeError`.
 * Actions that read such a field must tolerate its absence; the flag path and
 * the body path then differ in TYPE, which is the action's own business and not
 * something this seam can decide for it. `null` is left alone for the same
 * reason it is not missing: the action reads it from the merged body, where it
 * still means what the operator wrote.
 */

/**
 * The value a body field would have had if it had arrived through its flag, or
 * `undefined` when the flag has no form for it.
 *
 * Commander hands an action a string for every value-taking option, so a scalar
 * is converted and a composite is refused. Exported because the invariant this
 * encodes — every scalar reaches the action, no composite is coerced — is the
 * whole of what `body-scalar-reaches-the-action.test.ts` gates.
 */
export function scalarAsFlagValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}
