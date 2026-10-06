import {
  isVibeDeployStateResolvedFrom,
  type VibeDeployStateResolvedFrom,
  type VibeUnlistedValue
} from "../../../vibe-deploy-state-vocabulary";

/**
 * How the answered commit was arrived at, as the end of "resolved from …". A
 * `Record` over the listed set, so a way of resolving added to
 * `VIBE_DEPLOY_STATE_RESOLVED_FROM` does not compile until it has words here.
 */
const RESOLVED_FROM_WORDS: Readonly<Record<VibeDeployStateResolvedFrom, string>> = {
  sha: "the sha you named",
  ref: "the ref you named",
  deployBranch: "the app's own deploy branch"
};

/**
 * A way of resolving this binary does not list is printed as the server's own
 * word and claims nothing more — in particular never "you named", since a newer
 * server may have resolved a commit the caller did not name at all.
 */
export function describeResolvedFrom(
  from: VibeDeployStateResolvedFrom | VibeUnlistedValue
): string {
  if (isVibeDeployStateResolvedFrom(from)) return RESOLVED_FROM_WORDS[from];
  return `"${from}" (a resolution this CLI version does not know)`;
}
