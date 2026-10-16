/**
 * The shape rules the `workflow test` / `workflow test-node` body builders share.
 *
 * Declared here rather than in `test-body.ts` so both builders read the SAME
 * coercion: "present but not an object" has to throw in every position, and a
 * second copy of that rule is how one position starts dropping silently again
 * (NEX-2483).
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Coerce a value supplied under a structured key (`triggerData` / `input` /
 * `sampleConfig`) into a plain object. `undefined` / `null` mean "absent". A
 * present-but-non-object value is rejected loudly rather than silently dropped
 * — a silent drop would let the test run against stale stored defaults with no
 * error, the exact failure mode this fix exists to remove (NEX-2483).
 */
export function coerceStructuredObject(
  value: unknown,
  label: string
): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isPlainObject(value)) {
    throw new Error(
      `${label} must be a JSON object, got ${Array.isArray(value) ? "array" : typeof value}`
    );
  }
  return value;
}

/** Treat an empty object as "no payload" so a stored override is preserved. */
export function omitEmpty(
  value: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  return value !== undefined && Object.keys(value).length === 0 ? undefined : value;
}
