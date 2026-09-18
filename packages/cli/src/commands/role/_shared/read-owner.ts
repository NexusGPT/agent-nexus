/**
 * Resolve `--owner` into what the API expects.
 *
 * `undefined` means "leave ownership alone" and `null` means "clear it", and the
 * two cannot both be expressed by leaving the flag off — so `none` is a token
 * this CLI invents for the second. `none` is not a valid Clerk user id, so it
 * cannot collide with a real one.
 */
export function readOwner(raw: string | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === "none" || raw === "null") return null;
  return raw;
}
