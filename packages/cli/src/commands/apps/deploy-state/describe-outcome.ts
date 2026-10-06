import { color } from "../../../output";
import {
  isVibeDeployStateOutcome,
  type VibeDeployStateOutcome,
  type VibeUnlistedValue
} from "../../../vibe-deploy-state-vocabulary";

/**
 * The words for every listed outcome. A `Record` over the listed set, so an
 * outcome added to `VIBE_DEPLOY_STATE_OUTCOMES` does not compile until it has a
 * meaning here — never a silent fall-through to the unlisted line.
 *
 * Functions, not strings: `color` decides at call time whether to paint.
 */
const OUTCOME_LINES: Readonly<Record<VibeDeployStateOutcome, () => string>> = {
  DEPLOYED: () =>
    `${color.green("DEPLOYED")} ${color.dim("— a deployment exists for this commit; read its status below")}`,
  // Deliberately NOT red. The push landed; this is a configuration answer, and
  // colouring it as a failure sends people hunting a push problem that does not
  // exist.
  RECEIVED_NOT_DEPLOYED: () =>
    `${color.yellow("RECEIVED_NOT_DEPLOYED")} ${color.dim("— the push LANDED and nothing deployed it. Usually: not the app's deploy branch, no app attached to the repo, or deploys refused (a suspended org).")}`,
  NOT_RECEIVED: () =>
    `${color.red("NOT_RECEIVED")} ${color.dim("— no ref on this repo has this commit as its head. Read as 'the platform cannot see it', not 'it was rejected': ref rows record HEADS, so a commit that landed and was then pushed past also reads this way.")}`,
  REF_UNKNOWN: () =>
    `${color.red("REF_UNKNOWN")} ${color.dim("— that ref does not exist on this repo at all; nothing has ever been pushed to it")}`,
  NO_REPOSITORY: () =>
    `${color.red("NO_REPOSITORY")} ${color.dim("— the app has no git project attached, so there is nothing to have received a push. Fix: nexus apps attach-repo")}`
};

/**
 * The one-line meaning of the discriminator.
 *
 * The value alone reproduces the original complaint at a smaller scale: the
 * caller learns a word and still not what happened to their push. Each line
 * says what the platform observed, and — where there is one — what to do.
 *
 * An outcome this binary does not list still prints, as the server's own word:
 * a published binary routinely talks to a backend newer than itself, and the
 * rest of the answer — the deployment, live, served — stands on its own.
 */
export function describeOutcome(outcome: VibeDeployStateOutcome | VibeUnlistedValue): string {
  if (isVibeDeployStateOutcome(outcome)) return OUTCOME_LINES[outcome]();
  return `${outcome} ${color.dim("— outcome not known to this CLI version; upgrade with: npm i -g @agent-nexus/cli")}`;
}
