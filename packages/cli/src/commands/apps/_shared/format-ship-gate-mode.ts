import { color } from "../../../output";
import { type VibeShipGateMode } from "../../../vibe-wire-types";

/**
 * The `Ship gate` line, one per mode.
 *
 * A `Record` KEYED BY THE UNION, never an if-chain: the field has three states
 * and the row used to render a boolean projection of it, so `WARN` — the state
 * the boolean cannot express — printed as `off` on an app whose every deploy was
 * recording a finding. An if-chain over an enum makes a fourth state fall
 * through to whatever the last branch is, which is the same defect with a new
 * value in it. A missing entry here is a compile error.
 *
 * Each label says what the gate DOES, not what it is called. "off" alone was
 * ambiguous in the other direction too — it says nothing about the repository's
 * artifacts, which may well be green.
 */
export const SHIP_GATE_MODE_LINES: Record<VibeShipGateMode, string> = {
  OFF: "off",
  WARN: color.yellow("warn") + color.dim(" — artifacts are checked and a finding does not block"),
  ENFORCE: "enforce" + color.dim(" — artifacts must be green or the deploy is refused")
};

/**
 * Render a ship-gate mode, including the two cases the union cannot describe.
 *
 * ⚠️ THE `Record` ABOVE IS A COMPILE-TIME GUARANTEE AND THIS BINARY OUTLIVES IT.
 * The CLI ships standalone to npm and is routinely pointed at a backend NEWER
 * than itself, so a mode added upstream arrives at an installed binary whose
 * union has never heard of it. It is echoed rather than mapped — an unrecognised
 * mode printed as one of the three known ones is exactly the lie this function
 * exists to end. Same reflex as `formatDeployability`'s fallback next door,
 * except that one gives up the compile-time check to get the runtime one; the
 * lookup here keeps both.
 *
 * `undefined` is the OPPOSITE skew — a backend one release BEHIND omits the key
 * — and it is never `off`. The gate may be running; this server did not say.
 */
export function formatShipGateMode(mode: VibeShipGateMode | undefined): string {
  if (mode === undefined) return color.dim("not reported by this server");
  if (!Object.prototype.hasOwnProperty.call(SHIP_GATE_MODE_LINES, mode)) {
    return color.yellow(String(mode)) + color.dim(" — a mode this CLI version does not know");
  }
  return SHIP_GATE_MODE_LINES[mode];
}
