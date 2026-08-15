/**
 * `nexus admin vibe-deployment …` — the deployment state machine, by hand.
 *
 * Six verbs, one per transition: build-succeeded, await-approval, begin-deploy,
 * mark-healthy, mark-failed and mark-rolled-back. Symmetric to vibe-build-job —
 * same orgId-in-body convention, same admin-http transport, same exit codes.
 *
 * The next stage after a successful build is the USE CASE's decision, not the
 * operator's: it reads the approval-request row and branches to
 * AWAITING_APPROVAL or straight to DEPLOYING. This module only reports it.
 */

import { Command } from "commander";

import { type AdminVibeDeploymentResponse } from "../admin-wire-types";
import { color, printRecord } from "../output";
import { handleAdminError } from "../util/admin-errors";
import { adminRequest } from "../util/admin-http";
import { resolveAdminOpts } from "../util/admin-opts";

export function registerVibeDeploymentCommands(admin: Command, program: Command): void {
  const dep = admin
    .command("vibe-deployment")
    .description(
      "Drive the Vibe deployment state machine (build-succeeded / await-approval / begin-deploy / mark-healthy / mark-failed / mark-rolled-back)"
    );

  dep
    .command("build-succeeded")
    .description(
      "BUILDING → AWAITING_APPROVAL (if approval-request row exists) | DEPLOYING (otherwise). Stamps imageRef on the row in either branch."
    )
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--image-ref <ref>", "ECR image ref the build runner produced")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-deployment build-succeeded 11111111-1111-… \\
      --org org_abc --image-ref ecr/vibe/app:sha-abc123

Notes:
  Next-stage decision is the use case's, not the operator's. The use
  case queries the approval-request row for this deployment:
    - row exists → BUILDING → AWAITING_APPROVAL (waits for reviewer)
    - no row      → BUILDING → DEPLOYING (no approval gate)
  imageRef is stamped on the row in EITHER branch, so the approval
  reviewer sees the actual built image in the dashboard.
`
    )
    .action(async (id: string, cmdOpts: { org: string; imageRef: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/build-succeeded`,
          body: { organizationId: cmdOpts.org, imageRef: cmdOpts.imageRef }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  dep
    .command("await-approval")
    .description("BUILDING → AWAITING_APPROVAL")
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-deployment await-approval 11111111-1111-4111-8111-… \\
      --org org_abc

Notes:
  BUILDING → AWAITING_APPROVAL, forced.
  PREFER "build-succeeded" TO THIS. That verb reads the approval-request row and
  picks AWAITING_APPROVAL or DEPLOYING for itself, and it stamps imageRef on the
  way through. This one parks the deployment without an image, so a reviewer
  opening it sees no image to approve.
  Reach for it when the build's outcome has to be recorded separately from the
  image it produced — QA, or a row that needs holding while something else is
  worked out.
  Takes no image ref, so nothing about the artifact is recorded here.
`
    )
    .action(async (id: string, cmdOpts: { org: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/await-approval`,
          body: { organizationId: cmdOpts.org }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  dep
    .command("begin-deploy")
    .description("BUILDING | AWAITING_APPROVAL → DEPLOYING. Records imageRef on the row.")
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--image-ref <ref>", "ECR image ref the build runner produced")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-deployment begin-deploy 11111111-1111-4111-8111-… \\
      --org org_abc --image-ref ecr/vibe/app:sha-abc123

Notes:
  BUILDING | AWAITING_APPROVAL → DEPLOYING. It accepts BOTH source states, which
  is what makes it the manual override: driving it from AWAITING_APPROVAL puts
  the deployment past the approval gate without a reviewer acting.
  --image-ref is required and is recorded on the row, so this verb decides which
  artifact ships. It is not read back from the build — supply the ref the build
  runner actually produced.
  The rollout itself is not performed here. This records the state the deployer
  acts on; "mark-healthy" is what records that it landed.
`
    )
    .action(async (id: string, cmdOpts: { org: string; imageRef: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/begin-deploy`,
          body: { organizationId: cmdOpts.org, imageRef: cmdOpts.imageRef }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  dep
    .command("mark-healthy")
    .description("DEPLOYING → HEALTHY. ALB swap completed + health checks passed.")
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-deployment mark-healthy 11111111-1111-4111-8111-… \\
      --org org_abc

Notes:
  DEPLOYING → HEALTHY. This RECORDS an outcome; it does not perform or re-check
  one. The ALB swap and the health checks are what the state claims already
  happened, so run it after observing them, never to trigger them.
  It is the verb that ends a deployment successfully, and the row's Color and
  Version columns are what identify which slot is now live.
  Takes no reason and no image ref — a healthy deployment records nothing beyond
  the transition.
`
    )
    .action(async (id: string, cmdOpts: { org: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/mark-healthy`,
          body: { organizationId: cmdOpts.org }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  dep
    .command("mark-failed")
    .description("Terminal failure from BUILDING | AWAITING_APPROVAL | DEPLOYING.")
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--error-reason <text>", "Customer-visible failure rationale (1-2000 chars)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-deployment mark-failed 11111111-1111-4111-8111-… \\
      --org org_abc --error-reason "health checks never passed after ALB swap"

Notes:
  TERMINAL, and reachable from three states — BUILDING, AWAITING_APPROVAL and
  DEPLOYING. It is the one verb that ends a deployment from anywhere before
  HEALTHY, which also makes it the wrong verb for a deployment that DID serve
  traffic: use "mark-rolled-back" for that.
  🚨 --error-reason IS CUSTOMER-VISIBLE. Stored verbatim, 1-2000 characters, and
  required — keep internal hostnames and stack traces out of it.
  It records no image ref, so whatever imageRef the row already carries is what
  the failure is attributed to.
`
    )
    .action(async (id: string, cmdOpts: { org: string; errorReason: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/mark-failed`,
          body: { organizationId: cmdOpts.org, errorReason: cmdOpts.errorReason }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  dep
    .command("mark-rolled-back")
    .description(
      "DEPLOYING | HEALTHY → ROLLED_BACK. Deployer's own post-flip health-check failure path (distinct from cost-safety auto-rollback)."
    )
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--error-reason <text>", "Customer-visible rollback rationale (1-2000 chars)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-deployment mark-rolled-back 11111111-1111-4111-8111-… \\
      --org org_abc --error-reason "5xx rate spiked after the flip"

Notes:
  DEPLOYING | HEALTHY → ROLLED_BACK, and HEALTHY is the state that separates this
  from "mark-failed": a deployment that reached HEALTHY served traffic, so its
  ending is a rollback, not a failure.
  THIS IS THE DEPLOYER'S PATH, NOT THE COST-SAFETY ONE. The automatic rollback
  driven by cost safety is a different mechanism with its own sweep
  ("nexus admin vibe-rollback-sweep trigger"); recording one by hand here does
  not run it, and it does not stop it either.
  🚨 --error-reason IS CUSTOMER-VISIBLE. Stored verbatim, 1-2000 characters, and
  required.
`
    )
    .action(async (id: string, cmdOpts: { org: string; errorReason: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/mark-rolled-back`,
          body: { organizationId: cmdOpts.org, errorReason: cmdOpts.errorReason }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}

