import { color, isJsonMode } from "../../../output";
import { type VibeTenantClusterStatus } from "../../../vibe-regions";
import { type ProvisionVibeClusterOutcome } from "./vibe-cluster-wire";

/**
 * What to do about a cluster that provision declined to touch.
 *
 * A `Record` over every status, so a new one is a compile error rather than
 * silently inheriting advice written for a different state. Not all of these
 * reach `already_active` today (the server handles absent / PROVISIONING /
 * retired before it gets here) — but which ones do is the SERVER's business,
 * and "nothing to do" is wrong for a cluster mid-teardown: that one needs a
 * re-run once it lands, not a shrug.
 */
export const ALREADY_ACTIVE_ADVICE: Record<VibeTenantClusterStatus, string> = {
  HEALTHY: "Nothing to do — it is serving.",
  UPDATING: "It is converging; nothing to do.",
  // NOT a universal "converges on its own" — that claim is only true for
  // ordinary drift. The reconcile loop retries the SAME failing apply every
  // tick regardless of cause, so a cluster blocked on something outside its
  // own control (e.g. an AWS account quota) retries identically forever with
  // no self-heal possible until that external condition changes. Re-running
  // "provision" here is a deliberate no-op (see the backend use case) —
  // there is no tenant-side lever to force a different outcome, only the
  // reason the loop keeps hitting.
  DEGRADED:
    "It is degraded and the platform retries automatically every few minutes — " +
    "that clears ordinary drift on its own, but NOT a blocker outside the " +
    "cluster's control (e.g. a cloud-provider capacity limit). Run \"nexus apps " +
    'cluster status" for the actual reason (Reason:); if it names a capacity or ' +
    "quota limit, it self-heals once that is raised and needs no action from you " +
    "— contact support if it persists.",
  DISABLING: "It is being torn down. Wait for it to finish, then run this again to revive it.",
  DESTROYING: "It is being destroyed. Wait for it to finish, then run this again for a fresh one.",
  PROVISIONING: "It is already being provisioned — poll with: nexus apps cluster status",
  DISABLED_RETAINED: "It is disabled. Running this again revives it in place.",
  DESTROYED: "It is destroyed. Running this again provisions a fresh one."
};

export function printProvisionOutcome(outcome: ProvisionVibeClusterOutcome, region: string): void {
  if (isJsonMode()) {
    console.log(JSON.stringify({ outcome }, null, 2));
    return;
  }
  // Exhaustive over the outcome union: a new kind is a compile error here
  // rather than a silent "provisioned!" for something that did not happen.
  switch (outcome.kind) {
    case "provisioning":
      console.log(
        outcome.reprovisioned
          ? `Re-provisioning your retired cluster in ${region}.`
          : `Provisioning your cluster in ${region}.`
      );
      console.log(color.dim("It converges on its own — poll with: nexus apps cluster status"));
      return;
    case "already_active":
      console.log(`Your cluster is already ${outcome.status}.`);
      console.log(color.dim(ALREADY_ACTIVE_ADVICE[outcome.status]));
      return;
    default: {
      const exhaustive: never = outcome;
      void exhaustive;
    }
  }
}
