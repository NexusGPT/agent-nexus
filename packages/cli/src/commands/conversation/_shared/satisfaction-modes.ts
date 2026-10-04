import type { SatisfactionMode } from "@agent-nexus/sdk";

// `satisfies readonly SatisfactionMode[]` forces this runtime tuple to track
// the SDK type 1:1 — a future mode (e.g. "none") added to the SDK union without
// updating this array becomes a compile error instead of a silent CLI gap.
export const SATISFACTION_MODES = [
  "latest",
  "all",
  "summary"
] as const satisfies readonly SatisfactionMode[];
