import { type VibeBuildComputeSize } from "../../../vibe-wire-types";

/**
 * `medium` / `large` -> the wire's `MEDIUM` / `LARGE`.
 *
 * REFUSES anything else rather than coercing, the rule `parseShipGateFlag`
 * keeps: a value quietly read as one of the two would resize the build and
 * print a success line. Case and surrounding whitespace are forgiven.
 */
export function parseBuildSizeFlag(raw: string): VibeBuildComputeSize {
  const normalised = raw.trim().toUpperCase();
  if (normalised === "MEDIUM" || normalised === "LARGE") return normalised;
  throw new Error(
    `Invalid --build-size "${raw}". Expected "medium" (7 GB) or "large" (15 GB, the default).`
  );
}
