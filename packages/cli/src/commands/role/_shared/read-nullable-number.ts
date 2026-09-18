/**
 * Parse a `--flag <value|none>` into `number | null`.
 *
 * 🚨 THE WHOLE JOB MODEL IS REQUIRED-AND-NULLABLE, and `null` is not `0`. `null`
 * means "no override / unset"; `0` asserts a measured zero. Both are accepted by
 * the server and they produce different money, so nothing downstream will tell an
 * operator which they meant. `none` is the token this CLI invents for `null`,
 * because an omitted flag cannot express it on a PUT that requires the field.
 */
export function readNullableNumber(raw: string, flag: string): number | null {
  if (raw === "none" || raw === "null") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${flag} must be a finite number, or "none" to unset it. Got "${raw}".`);
  }
  return value;
}