function printDeploymentRecord(data: AdminVibeDeploymentResponse): void {
  printRecord(data, [
    { key: "id", label: "Deployment" },
    { key: "vibeAppId", label: "App" },
    { key: "organizationId", label: "Organization" },
    { key: "status", label: "Status", format: formatDeploymentStatus },
    // `versionNumber` beside `color`, because that pairing IS the reason the
    // contract carries both: the version is what a human names a deployment by,
    // the colour is the internal blue/green slot it happens to occupy.
    { key: "versionNumber", label: "Version", format: (v) => `v${String(v)}` },
    { key: "color", label: "Color" },
    { key: "triggerSha", label: "Trigger sha" },
    { key: "imageRef", label: "Image ref", format: (v) => (v === "" ? "—" : String(v)) },
    { key: "errorReason", label: "Error reason", format: (v) => (v == null ? "—" : String(v)) },
    {
      key: "createdByUserId",
      label: "Created by",
      format: (v) => (v == null ? "system" : String(v))
    },
    { key: "createdAt", label: "Created" },
    { key: "updatedAt", label: "Updated" }
  ]);
}

function formatDeploymentStatus(v: unknown): string {
  const status = String(v);
  if (status === "FAILED" || status === "ROLLED_BACK") return color.red(status);
  if (status === "AWAITING_APPROVAL") return color.yellow(status);
  if (status === "HEALTHY") return color.green(status);
  return status;
}
