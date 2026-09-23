/** Statuses from which a deployment will never become live under its own power. */
export const TERMINAL_FAILURES: ReadonlySet<string> = new Set(["FAILED", "ROLLED_BACK"]);

/**
 * An approval outcome that will never become a deployment. The gate itself is
 * terminal even though the DEPLOYMENT's status is not — see
 * `watch-deployment.ts`.
 */
export const REFUSED_APPROVALS: ReadonlySet<string> = new Set(["REJECTED", "EXPIRED"]);
