import type { CategorizedCliError } from "../exit-codes";

/** Why the direct engine cannot run for this scope on this machine, known before anything is installed. */
export type DirectLocalBlock = "raw-api-key" | "no-organization" | "renewal-line";

/** A local answer, or the refusal and its reason — returned, so `auto` can fall back instead. */
export type Blocked = {
  readonly ok: false;
  readonly block: DirectLocalBlock;
  readonly refusal: CategorizedCliError;
};
