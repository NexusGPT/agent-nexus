/**
 * THE ONE READING OF A FAILED NODE TEST'S ERROR PAYLOAD.
 *
 * Separate from the judge so the rule that has to agree with the console lives
 * in one file by itself — `node-test-verdict.ts` carries why the verdict is read
 * from `data` at all.
 */

/**
 * The error payload a failed node test returns, as the two keys that identify it.
 *
 * Read as `unknown` and narrowed here rather than typed on `TestNodeResult.data`,
 * which the SDK declares `unknown` because the success arm is whatever the node
 * produced. A cast would claim a shape nobody verified.
 *
 * ⚠️ TRUTHY, NEVER "THE KEY IS PRESENT". The console's condition is
 * `runOutput?.error || runOutput?.errorDetails`, and the whole justification for
 * this module is that one rule serves both surfaces. A presence test diverges on
 * every falsy value a node can legitimately emit — `{ error: null }` is a common
 * success envelope, and `false`, `0` and `""` are all real outputs — so the
 * screen would read PASS while the CLI exited non-zero for the same run. Neither
 * key alone is safe to demand either: `error` is `errorData.message`, which
 * `toNodeTestErrorData` declares OPTIONAL, and `errorDetails` is the object it
 * always writes beside it.
 */
export function errorMessageIn(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as { error?: unknown; errorDetails?: unknown };

  if (!record.error && !record.errorDetails) return null;

  if (typeof record.error === "string" && record.error !== "") return record.error;

  const details = record.errorDetails;
  if (typeof details === "object" && details !== null) {
    const message = (details as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
  }

  // A failure whose message did not survive is still a failure. Returning `null`
  // here would report the node as PASSED because its error text was malformed,
  // which is the false green in its purest form.
  return "the node reported an error with no message";
}
