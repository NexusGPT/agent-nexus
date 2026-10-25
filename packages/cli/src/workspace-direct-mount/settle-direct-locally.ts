import type { MountScope } from "../mount-registry";
import { type AcceptedAwsConfig, directAwsConfig } from "./accepted-aws-config";
import type { Blocked } from "./direct-local-block";
import { type DirectPins, directPins } from "./direct-pins";
import type { MountId } from "./mount-id";

/** `planDirectMount`'s checks that install nothing, returned as `Blocked`, not thrown, so `auto` can fall back. */
export function settleDirectLocally(
  scope: MountScope,
  mountId: MountId
):
  | { readonly ok: true; readonly pins: DirectPins; readonly awsConfig: AcceptedAwsConfig }
  | Blocked {
  const pinned = directPins(scope);
  if (!pinned.ok) return pinned;
  const line = directAwsConfig(mountId);
  if (!line.ok) return line;
  return { ok: true, pins: pinned.pins, awsConfig: line.awsConfig };
}
