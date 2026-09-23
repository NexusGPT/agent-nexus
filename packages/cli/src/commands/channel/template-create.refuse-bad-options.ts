import { refuse } from "../../errors";
import type { TemplateCreateOptions } from "./template-create.options";

/**
 * The flag combinations `create` cannot act on, refused before anything is read
 * from disk or sent to Twilio.
 *
 * Returns the exit code to adopt, or `null` when the flags are coherent. A code
 * rather than a thrown error because each of these is the operator's typo and
 * not a failure of the command — `refuse` has already said which one on stderr.
 *
 * These are the checks commander itself cannot express: `--body` and
 * `--body-file` are each optional alone and exactly one is required, and
 * `--category` is mandatory only in the presence of `--submit`.
 */
export function refuseBadTemplateCreateOptions(opts: TemplateCreateOptions): number | null {
  if (!opts.body && !opts.bodyFile) {
    return refuse("Either --body or --body-file is required.");
  }
  if (opts.body && opts.bodyFile) {
    return refuse("Cannot use both --body and --body-file.");
  }
  if (opts.submit && !opts.category) {
    return refuse("--category is required when using --submit.");
  }
  return null;
}
