import { parseBoolFlag } from "./parse-bool-flag";
import { parseJsonFlag } from "./parse-json-flag";
import { parseShipGateFlag } from "./parse-ship-gate-flag";

/**
 * Build the PATCH body from the update flags. Only flags the caller passed
 * become body keys (undefined = leave alone, matching the backend's
 * partial-update contract). Refuses an empty change set client-side so the
 * user gets a clear message instead of the backend's 400.
 */
export function buildAppUpdateBody(cmdOpts: {
  deployBranch?: string;
  description?: string;
  requireApprovals?: string;
  shipGate?: string;
  requireVerification?: string;
  resourceQuotas?: string;
  healthCheck?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (cmdOpts.deployBranch !== undefined) body.deployBranch = cmdOpts.deployBranch;
  if (cmdOpts.description !== undefined) body.description = cmdOpts.description;
  if (cmdOpts.requireApprovals !== undefined) {
    body.requireApprovals = parseBoolFlag(cmdOpts.requireApprovals, "--require-approvals");
  }
  // Refused HERE rather than sent for the server to resolve. The API's rule is
  // that `shipGateMode` wins, which is right for a client sending a new field
  // beside an old one it still populates — but a person typed these two flags,
  // and honouring one while dropping the other leaves the gate in a state they
  // did not choose, with a success message on top.
  if (cmdOpts.shipGate !== undefined && cmdOpts.requireVerification !== undefined) {
    throw new Error(
      "--ship-gate and --require-verification both set the same field and contradict each other. Pass --ship-gate alone (off, warn or enforce); --require-verification cannot reach warn."
    );
  }
  if (cmdOpts.shipGate !== undefined) {
    body.shipGateMode = parseShipGateFlag(cmdOpts.shipGate);
  }
  if (cmdOpts.requireVerification !== undefined) {
    body.requireVerification = parseBoolFlag(cmdOpts.requireVerification, "--require-verification");
  }
  if (cmdOpts.resourceQuotas !== undefined) {
    body.resourceQuotas = parseJsonFlag(cmdOpts.resourceQuotas, "--resource-quotas");
  }
  if (cmdOpts.healthCheck !== undefined) {
    body.healthCheckConfig = parseJsonFlag(cmdOpts.healthCheck, "--health-check");
  }
  if (Object.keys(body).length === 0) {
    throw new Error(
      "Nothing to update. Pass at least one of --deploy-branch, --description, --require-approvals, --ship-gate, --require-verification, --resource-quotas, --health-check."
    );
  }
  return body;
}
