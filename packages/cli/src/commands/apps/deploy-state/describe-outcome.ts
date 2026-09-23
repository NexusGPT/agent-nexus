import { color } from "../../../output";
import type { VibeDeployStateOutcome } from "../../../vibe-wire-types";

/**
 * The one-line meaning of the discriminator.
 *
 * The value alone reproduces the original complaint at a smaller scale: the
 * caller learns a word and still not what happened to their push. Each string
 * below says what the platform observed, and — where there is one — what to do.
 */
export function describeOutcome(outcome: VibeDeployStateOutcome): string {
  switch (outcome) {
    case "DEPLOYED":
      return `${color.green("DEPLOYED")} ${color.dim("— a deployment exists for this commit; read its status below")}`;
    case "RECEIVED_NOT_DEPLOYED":
      // Deliberately NOT red. The push landed; this is a configuration answer,
      // and colouring it as a failure sends people hunting a push problem that
      // does not exist.
      return `${color.yellow("RECEIVED_NOT_DEPLOYED")} ${color.dim("— the push LANDED and nothing deployed it. Usually: not the app's deploy branch, no app attached to the repo, or deploys refused (a suspended org).")}`;
    case "NOT_RECEIVED":
      return `${color.red("NOT_RECEIVED")} ${color.dim("— no ref on this repo has this commit as its head. Read as 'the platform cannot see it', not 'it was rejected': ref rows record HEADS, so a commit that landed and was then pushed past also reads this way.")}`;
    case "REF_UNKNOWN":
      return `${color.red("REF_UNKNOWN")} ${color.dim("— that ref does not exist on this repo at all; nothing has ever been pushed to it")}`;
    case "NO_REPOSITORY":
      return `${color.red("NO_REPOSITORY")} ${color.dim("— the app has no git project attached, so there is nothing to have received a push. Fix: nexus apps attach-repo")}`;
    default:
      // Unreachable per the union, reachable at runtime: a published binary
      // routinely talks to a backend newer than itself, and a value this CLI
      // has never heard of must still print rather than vanish.
      return `${String(outcome)} ${color.dim("— outcome not known to this CLI version; upgrade with: npm i -g @agent-nexus/cli")}`;
  }
}
