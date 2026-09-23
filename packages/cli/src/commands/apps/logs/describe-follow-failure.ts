import type { FollowOutcome } from "./follow-outcome";

/**
 * The message for a follow that ended badly, or `null` when it ended fine.
 *
 * Returned rather than printed so the caller can `throw new Error(...)` and let
 * `handleError` render it — one error shape for the whole CLI, `--json` included,
 * instead of a second printer that would drift from the first.
 */
export function describeFollowFailure(outcome: FollowOutcome): string | null {
  switch (outcome.kind) {
    case "stream-error":
      return `The log stream stopped: ${outcome.message}`;
    case "disconnected":
      // Named as a fact about the CONNECTION, never as a fact about the app.
      // "no more logs" is precisely what this is not.
      return "The log stream ended without closing — the connection dropped. Any lines printed above are what arrived before it did.";
    case "upstream-closed":
    case "interrupted":
      return null;
  }
}
