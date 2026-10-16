import type { SurfaceTier } from "./cli-surface.model";

/**
 * WHAT EACH TIER PROMISES, TRANSCRIBED FROM `COMPATIBILITY.md`.
 *
 * Two tables rather than one, because a tier decides two different things: who
 * owes a cycle, and what a green verdict says when nobody does. Keyed
 * exhaustively on `SurfaceTier`, so a new tier cannot default into either
 * answer.
 */

/** Whether a tier owes a cycle at all. Transcribed from COMPATIBILITY.md. */
export const OWES_A_CYCLE: Readonly<Record<SurfaceTier, boolean>> = {
  // "removing a command … is a break", and a break ships announced.
  STABLE: true,
  // "These may change in any release, without a changelog entry."
  UNSTABLE: false,
  // "No promise. … we will change them without telling anyone."
  INTERNAL: false
};

/** The sentence for a tier that owes nothing, so a green verdict still says why. */
export const NO_PROMISE: Readonly<Record<SurfaceTier, string>> = {
  STABLE: "",
  UNSTABLE: "UNSTABLE — COMPATIBILITY.md permits a change in any release, without notice.",
  INTERNAL: "INTERNAL — COMPATIBILITY.md makes no promise about this leaf at all."
};
