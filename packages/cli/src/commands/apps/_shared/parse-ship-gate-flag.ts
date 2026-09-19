import { type VibeShipGateMode } from "../../../vibe-wire-types";

/**
 * `off` / `warn` / `enforce` -> the wire's `OFF` / `WARN` / `ENFORCE`.
 *
 * REFUSES anything else rather than coercing, which is the rule `parseBoolFlag`
 * below already keeps for this file's booleans: a value quietly read as `OFF`
 * would switch a gate off and print a success line. Case and surrounding
 * whitespace are forgiven — a shell that hands over `Warn ` has not expressed a
 * different intention — and nothing else is.
 */
export function parseShipGateFlag(raw: string): VibeShipGateMode {
  const normalised = raw.trim().toUpperCase();
  if (normalised === "OFF" || normalised === "WARN" || normalised === "ENFORCE") {
    return normalised;
  }
  throw new Error(
    `Invalid --ship-gate "${raw}". Expected "off", "warn" or "enforce". warn checks the artifacts and ships the deploy anyway; enforce refuses it.`
  );
}
