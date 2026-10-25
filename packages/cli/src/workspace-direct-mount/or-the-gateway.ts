import { GATEWAY_FALLBACK_FOR } from "../commands/workspace-mount/platform-rules";
import { type MountPlatform, mountPlatformOf } from "./mount-platform";

/**
 * The way out every direct-only refusal ends with: this platform's gateway
 * engine has none of these needs. Named by flag, because `auto` itself may be
 * the mount that was refused (a refusal after the mint cannot fall back).
 */
export function orTheGateway(platform: MountPlatform = mountPlatformOf(process.platform)): string {
  return ` Or mount with --engine ${GATEWAY_FALLBACK_FOR[platform]}: the gateway needs none of this.`;
}
