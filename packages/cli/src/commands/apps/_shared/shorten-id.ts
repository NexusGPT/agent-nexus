/** Render the first 8 chars of an id so the table stays readable. */
/**
 * Shorten an id for DISPLAY ONLY — never for an id the user has to type
 * back.
 *
 * Every `apps` command that takes an id takes the full uuid, and the API
 * rejects anything else. So a shortened id in a list is a trap: it is the
 * only id the reader has, it looks complete enough to copy, and pasting it
 * back fails. Reserve this for ids no command accepts (actor / decider
 * user ids), and print command-argument ids in full.
 */
export function shortenId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}
