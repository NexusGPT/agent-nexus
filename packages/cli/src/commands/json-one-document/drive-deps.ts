import type { Command } from "commander";

/**
 * Commander must THROW rather than exit, on every node of the tree.
 *
 * `exitOverride()` on the root is not enough: commander copies inherited
 * settings when a subcommand is CREATED, and this tree is already built by the
 * time the scan sees it. A missed node calls `process.exit` and takes the whole
 * test worker with it, which reads as a crashed suite rather than as one
 * unmeasured command.
 */
/**
 * Capture commander's own output, and CHANGE NOTHING ELSE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS FUNCTION USED TO INSTALL THE REFUSAL FUNNEL, AND THAT MADE THE GATE
 *    UNABLE TO SEE THE FUNNEL BEING REMOVED.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Proven by mutation: deleting `installArgumentRefusalReporting(program)` from
 * `buildRootProgram` left all 30 tests GREEN, because the scan was installing
 * its own copy a line later. The gate proved the installer WORKS and proved
 * nothing about it being WIRED — a distinction worth exactly the 41 commands
 * that depend on the wiring.
 *
 * So the scan installs nothing. It drives the real root program as built, and
 * `process.exit` is neutralised in {@link driveOne} instead — which is the only
 * thing that ever needed neutralising.
 *
 * Commander's refusal text goes to the CAPTURED stderr rather than to the floor:
 * dropping it made "refused with a message" and "refused in silence"
 * indistinguishable, which is exactly the distinction clause 2 turns on.
 */
export function captureCommanderOutput(command: Command, onStderr: (text: string) => void): void {
  command.configureOutput({ writeOut: () => {}, writeErr: onStderr });
  for (const child of command.commands) captureCommanderOutput(child, onStderr);
}

/**
 * The command called `process.exit`, which a spec must never actually do.
 *
 * Carrying the CODE matters: commander exits 0 for `--help` and non-zero for a
 * refusal, and the second is the one that means "nothing reached stdout".
 */
export class ProcessExitCalled extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
    this.name = "ProcessExitCalled";
  }
}

export const RUN_BUDGET_MS = 8_000;

export interface DriveDeps {
  /** Fresh root program per run — commander stores parsed values on the tree. */
  readonly buildProgram: () => Command;
  readonly sandboxDir: string;
  /**
   * Requests the stubbed seams were asked to make, since {@link resetRequests}.
   *
   * The TEST owns the stubs, so the test owns this counter. The scan only reads
   * it — a scan that stubbed its own seams would be measuring itself.
   */
  readonly requestCount: () => number;
  readonly resetRequests: () => void;
}
