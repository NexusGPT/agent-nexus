import type { Command } from "commander";

/** What one driven candidate did. */
export interface CandidateRun {
  readonly leaf: string;
  readonly argv: readonly string[];
  /** The command reached `confirmDestructive`. A FACT on the call, never a flag. */
  readonly asked: boolean;
  /** Requests the stubbed seams were asked to make AFTER the refusal was available. */
  readonly requests: number;
  readonly exitCode: number | undefined;
  /** Commander refused the harness's own argv — a harness fault, never a finding. */
  readonly refusedByCommander: boolean;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export interface CandidateDeps {
  /** Fresh root program per run — commander stores parsed values on the tree. */
  readonly buildProgram: () => Command;
  readonly sandboxDir: string;
  /** Whether `confirmDestructive` was entered since the last reset. Owned by the TEST. */
  readonly wasAsked: () => boolean;
  readonly requestCount: () => number;
  readonly reset: () => void;
}
