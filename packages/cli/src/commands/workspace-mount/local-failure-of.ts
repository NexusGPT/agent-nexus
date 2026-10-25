import { failure } from "../../errors";
import { CategorizedCliError } from "../../exit-codes";

/**
 * Ctrl-C at a question: the person stopped the COMMAND. Its own class, so a
 * caller that turns a refusal into a fallback can tell it from a step that
 * broke and let it through. Exits `interrupted` (130): nothing failed.
 */
export class Interrupted extends CategorizedCliError {}

/**
 * Every failure of the install question or the install itself exits as
 * `local-failed` (9), like the preflight's own refusals: a raw ENOSPC from a
 * write would otherwise reach `handleError` as an unknown error, exit 1 and no
 * hint. The CLI's own refusals pass through untouched; the AbortError of
 * Ctrl-C at the prompt becomes {@link Interrupted}, which exits 130.
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
    if (error instanceof Error && error.name === "AbortError") {
      const stopped = failure("interrupted", `${step} was interrupted. Nothing was mounted.`, hint);
      throw new Interrupted(stopped.category, stopped.code, stopped.message, hint);
    }
    const cause = error instanceof Error ? error.message : String(error);
    throw failure("local-failed", `${step} failed: ${cause}. Nothing was mounted.`, hint);
  }
}
