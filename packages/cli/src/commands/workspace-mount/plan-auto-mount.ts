import type { WorkspaceKind } from "@agent-nexus/sdk";

import type { MountRecord, MountScope } from "../../mount-registry";
import { printWarning } from "../../output";
import { countPendingUploads } from "../../workspace-direct-mount/count-pending-uploads";
import type { DirectLocalBlock } from "../../workspace-direct-mount/direct-local-block";
import type { InstallPolicy } from "../../workspace-direct-mount/install/install-policy";
import type { MountId } from "../../workspace-direct-mount/mount-id";
import { mountPlatformOf } from "../../workspace-direct-mount/mount-platform";
import { settleDirectLocally } from "../../workspace-direct-mount/settle-direct-locally";
import { settleGatewayMount } from "../workspace-mount-gateway";
import { gatewayCacheDirFor, gatewayPendingUploads } from "./gateway-cache";
import type { GatewayEngine } from "./gateway-mount-request";
import { isReadOnlyKind } from "./is-read-only-kind";
import type { MountPlan } from "./mount-plan";
import { GATEWAY_FALLBACK_FOR } from "./platform-rules";
import { rcloneReadiness } from "./rclone-readiness";

// ── `--engine auto`: direct where it can run, the gateway where it cannot ─────
//
// `auto` never refuses for a reason the gateway does not share: it falls back
// to the platform's gateway engine and says why in one line. The one refusal
// it keeps is the one the gateway would hit too — on Linux and Windows the
// rclone engine needs the same rclone and FUSE layer direct does, so a missing
// one refuses.

/** Why `auto` did not mount direct. */
type FallbackReason =
  | DirectLocalBlock
  | "list-unanswered"
  | "code-workspace"
  | "unsent-rclone-saves"
  | "dependencies";

const FALLBACK_WHY = {
  "raw-api-key":
    "the API key came from --api-key or NEXUS_API_KEY, and direct re-reads a saved one every hour (nexus auth login saves it)",
  "no-organization": "the profile resolves no organization to pin the drive to",
  "renewal-line":
    "this machine's node or CLI path cannot be written into direct's hourly renewal line",
  "list-unanswered":
    "the workspace list did not answer, so the kind is unknown, and direct refuses a CODE workspace",
  "code-workspace": "it is a CODE workspace, read-only, which direct refuses",
  "unsent-rclone-saves":
    "an earlier rclone mount of this drive left saves that only the rclone engine uploads",
  dependencies:
    "rclone or its FUSE layer cannot be used here (--engine direct says why and offers the fix)"
} as const satisfies Record<FallbackReason, string>;

/** What `auto` knows before it plans: the workspace list's answer, and what a dead row left behind. */
export interface AutoMountInput {
  readonly scope: MountScope;
  readonly mountId: MountId;
  readonly policy: InstallPolicy;
  /** False when the list did not answer: the kind is then unknown. */
  readonly listAnswered: boolean;
  readonly storageKind: WorkspaceKind | undefined;
  /** The dead row this mount replaces, if there is one: its rclone cache may hold unsent saves. */
  readonly deadRow: MountRecord | undefined;
  /** True for the admin-shared copy of the slug, which keeps its own rclone cache folder. */
  readonly shared: boolean;
}

/**
 * Saves only the rclone engine uploads: a dead row's, or — when `unmount` kept
 * them and removed the row — the folder this key and copy name.
 */
function unsentRcloneSaves(input: AutoMountInput): number {
  const ofDeadRow = input.deadRow === undefined ? null : gatewayPendingUploads(input.deadRow);
  if (ofDeadRow !== null && ofDeadRow > 0) return ofDeadRow;
  return countPendingUploads(gatewayCacheDirFor({ mountId: input.mountId, shared: input.shared }));
}

/**
 * Settle the platform's gateway engine instead of direct, saying why in one
 * line on stderr — stdout stays the one `--json` document.
 */
function fallBackFromDirect(
  input: AutoMountInput,
  engine: GatewayEngine,
  reason: FallbackReason
): Promise<MountPlan> {
  printWarning(`Mounting through the ${engine} engine, not direct: ${FALLBACK_WHY[reason]}.`);
  return settleGatewayMount(engine, input.policy, input.mountId);
}

/** A reason `auto` knows without touching this machine's software, or null. */
function knownFallback(input: AutoMountInput, fallback: GatewayEngine): FallbackReason | null {
  // A dead direct row already proves the workspace is not CODE: direct refuses CODE at its mint.
  if (!input.listAnswered && input.deadRow?.engine !== "direct") return "list-unanswered";
  if (input.storageKind !== undefined && isReadOnlyKind(input.storageKind)) return "code-workspace";
  // Counted only where the fallback is the engine that uploads them.
  if (fallback === "rclone" && unsentRcloneSaves(input) > 0) return "unsent-rclone-saves";
  return null;
}

/**
 * `--engine auto`, settled before the first mint: what the workspace list and
 * a dead row already say, then direct's local checks, then its rclone and FUSE
 * (the one step that may ask to install) — falling back wherever the gateway
 * engine can do what direct cannot.
 */
export async function planAutoMount(input: AutoMountInput): Promise<MountPlan> {
  const fallback = GATEWAY_FALLBACK_FOR[mountPlatformOf(process.platform)];

  const known = knownFallback(input, fallback);
  if (known !== null) return fallBackFromDirect(input, fallback, known);

  const local = settleDirectLocally(input.scope, input.mountId);
  if (!local.ok) return fallBackFromDirect(input, fallback, local.block);

  // Where rclone is the fallback, a refusal here is final, and the offer is
  // printed as for any engine.
  const needsTheSame = fallback === "rclone";
  const ready = await rcloneReadiness("auto", input.policy, {
    offerWithoutTerminal: needsTheSame
  });
  if (!ready.ok) {
    if (needsTheSame) throw ready.refusal;
    return fallBackFromDirect(input, fallback, "dependencies");
  }
  return {
    engine: "direct",
    mountId: input.mountId,
    pins: local.pins,
    awsConfig: local.awsConfig,
    binary: ready.binary
  };
}
