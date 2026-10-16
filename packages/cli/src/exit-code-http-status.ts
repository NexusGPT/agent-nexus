import { EXIT_CODES } from "./exit-code-table";

/**
 * The ONE HTTP-STATUS-TO-CATEGORY RULE IN THIS PACKAGE.
 *
 * `handleError` (the resource tree) and `handleAdminError` (the admin tree) both
 * call it. Two trees reading one function is the whole point: the admin tree's
 * table was correct and private, and a second copy of a correct table is a
 * second thing to drift.
 *
 * It has a file of its own for the same reason: a rule two trees read is a rule
 * a reader must be able to find without knowing which tree to look in.
 *
 * ⚠️ A STATUS THIS DOES NOT NAME IS `failed`, NOT AN ERROR. 3xx and the odd 4xx
 * reach a CLI so rarely that inventing a category for them would be a guess with
 * a number attached. The error document's `code` still names what happened.
 */
export function exitCodeForHttpStatus(status: number): number {
  if (status === 401) return EXIT_CODES["not-authenticated"];
  if (status === 403) return EXIT_CODES["permission-denied"];
  if (status === 404) return EXIT_CODES["not-found"];
  if (status === 400 || status === 409 || status === 422) return EXIT_CODES["invalid-input"];
  if (status >= 500) return EXIT_CODES["remote-error"];
  return EXIT_CODES.failed;
}
