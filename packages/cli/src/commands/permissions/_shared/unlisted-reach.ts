import type { UnlistedReach } from "@agent-nexus/sdk";

/**
 * The sentence that stops an empty table being read as "nobody".
 *
 * A `Record` over the union rather than a switch: a value added to
 * `UnlistedReach` is a compile error here until it is given a sentence, where a
 * default arm would quietly print the safest-sounding one — and the safe-sounding
 * answer is exactly the wrong one, because it understates who can reach the
 * resource.
 */
const UNLISTED_REACH_SENTENCES: Record<UnlistedReach, string> = {
  organization:
    "Reach: EVERY MEMBER of the organization. No grant names this resource and its type is open, so the rows above are not the whole answer.",
  type_wide_grant:
    "Reach: also a WILDCARD grant on this resource type, which reaches every resource of the type and names none of them. It is not listed above.",
  nobody: "Reach: the grants listed above, and nothing else."
};

export function describeUnlistedReach(reach: UnlistedReach): string {
  return UNLISTED_REACH_SENTENCES[reach];
}
