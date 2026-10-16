/**
 * THE ONE PLACE THIS CLI ASKS "IS THIS CREDENTIAL GOOD", AND THE ONLY PLACE THAT
 * DECIDES WHAT THE ANSWER MEANS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A STATUS VERB THAT EXITS 0 OVER A DEAD KEY IS WORSE THAN NO STATUS VERB.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus auth status` read local config, found a key, and exited `0` — over a
 * key the API had already stopped accepting. Measured: a stored key pointed at
 * production, `auth status` reported success, and the 63 API calls that followed
 * all failed on auth. A preflight gated on that exit code passed and then
 * watched everything behind it break.
 *
 * That is the expensive shape, not merely a useless one. The verb's whole
 * purpose is to answer "is my credential good"; answering `0` when it is not
 * converts "your key is dead" — a one-command fix — into "something else is
 * wrong", and the debugging time goes somewhere the defect is not.
 *
 * ── WHY THE PROBE IS ITS OWN MODULE ──────────────────────────────────────────
 *
 * `auth whoami` already got this right, in its own copy: it called `/me`, mapped
 * 401/403 to a refusal, and refused to print "Authenticated." on a network
 * error. `auth status` had no copy at all. The cure for one verb being wrong is
 * not a second private copy of the correct logic — two copies of a security
 * answer are two things to drift, and the drift is silent in the direction that
 * reads as fine.
 *
 * So both verbs call {@link probeCredential} and neither owns the mapping. A
 * change to what "rejected" means reaches both, or it reaches neither.
 *
 * ── THE THREE CONCERNS, EACH IN ITS OWN LEAF ─────────────────────────────────
 *
 * | what                                   | where                      |
 * | -------------------------------------- | -------------------------- |
 * | what an answer MEANS, and why five     | `auth-probe-outcome.ts`    |
 * | the ASK — transport seam, at most 2 GETs | `auth-probe-request.ts`  |
 * | an unjudged answer → the refusal to print | `auth-probe-refusal.ts` |
 *
 * This file declares nothing of its own, deliberately: `import/no-cycle` is
 * armed on this package and a shared value declared in a re-export index costs
 * one warning per leaf that imports it back.
 */

export { type CredentialProbe, type LiveIdentity } from "./auth-probe-outcome";
export { type ProbeRefusal, refusalForProbe } from "./auth-probe-refusal";
export {
  AUTH_PROBE_DEFAULT_TIMEOUT_MS,
  probeCredential,
  type ProbeFetch
} from "./auth-probe-request";
