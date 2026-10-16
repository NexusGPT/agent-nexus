import { argvWithoutConfirmation } from "./destructive-confirmation.argv";
import type { CandidateDeps, CandidateRun } from "./destructive-confirmation.candidate-run";
import { everyCommand } from "./destructive-confirmation.candidates";
import { driveOne } from "./destructive-confirmation.drive-one";

/**
 * HAND THE EVENT LOOP BACK between candidates.
 *
 * vitest talks to its workers over birpc with a hardcoded 60-second ceiling
 * (`DEFAULT_TIMEOUT = 6e4`) and no config knob. A worker blocked past it never
 * answers its own `onTaskUpdate`, and the run dies with an unhandled
 * `[vitest-worker]: Timeout` naming no test — every test reported PASSED, exit
 * 1. Most of a driven command is synchronous, and awaiting an already-resolved
 * import only drains microtasks; a macrotask is the only thing that reaches the
 * poll phase.
 */
const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

/**
 * Drive every named candidate, once, in one pass.
 *
 * The whole population is driven — obligation set, exemptions and debt alike —
 * because an exemption nobody exercises is an exemption nobody can catch going
 * wrong, in either direction.
 */
export async function runDestructiveConfirmationScan(
  leaves: readonly string[],
  deps: CandidateDeps
): Promise<Map<string, CandidateRun>> {
  const index = new Map(everyCommand(deps.buildProgram()));
  const runs = new Map<string, CandidateRun>();

  for (const leaf of leaves) {
    await yieldToEventLoop();
    const command = index.get(leaf);
    if (command === undefined) continue;

    let run = await driveOne(leaf, argvWithoutConfirmation(leaf, command, deps.sandboxDir), deps);

    // A commander refusal means the action never ran, so the run measured
    // NOTHING — it is not a command that failed to ask. Retry once with every
    // option filled, which is what the deferred-`--body` requirement needs. The
    // gate asserts no run is left in this state, so a shape neither attempt
    // reaches is reported rather than counted as compliant.
    if (run.refusedByCommander) {
      await yieldToEventLoop();
      run = await driveOne(
        leaf,
        argvWithoutConfirmation(leaf, command, deps.sandboxDir, true),
        deps
      );
    }

    runs.set(leaf, run);
  }

  return runs;
}
