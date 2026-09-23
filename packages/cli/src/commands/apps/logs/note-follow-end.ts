import { color, isJsonMode } from "../../../output";
import type { FollowOutcome } from "./follow-outcome";

/**
 * The one note a successful follow prints, on stderr.
 *
 * `upstream-closed` is the tenant gateway hitting its own duration cap. Nothing
 * is wrong and nothing was lost — but a stream that simply stops with no word
 * reads as a hang, so it says so and says what to do. Ctrl-C prints nothing:
 * the user knows what they just did.
 */
export function noteFollowEnd(outcome: FollowOutcome): void {
  if (outcome.kind !== "upstream-closed") return;
  if (isJsonMode()) return;
  console.error(
    color.dim("The gateway closed the follow (its own duration cap). Re-run to keep following.")
  );
}
