/**
 * THE TRIGGER RESPONSE — its own module because it is the one deployment
 * envelope whose arms a caller must switch on, and the only one that reaches
 * the approval surface.
 *
 * Split out of `vibe-wire-types.ts`, which re-exports every name below, so no
 * import site moved. Re-declared rather than imported for the reason that file
 * gives: the CLI ships standalone and `@nexus/types` is not a runtime
 * dependency. `vibe-deployment-trigger-wire-types.conformance.ts` is the gate.
 */

import type { VibeApprovalRequestDto } from "./vibe-approval-wire-types";
import type { VibeBuildJobDto, VibeDeploymentDto } from "./vibe-deployment-wire-types";

/**
 * Trigger response — discriminated on `status`, mirroring
 * `TriggerVibeDeploymentResponseSchema`. BOTH arms come back on a 2xx: an
 * org over its usage SOFT cap is ASKED whether to spend, never refused, so
 * `confirmation_required` is a normal success body and not an HTTP error.
 */
export type TriggerDeploymentResponse =
  | {
      /// `created` wrote a new deployment. `reused` found this app's newest
      /// deployment already in flight for the same commit and returned it
      /// untouched — nothing was written, not even a version number. Same
      /// fields either way, so a caller that only wants its deployment reads
      /// `.deployment` off both.
      status: "created" | "reused";
      deployment: VibeDeploymentDto;
      buildJob: VibeBuildJobDto;
      approvalRequest: VibeApprovalRequestDto | null;
    }
  | {
      status: "confirmation_required";
      reason: { costSafetyStatus: string; message: string };
    };
