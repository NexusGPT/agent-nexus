/**
 * The two vocabularies the status-verdict scan is built on.
 *
 * Both are JUDGEMENTS rather than derivations, which is why they are a file of
 * their own: the scan's own header names this list as the half a reader should
 * attack first, and a table nobody can find is a table nobody attacks.
 */

/**
 * Leaf command names that PROMISE A VERDICT.
 *
 * Every one of these is a question a script asks in order to branch. The list is
 * deliberately conservative: a name here that turns out not to judge anything
 * costs a ledger entry saying so, while a judging name left off costs silence.
 */
export const CHECK_VERBS: ReadonlySet<string> = new Set([
  "audit",
  "beat",
  "check",
  "connection-status",
  "coverage",
  "diagnose",
  "doctor",
  "governance",
  "health",
  "lint",
  "ping",
  "poll",
  "probe",
  "ready",
  "setup",
  "status",
  "test",
  "test-auth",
  "test-node",
  "test-payload",
  "test-send",
  "validate",
  "verify",
  "whoami"
]);

/**
 * Field names that carry a VERDICT rather than an attribute.
 *
 * ⚠️ Membership here is not enough on its own — see {@link isVerdictShaped}. The
 * value has to be something a shell can branch on: a boolean, a string, or a list
 * of problems. A `status` that is an HTTP number is not.
 */
export const VERDICT_FIELDS: ReadonlySet<string> = new Set([
  "conflicts",
  "connected",
  "errors",
  "failed",
  "healthy",
  "isConnected",
  "isHealthy",
  "isReady",
  "isValid",
  "issues",
  "live",
  "ok",
  "outcome",
  "passed",
  "problems",
  "reachable",
  "ready",
  "status",
  "success",
  "valid",
  "verdict",
  "verified",
  "warnings"
]);
