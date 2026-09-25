import { failure } from "../../errors";
import { CategorizedCliError } from "../../exit-codes";

/**
 * Every failure of the install question or the install itself exits as
 * `local-failed` (9), like the preflight's own refusals: a raw ENOSPC from a
 * write, or the AbortError of Ctrl-C at the prompt, would otherwise reach
 * `handleError` as an unknown error, exit 1 and no hint. The CLI's own
 * refusals pass through untouched.
 */
export async function localFailureOf<T>(
  step: string,
  hint: string,
  work: () => Promise<T>
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof CategorizedCliError) throw error;
    const cause = error instanceof Error ? error.message : String(error);
    throw failure("local-failed", `${step} failed: ${cause}. Nothing was mounted.`, hint);
  }
}
