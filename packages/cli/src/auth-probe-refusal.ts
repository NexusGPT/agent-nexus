import type { CredentialProbe } from "./auth-probe-outcome";

/** A probe outcome, as the arguments `reportFailure` takes. */
export interface ProbeRefusal {
  readonly cause: "not-authenticated" | "connection-failed" | "timed-out" | "remote-error";
  readonly message: string;
  readonly hint?: string;
}

/**
 * Turn a failed probe into the refusal it means, naming the profile and the host.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE MESSAGE CARRIES THE PROFILE AND THE BASE URL ON PURPOSE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Under `--json` a failure is the error document and NOTHING ELSE — one document
 * on stdout is a STABLE promise of this CLI. So the profile name and the host,
 * which the success document reports as fields, have nowhere else to go on the
 * one path where the reader needs them most: "some key is dead" is not
 * actionable, and "the key in profile X, against host Y, is dead" is.
 *
 * A key that is dead against production and live against staging is the exact
 * confusion this sentence removes.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `skipAdvice` IS REQUIRED, AND `null` IS A REAL ANSWER.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The three UNJUDGED outcomes want to tell the reader how to get past the check.
 * That advice is a property of THE VERB THEY RAN, not of the probe: `auth status`
 * declares `--no-verify` and `auth whoami` does not.
 *
 * This helper hardcoded ", or re-run with --no-verify" and both verbs shared it,
 * so a network failure from `whoami` pointed at a flag commander rejects — a
 * hint that sends the reader to an error. Found by review, on a helper extracted
 * to REMOVE drift: sharing correct code moves the caller-specific parts into the
 * shared copy, where they silently become wrong for the caller that differs.
 *
 * So the caller passes its own sentence, or `null` for "this verb offers no way
 * to skip". Required rather than optional, because a new caller that never
 * thought about it would otherwise inherit `status`'s flag by default — which is
 * exactly the defect, restored by omission.
 *
 * @param probe a NON-verified outcome. `verified` is not a refusal and returns
 * `null`, so a caller that forgets to branch gets a type error rather than a
 * refusal describing a success.
 * @param skipAdvice a clause naming how THIS command skips the check, already
 * worded to follow a comma — or `null` when it cannot be skipped.
 */
export function refusalForProbe(
  probe: CredentialProbe,
  profileName: string,
  baseUrl: string,
  skipAdvice: string | null
): ProbeRefusal | null {
  const where = `profile "${profileName}" against ${baseUrl}`;
  // Built once so every unjudged hint ends the same way, and so a verb with no
  // skip route simply gets the sentence without the clause.
  const orSkip = skipAdvice === null ? "" : `, or ${skipAdvice}`;

  switch (probe.outcome) {
    case "verified":
      return null;
    case "no-key":
      return {
        cause: "not-authenticated",
        message: `No API key stored in ${where}.`,
        hint: "Run: nexus auth login"
      };
    case "rejected":
      return {
        cause: "not-authenticated",
        message: `The API key in ${where} was rejected (HTTP ${String(probe.status)}) — it is invalid, expired or revoked.`,
        hint: "Run: nexus auth login"
      };
    case "remote-error":
      return {
        cause: "remote-error",
        message: `Could not verify the key in ${where}: the server answered HTTP ${String(probe.status)}.`,
        hint: `The credential was not judged. Try again${orSkip}.`
      };
    case "unreachable":
      return {
        cause: "connection-failed",
        message: `Could not reach ${baseUrl} to verify the key in profile "${profileName}".`,
        // Named apart from a rejection deliberately — the reader must not go and
        // fetch a new key because their network is down.
        hint: `The credential was not judged. Check your connection${orSkip}.`
      };
    case "timed-out":
      return {
        cause: "timed-out",
        message: `Timed out verifying the key in ${where}.`,
        // Naming the flag rather than a number: the deadline is the caller's, so
        // a duration written here would be wrong the moment anyone passes one.
        // `--timeout` is a GLOBAL flag, so it is safe to name for every caller —
        // unlike the skip advice, which is per-verb.
        hint: `The credential was not judged. Raise --timeout <seconds>${orSkip}.`
      };
  }
}
